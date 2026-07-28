import { parseHTML } from 'linkedom';
import type { InputType, ParsedPage, QuestionOption, StagedQuestion } from '../types';

/**
 * Parser for SMG's mcdvoice.com survey engine (`Survey.aspx`).
 *
 * A pure function over an HTML string so it can be unit-tested against saved
 * fixtures without a browser.
 *
 * Structure-driven by design (see plan §7.3): it keys on the engine's generic
 * markup — `#PostedFNS`, `table.Inputtyperbl`, `fieldset.inputtyperblv`,
 * `fieldset.inputtypeopt` — never on question ids or prompt wording, which are
 * content and will drift.
 */

type El = ReturnType<typeof parseHTML>['document']['documentElement'];

function text(node: { textContent?: string | null } | null | undefined): string {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * CORRECTION TO PLAN §2.3, from live recon 2026-07-28.
 *
 * The plan states "`S`-prefixed ids are static text blocks, `R`-prefixed ids are
 * real questions". That is NOT true: the free-text comment box at 95% progress
 * is `<textarea name="S081000">` inside `div.FNSITEM.inputtypetxt`, and it is a
 * real (optional) question. Classifying by id prefix silently drops it.
 *
 * Classify by the container's `inputtype…` class instead — `inputtypeinstr` is
 * the only genuinely static one — and fall back to "does it contain an input".
 */
export function isEngineField(name: string): boolean {
  return /^(PostedFNS|IoNF|JavaScriptEnabled|FIP|AllowCapture|CN\d|Input[A-Za-z]+|AmountSpent\d)$/i.test(
    name,
  );
}

/** True when this `PostedFNS` id is a static instruction block, not a question. */
export function isStaticBlock(doc: Document, fieldId: string): boolean {
  const container = doc.getElementById(`FNS${fieldId}`);
  if (!container) return false;
  if (container.classList.contains('inputtypeinstr')) return true;
  return !container.querySelector('input, textarea, select');
}

function optionsFrom(inputs: Element[], doc: Document, labelFor: (input: Element) => string) {
  const options: QuestionOption[] = [];
  for (const input of inputs) {
    const value = input.getAttribute('value') ?? '';
    const label = labelFor(input);
    options.push({ value, label });
  }
  void doc;
  return options;
}

/** (a) Scale / grid — `table.Inputtyperbl`. One question per `tbody > tr`. */
function parseGrids(doc: Document, pageIndex: number): StagedQuestion[] {
  const out: StagedQuestion[] = [];

  for (const table of Array.from(doc.querySelectorAll('table.Inputtyperbl'))) {
    for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
      const inputs = Array.from(row.querySelectorAll('input[type=radio]'));
      if (!inputs.length) continue;

      const questionId = inputs[0].getAttribute('name') ?? '';
      if (!questionId) continue;

      const prompt =
        text(row.querySelector('th.LeftColumn')) ||
        text(row.querySelector('th')) ||
        text(doc.querySelector(`#text${questionId}`));

      // The radio `value` is NOT reliably ordered (5-point scale starts at 5,
      // Yes/No starts at 1) — always resolve the label via aria-labelledby to
      // the column header.
      const options = optionsFrom(inputs, doc, (input) => {
        const labelledBy = input.getAttribute('aria-labelledby');
        if (labelledBy) {
          const header = doc.getElementById(labelledBy);
          if (header) return text(header);
        }
        const id = input.getAttribute('id');
        return id ? text(doc.querySelector(`label[for="${CSS_escape(id)}"]`)) : '';
      });

      out.push({
        questionId,
        pageIndex,
        prompt,
        inputType: 'radio_grid',
        options,
        suggested: null,
        needsUser: false,
        required: true,
      });
    }
  }
  return out;
}

/** (b) Vertical single-select — `fieldset.inputtyperblv`. */
function parseVerticalRadios(doc: Document, pageIndex: number): StagedQuestion[] {
  const out: StagedQuestion[] = [];

  for (const fs of Array.from(doc.querySelectorAll('fieldset.inputtyperblv'))) {
    const inputs = Array.from(fs.querySelectorAll('input[type=radio]'));
    if (!inputs.length) continue;

    const questionId = inputs[0].getAttribute('name') ?? '';
    if (!questionId) continue;

    const prompt = text(fs.querySelector('legend')) || text(doc.querySelector(`#text${questionId}`));

    // DOM order does not match value order (Opt1, Opt3, Opt2 was verified live).
    const options = optionsFrom(inputs, doc, (input) => {
      const id = input.getAttribute('id');
      return id ? text(fs.querySelector(`label[for="${CSS_escape(id)}"]`)) : '';
    });

    out.push({
      questionId,
      pageIndex,
      prompt,
      inputType: 'radio_list',
      options,
      suggested: null,
      needsUser: false,
      required: true,
    });
  }
  return out;
}

/**
 * (c) Multi-select checkboxes — `fieldset.inputtypeopt`.
 * Each checkbox is its OWN question id, all with value="1"; the prompt for the
 * set lives in the fieldset's legend.
 */
