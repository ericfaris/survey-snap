import type { CodeCandidate } from '../types';

export const CODE_LENGTH = 26;

/**
 * Digit-confusion map. Applied only inside candidate runs (never to the whole
 * document), so genuine letters elsewhere in the receipt survive untouched.
 */
const CONFUSIONS: Record<string, string> = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  U: '0',
  I: '1',
  l: '1',
  L: '1',
  '|': '1',
  '!': '1',
  i: '1',
  Z: '2',
  z: '2',
  S: '5',
  s: '5',
  G: '6',
  b: '6',
  T: '7',
  '?': '7',
  B: '8',
  g: '9',
  q: '9',
  A: '4',
};

/** Map a run of characters to digits using the confusion table. */
export function digitize(run: string): string {
  let out = '';
  for (const ch of run) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (CONFUSIONS[ch]) out += CONFUSIONS[ch];
  }
  return out;
}

/** Characters that could plausibly be a digit once the confusion map applies. */
const DIGITISH = '0-9OoQDUIlL|!iZzSsGbT?BgqA';
/** Separators tesseract emits between the printed 5-5-5-5-5-1 groups. */
const SEP = '[\\s\\-–—_.·:]*';

const ANCHOR_RE = /(survey\s*code|mcdvoice|mcd\s*voice|validation\s*code|survey)/i;

function unique(candidates: CodeCandidate[]): CodeCandidate[] {
  const seen = new Map<string, CodeCandidate>();
  for (const c of candidates) {
    const prev = seen.get(c.code);
    if (!prev || c.score > prev.score) seen.set(c.code, c);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

/**
 * Priority 1 — text that matches the receipt's printed 5-5-5-5-5-1 grouping.
 * This is the strongest signal available: the grouping is unlikely to occur by
 * accident anywhere else on the receipt.
 */
function groupingCandidates(text: string): CodeCandidate[] {
  const re = new RegExp(
    `([${DIGITISH}]{5})${SEP}([${DIGITISH}]{5})${SEP}([${DIGITISH}]{5})${SEP}` +
      `([${DIGITISH}]{5})${SEP}([${DIGITISH}]{5})${SEP}([${DIGITISH}]{1})(?![${DIGITISH}])`,
    'g',
  );
  const out: CodeCandidate[] = [];
  for (const m of text.matchAll(re)) {
    const code = digitize(m.slice(1).join(''));
    if (code.length === CODE_LENGTH) out.push({ code, score: 100, source: 'grouping' });
  }
  return out;
}

/** Priority 2 — a digit run on or just after a "Survey Code" / "McDVoice" line. */
function anchorCandidates(text: string): CodeCandidate[] {
  const lines = text.split(/\r?\n/);
  const out: CodeCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!ANCHOR_RE.test(lines[i])) continue;
    // Look at the anchor line itself and the two lines after it.
    for (let j = i; j <= Math.min(i + 2, lines.length - 1); j++) {
      const code = digitize(lines[j]);
      if (code.length < CODE_LENGTH) continue;
      for (let k = 0; k + CODE_LENGTH <= code.length; k++) {
        out.push({
          code: code.slice(k, k + CODE_LENGTH),
          // Closer to the anchor, and exact-length, scores higher.
          score: 70 - (j - i) * 5 - (code.length === CODE_LENGTH ? 0 : 5) - k,
          source: 'anchor',
        });
      }
    }
  }
  return out;
}

/** Priority 3 — any 26-digit run once separators are stripped, line by line. */
function runCandidates(text: string): CodeCandidate[] {
  const out: CodeCandidate[] = [];
  for (const line of text.split(/\r?\n/)) {
    const code = digitize(line);
    if (code.length < CODE_LENGTH) continue;
    for (let k = 0; k + CODE_LENGTH <= code.length; k++) {
      out.push({
        code: code.slice(k, k + CODE_LENGTH),
        score: 40 - (code.length === CODE_LENGTH ? 0 : 5) - k,
        source: 'run',
      });
    }
  }
  return out;
}

/**
 * Rank 26-digit survey-code candidates found in OCR output.
 *
 * Returns the ranked list — not a single answer — because a wrong digit is a
 * dead end on mcdvoice.com and the correction UI lets the user pick another.
 *
 * @param textPass  output of the plain OCR pass
 * @param digitPass output of the digits-only OCR pass (optional)
 */
export function extractCodeCandidates(textPass: string, digitPass = ''): CodeCandidate[] {
  const sources: { text: string; bonus: number }[] = [
    { text: textPass, bonus: 0 },
    // The digits-only pass has no letters to anchor on, so its grouping/run hits
    // are slightly less trustworthy in isolation — but it recovers codes the
    // text pass mangles, so keep it close behind.
    { text: digitPass, bonus: -2 },
  ];

  const all: CodeCandidate[] = [];
  for (const { text, bonus } of sources) {
    if (!text) continue;
    for (const c of [
      ...groupingCandidates(text),
      ...anchorCandidates(text),
      ...runCandidates(text),
    ]) {
      all.push({ ...c, score: c.score + bonus });
    }
  }

  const ranked = unique(all);
  // A candidate corroborated by both passes is much more likely to be right.
  const inText = new Set(
    [...groupingCandidates(textPass), ...anchorCandidates(textPass), ...runCandidates(textPass)].map(
      (c) => c.code,
    ),
  );
  const inDigits = new Set(
    digitPass
      ? [
          ...groupingCandidates(digitPass),
          ...anchorCandidates(digitPass),
          ...runCandidates(digitPass),
        ].map((c) => c.code)
      : [],
  );
  for (const c of ranked) {
    if (inText.has(c.code) && inDigits.has(c.code)) c.score += 15;
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, 8);
}

export function bestCode(candidates: CodeCandidate[]): string | null {
  return candidates.length ? candidates[0].code : null;
}

export function isValidSurveyCode(code: string | null | undefined): code is string {
  return typeof code === 'string' && /^\d{26}$/.test(code);
}

/** Split a 26-digit code into the site's 5-5-5-5-5-1 input layout. */
export function splitCode(code: string): string[] {
  const padded = code.padEnd(CODE_LENGTH, '');
  return [
    padded.slice(0, 5),
    padded.slice(5, 10),
    padded.slice(10, 15),
    padded.slice(15, 20),
    padded.slice(20, 25),
    padded.slice(25, 26),
  ];
}
