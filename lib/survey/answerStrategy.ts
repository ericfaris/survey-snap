import type { AnswerValue, QuestionOption, ReceiptMetadata, StagedQuestion } from '../types';

/**
 * Deterministic, rule-based answer suggestion.
 *
 * Three principles, in order:
 *  1. Factual questions are answered from the receipt.
 *  2. Subjective questions get the most positive option, chosen by LABEL TEXT
 *     (never by numeric value — the 5-point scale's best option is value "5"
 *     while Yes/No's is value "1").
 *  3. Anything unrecognised is left BLANK and flagged `needsUser`. Never guess.
 */

export interface StrategyContext {
  metadata?: Partial<ReceiptMetadata>;
  /** Raw OCR text — used for weak signals like drive-thru detection. */
  ocrText?: string;
}

/** Ranked positive lexicon. Higher wins. */
const POSITIVE_LEXICON: [RegExp, number][] = [
  [/^\s*highly satisfied\s*$/i, 100],
  [/^\s*extremely satisfied\s*$/i, 100],
  [/^\s*very satisfied\s*$/i, 96],
  [/^\s*completely satisfied\s*$/i, 96],
  [/^\s*strongly agree\s*$/i, 95],
  [/^\s*definitely will\s*$/i, 94],
  [/^\s*definitely would\s*$/i, 94],
  [/^\s*excellent\s*$/i, 93],
  [/^\s*very likely\s*$/i, 92],
  [/^\s*extremely likely\s*$/i, 92],
  [/^\s*outstanding\s*$/i, 91],
  [/^\s*satisfied\s*$/i, 80],
  [/^\s*agree\s*$/i, 78],
  [/^\s*probably will\s*$/i, 70],
  [/^\s*likely\s*$/i, 70],
  [/^\s*very good\s*$/i, 70],
  [/^\s*good\s*$/i, 65],
  [/^\s*yes\s*$/i, 60],
  [/^\s*neither\b/i, 20],
  [/^\s*neutral\s*$/i, 20],
  [/^\s*no\s*$/i, 10],
  [/dissatisf/i, -50],
  [/disagree/i, -50],
  [/^\s*poor\s*$/i, -50],
  [/^\s*fair\s*$/i, -10],
];

export function positivityScore(label: string): number {
  for (const [re, score] of POSITIVE_LEXICON) {
    if (re.test(label)) return score;
  }
  return 0;
}

/** Prompts where the *negative*-sounding option is the good answer. */
const NEGATIVE_POLARITY =
  /problem|issue|complaint|wrong|missing|incorrect|dissatisf|difficult|concern|did you have any/i;

export function isNegativePolarity(prompt: string): boolean {
  return NEGATIVE_POLARITY.test(prompt);
}

function findOption(options: QuestionOption[], re: RegExp): QuestionOption | undefined {
  return options.find((o) => re.test(o.label));
}

/** Pick the most positive option by label text. */
export function mostPositiveOption(options: QuestionOption[]): QuestionOption | null {
  let best: QuestionOption | null = null;
  let bestScore = -Infinity;
  for (const o of options) {
    const s = positivityScore(o.label);
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Factual rules keyed on prompt wording. Prompt regexes are hints only. */
function factualAnswer(
  q: StagedQuestion,
  ctx: StrategyContext,
): { value: AnswerValue; needsUser?: boolean } | null {
  const prompt = `${q.groupPrompt ?? ''} ${q.prompt}`.trim();

  // "Did you visit the McDonald's located at <address>?" — we entered this
  // receipt's own code, so the answer is Yes.
  if (/did you visit the mcdonald'?.?s located at/i.test(prompt)) {
    const yes = findOption(q.options, /^\s*yes\s*$/i);
    if (yes) return { value: yes.value };
  }

  if (/was your order (accurate|correct)/i.test(prompt)) {
    const yes = findOption(q.options, /^\s*yes\s*$/i);
    if (yes) return { value: yes.value };
  }

  // Safest default; the user edits if it was a kiosk or the app.
  if (/how did you place your order/i.test(prompt)) {
    const employee = findOption(q.options, /employee at the restaurant/i);
    if (employee) return { value: employee.value };
  }

  // Conservative: answering "Yes" opens a Rewards follow-up branch the user
  // cannot factually answer.
  if (/member of mymcdonald'?.?s rewards/i.test(prompt)) {
    const no = findOption(q.options, /^\s*no\s*$/i);
    if (no) return { value: no.value };
  }

  // Visit type: only answer if the receipt actually says drive-thru.
  if (/please select your visit type|was this visit|visit type/i.test(prompt)) {
    if (ctx.ocrText && /drive.?thru|drivethru|\bD\/T\b/i.test(ctx.ocrText)) {
      const dt = findOption(q.options, /drive.?thru/i);
      if (dt) return { value: dt.value };
    }
    return { value: null, needsUser: true };
  }

  return null;
}

/** Checkbox groups: tick boxes whose label overlaps the parsed line items. */
function checkboxAnswer(q: StagedQuestion, ctx: StrategyContext): AnswerValue | null {
  const itemWords = new Set<string>();
  for (const item of ctx.metadata?.items ?? []) {
    for (const w of item.name.toLowerCase().split(/[^a-z]+/)) {
      if (w.length >= 4) itemWords.add(w);
    }
  }
  if (!itemWords.size) return null;

  const labelWords = q.prompt.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
  const overlap = labelWords.some((w) => itemWords.has(w));
  return overlap ? [q.options[0]?.value ?? '1'] : null;
}

export interface Suggestion {
  suggested: AnswerValue;
  needsUser: boolean;
}

export function suggestAnswer(q: StagedQuestion, ctx: StrategyContext = {}): Suggestion {
  // 4. Unrecognised / free text / dropdown → never guess.
  if (q.inputType === 'text' || q.inputType === 'select' || q.inputType === 'unknown') {
    return { suggested: null, needsUser: true };
  }

  if (q.inputType === 'checkbox') {
    const picked = checkboxAnswer(q, ctx);
    // If nothing matched confidently, leave unchecked and ask the user.
    return picked ? { suggested: picked, needsUser: false } : { suggested: null, needsUser: true };
  }

  // 1. Factual rules first.
  const factual = factualAnswer(q, ctx);
  if (factual) {
    return { suggested: factual.value, needsUser: factual.needsUser ?? factual.value === null };
  }

  const prompt = `${q.groupPrompt ?? ''} ${q.prompt}`.trim();

  // 2. Negative polarity: "Did you experience a problem?" → No.
  if (isNegativePolarity(prompt)) {
    const no = findOption(q.options, /^\s*no\s*$/i);
    if (no) return { suggested: no.value, needsUser: false };
    // A negative-polarity scale: the *least* positive-sounding option is right,
    // but that is not safe to assume — ask.
    return { suggested: null, needsUser: true };
  }

  // 3. Subjective scales: most positive option, by label.
  const best = mostPositiveOption(q.options);
  if (best) return { suggested: best.value, needsUser: false };

  return { suggested: null, needsUser: true };
}

/** Apply the strategy across a parsed page. */
export function suggestAnswers(
  questions: StagedQuestion[],
  ctx: StrategyContext = {},
): StagedQuestion[] {
  return questions.map((q) => {
    const { suggested, needsUser } = suggestAnswer(q, ctx);
    return { ...q, suggested, needsUser };
  });
}