function parseCheckboxGroups(doc: Document, pageIndex: number): StagedQuestion[] {
  const out: StagedQuestion[] = [];

  for (const fs of Array.from(doc.querySelectorAll('fieldset.inputtypeopt'))) {
    const groupPrompt = text(fs.querySelector('legend'));

    for (const input of Array.from(fs.querySelectorAll('input[type=checkbox]'))) {
      const questionId = input.getAttribute('name') ?? input.getAttribute('id') ?? '';
      if (!questionId) continue;
      const id = input.getAttribute('id');
      const label = id ? text(fs.querySelector(`label[for="${CSS_escape(id)}"]`)) : '';

      out.push({
        questionId,
        pageIndex,
        prompt: label,
        groupPrompt,
        inputType: 'checkbox',
        options: [{ value: input.getAttribute('value') ?? '1', label }],
        suggested: null,
        // Multi-select "select all that apply" sets are never individually required.
        needsUser: false,
        required: false,
      });
    }
  }
  return out;
}

/**
 * (e) Anything else with an input: textarea / select / text.
 * NOT VERIFIED on the live site (the recon walk stopped at 89% to avoid
 * submitting fabricated feedback), so this is deliberately generic: derive the
 * id from the enclosing `[id^=FNS]`, the prompt from `#text<QID>` or the nearest
 * legend/label, leave the answer BLANK and flag `needsUser`. Never guess.
 */
function parseFreeform(doc: Document, pageIndex: number, seen: Set<string>): StagedQuestion[] {
  const out: StagedQuestion[] = [];
  const nodes = Array.from(
    doc.querySelectorAll('textarea, select, input[type=text], input[type=number]'),
  );

  for (const node of nodes) {
    const name = node.getAttribute('name') ?? node.getAttribute('id') ?? '';
    if (!name || seen.has(name)) continue;
    // Engine plumbing, not questions. Note we do NOT filter on an `R` prefix —
    // see isEngineField/isStaticBlock: real questions can be S-prefixed.
    if (isEngineField(name)) continue;
    if (!/^[RS]\d/.test(name) && !name.startsWith('R')) continue;

    const container = node.closest('[id^="FNS"]') ?? node.parentElement;
    const prompt =
      text(doc.querySelector(`#text${name}`)) ||
      text(container?.querySelector('legend') ?? null) ||
      text(container?.querySelector('label') ?? null) ||
      text(container);

    const tag = node.tagName.toLowerCase();
    const inputType: InputType = tag === 'select' ? 'select' : tag === 'textarea' ? 'text' : 'text';

    const options: QuestionOption[] =
      tag === 'select'
        ? Array.from(node.querySelectorAll('option')).map((o) => ({
            value: o.getAttribute('value') ?? '',
            label: text(o),
          }))
        : [];

    out.push({
      questionId: name,
      pageIndex,
      prompt,
      inputType,
      options,
      suggested: null,
      needsUser: true,
      required: false,
      rawHtml: (container as Element | null)?.outerHTML?.slice(0, 4000),
    });
    seen.add(name);
  }
  return out;
}

/** Minimal CSS.escape — linkedom has no global CSS object. */
function CSS_escape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}

export function parsePage(html: string, pageIndex = 0): ParsedPage {
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;

  const postedFnsRaw = doc.querySelector('#PostedFNS')?.getAttribute('value') ?? '';
  const postedFns = postedFnsRaw.split('|').map((s) => s.trim()).filter(Boolean);

  const questions: StagedQuestion[] = [
    ...parseGrids(doc, pageIndex),
    ...parseVerticalRadios(doc, pageIndex),
    ...parseCheckboxGroups(doc, pageIndex),
  ];

  const seen = new Set(questions.map((q) => q.questionId));
  questions.push(...parseFreeform(doc, pageIndex, seen));

  // `#PostedFNS` is the authoritative per-page field list. Anything it names
  // that we failed to parse is an unrecognised type — surface it rather than
  // silently dropping it, so the review UI can ask the user.
  for (const fieldId of postedFns) {
    if (isStaticBlock(doc, fieldId)) continue;
    if (seen.has(fieldId) || questions.some((q) => q.questionId === fieldId)) continue;
    const container = doc.getElementById(`FNS${fieldId}`);
    questions.push({
      questionId: fieldId,
      pageIndex,
      prompt: text(doc.querySelector(`#text${fieldId}`)) || text(container) || fieldId,
      inputType: 'unknown',
      options: [],
      suggested: null,
      needsUser: true,
      required: false,
      rawHtml: container?.outerHTML?.slice(0, 4000),
    });
  }

  const submitButton =
    doc.querySelector('#NextButton') ??
    doc.querySelector('input[type=submit]') ??
    doc.querySelector('button[type=submit]');

  const submitLabel = submitButton
    ? (submitButton.getAttribute('value') ?? text(submitButton) ?? null)
    : null;

  const progress = doc.querySelector('#ProgressPercentage')
    ? text(doc.querySelector('#ProgressPercentage'))
    : null;

  return { questions, postedFns, submitLabel: submitLabel || null, progress };
}

/**
 * The site's invalid-code signature (verified §2.1): the CN inputs gain
 * `.inputErrorBorder` and a `.Error` element appears.
 */
export function hasFieldError(html: string): boolean {
  const { document } = parseHTML(html);
  const doc = document as unknown as Document;
  if (doc.querySelector('.inputErrorBorder')) return true;
  for (const el of Array.from(doc.querySelectorAll('.Error'))) {
    if (text(el)) return true;
  }
  return false;
}
