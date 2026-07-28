import type { Page } from 'playwright';
import type { AnswerValue, ParsedPage, StagedQuestion } from '../types';
import { parsePage } from './parsePage';
import { politeDelay } from './browser';

/**
 * Driver for mcdvoice.com (SMG's `Survey.aspx` engine).
 *
 * ---------------------------------------------------------------------------
 * CODE-REUSE VERIFICATION (plan §3.5 / §7.2)
 *
 * STATUS: NOT YET VERIFIED.
 *
 * The replay path assumes a 26-digit code can be re-entered after a survey was
 * started and abandoned. Evidence in favour: the site's own timeout dialog says
 * "your survey will time out and you will need to start over", which only makes
 * sense if re-entry works. But this has NOT been confirmed for a code that was
 * partially walked.
 *
 * To verify, the user must run, with their own real receipt:
 *     npm run probe:mcdvoice -- --code <26 digits> --reuse-check
 * and record the outcome here. Until then the app caps replays at 2 per receipt
 * and reports CODE_REJECTED_ON_REPLAY honestly rather than marking a receipt
 * submitted.
 * ---------------------------------------------------------------------------
 * SEE ALSO the block comment on isTerminalPage(): plan §2.4's terminal-page
 * stop-rule does not exist on the live site. That is a BLOCKING issue for the
 * staging design and must be resolved before /api/survey/stage is built.
 * ---------------------------------------------------------------------------
 */

export const ENTRY_URL = 'https://www.mcdvoice.com/';
export const PIECEMEAL_URL = 'https://www.mcdvoice.com/Index.aspx?POSType=PieceMeal';

export class InvalidCodeError extends Error {
  constructor(message = 'mcdvoice.com rejected this survey code.') {
    super(message);
    this.name = 'InvalidCodeError';
  }
}

export class SubmitGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmitGuardError';
  }
}

export class PageBlockedError extends Error {
  constructor(
    message: string,
    public readonly pageIndex: number,
  ) {
    super(message);
    this.name = 'PageBlockedError';
  }
}

/** A jQuery-UI modal appears near the session timeout and can swallow clicks. */
export async function dismissSessionDialog(page: Page) {
  try {
    const dialog = page.locator('#sessionTimeoutDialog:visible');
    if ((await dialog.count()) === 0) return;
    const extend = page.getByRole('button', { name: /extend session/i });
    if ((await extend.count()) > 0) await extend.first().click({ timeout: 5_000 });
  } catch {
    /* best effort */
  }
}

/** The §2.1 invalid-code / required-field failure signature. */
async function hasVisibleError(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    if (document.querySelector('.inputErrorBorder')) return true;
    for (const el of Array.from(document.querySelectorAll('.Error'))) {
      if ((el.textContent ?? '').trim()) return true;
    }
    return false;
  });
}

/**
 * Click something that submits the form, and wait for the resulting navigation.
 *
 * `page.waitForLoadState()` is NOT usable here: the current document is already
 * loaded, so it resolves immediately and we end up inspecting the pre-click
 * page. Every entry on this site is a full form POST — often through a 302 —
 * so wait for an actual navigation.
 */
async function clickAndNavigate(page: Page, selector: string): Promise<void> {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => null),
    page.click(selector),
  ]);
  // Let the ASP.NET redirect chain settle before anything is read off the page.
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

/**
 * Did we actually get into the survey?
 *
 * CORRECTION TO PLAN §2.1, from live recon on 2026-07-28: "still on Index.aspx"
 * is NOT a usable failure signal. A *successful* piecemeal entry 302s to
 * `Index.aspx?c=NNNNNN&AllowCapture=False`, and that page carries the first real
 * question (`#PostedFNS=R000060`). Detect structurally instead: if either entry
 * form is still on the page, we were bounced; a rejected attempt re-renders the
 * form with cleared fields and adds `PreValidation` to the body class, often
 * with no `.Error` element at all.
 */
async function stillOnEntryForm(page: Page): Promise<boolean> {
  return page.evaluate(
    () => !!document.querySelector('#CN1') || !!document.querySelector('#InputStoreID'),
  );
}

/**
 * Enter the 26-digit code on the landing page and start the survey.
 * Throws {@link InvalidCodeError} on the verified failure signature.
 */
export async function enterCode(page: Page, code26: string): Promise<void> {
  if (!/^\d{26}$/.test(code26)) {
    throw new InvalidCodeError('The survey code must be exactly 26 digits.');
  }

  await page.goto(ENTRY_URL, { waitUntil: 'domcontentloaded' });

  const slices = [
    code26.slice(0, 5),
    code26.slice(5, 10),
    code26.slice(10, 15),
    code26.slice(15, 20),
    code26.slice(20, 25),
    code26.slice(25, 26),
  ];
  for (let i = 0; i < 6; i++) {
    await page.fill(`#CN${i + 1}`, slices[i]);
  }

  await clickAndNavigate(page, '#NextButton');

  if ((await stillOnEntryForm(page)) || (await hasVisibleError(page))) {
    throw new InvalidCodeError(
      'mcdvoice.com did not accept that survey code. Check every digit against the receipt — ' +
        'a single wrong digit is rejected. If the code is right, it may already have been used.',
    );
  }
}

export interface PieceMealMeta {
  storeNumber: string;
  registerNumber?: string;
  /** ISO date, `YYYY-MM-DD`. */
  visitDate?: string;
  /** 24-hour `HH:MM`. */
  visitTime?: string;
  orderNumber?: string;
  totalAmount?: number;
}

/**
 * The §2.2 "no 26-digit code" path. Used as an OCR fallback and, importantly, as
 * the safe recon harness: it maps the question flow without consuming a real
 * receipt code.
 */
export async function enterPieceMeal(page: Page, meta: PieceMealMeta): Promise<void> {
  await page.goto(PIECEMEAL_URL, { waitUntil: 'domcontentloaded' });

  // VERIFIED 2026-07-28: the visit date/time must be in the PAST in the store's
  // local time. Same-day entries were rejected outright (even at an hour that
  // had already passed locally), while any prior day was accepted. Default to
  // yesterday rather than "now".
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const date = meta.visitDate ? new Date(`${meta.visitDate}T00:00:00`) : yesterday;
  const [hh, mm] = (meta.visitTime ?? '12:30').split(':');

  const total = meta.totalAmount ?? 5.99;
  const dollars = String(Math.floor(total));
  const cents = String(Math.round((total - Math.floor(total)) * 100)).padStart(2, '0');

  await page.fill('#InputStoreID', meta.storeNumber);
  await page.fill('#InputRegisterNum', meta.registerNumber ?? '1');
  await selectIfPresent(page, '#InputMonth', String(date.getMonth() + 1).padStart(2, '0'));
  await selectIfPresent(page, '#InputDay', String(date.getDate()).padStart(2, '0'));
  await selectIfPresent(page, '#InputYear', String(date.getFullYear()));
  await selectIfPresent(page, '#InputHour', hh.padStart(2, '0'));
  await selectIfPresent(page, '#InputMinute', mm.padStart(2, '0'));
  await page.fill('#InputTransactionNum', meta.orderNumber ?? '1');
  await page.fill('#AmountSpent1', dollars);
  await page.fill('#AmountSpent2', cents);

  await clickAndNavigate(page, '#NextButton');

  if ((await stillOnEntryForm(page)) || (await hasVisibleError(page))) {
    throw new InvalidCodeError(
      'mcdvoice.com rejected the piecemeal details. The store number must be real and the ' +
        'visit date/time must be in the past in the store\'s local time — same-day entries ' +
        'are refused.',
    );
  }
}

async function selectIfPresent(page: Page, selector: string, value: string) {
  const el = page.locator(selector);
  if ((await el.count()) === 0) return;
  try {
    await el.selectOption(value);
  } catch {
    // Zero-padding conventions vary; try the unpadded form before giving up.
    try {
      await el.selectOption(String(Number(value)));
    } catch {
      /* leave whatever default the site chose */
    }
  }
}

export interface ReadPageResult extends ParsedPage {
  html: string;
  url: string;
  screenshot: Buffer;
}

export async function readPage(page: Page, pageIndex: number): Promise<ReadPageResult> {
  await dismissSessionDialog(page);
  const html = await page.content();
  const parsed = parsePage(html, pageIndex);
  const screenshot = await page.screenshot({ fullPage: true });
  return { ...parsed, html, url: page.url(), screenshot };
}

/**
 * Apply answers to the live DOM.
 *
 * Every radio/checkbox on this site carries `class="… sr-only"` and is visually
 * replaced by its `<label>`, so Playwright's visibility check fails on the input
 * itself — click the label, and fall back to a forced click.
 */
export async function applyAnswers(
  page: Page,
  questions: StagedQuestion[],
  answers: Record<string, AnswerValue>,
): Promise<string[]> {
  const applied: string[] = [];

  for (const q of questions) {
    const value = answers[q.questionId];
    if (value === null || value === undefined || value === '') continue;

    if (q.inputType === 'checkbox') {
      const values = Array.isArray(value) ? value : [value];
      if (!values.length) continue;
      const selector = `input[type=checkbox][name="${q.questionId}"]`;
      // Clicking toggles, so this must be idempotent: only click if unchecked.
      const already = await page
        .locator(selector)
        .first()
        .isChecked()
        .catch(() => false);
      if (already || (await clickInput(page, selector))) applied.push(q.questionId);
      continue;
    }

    if (q.inputType === 'radio_grid' || q.inputType === 'radio_list') {
      const v = Array.isArray(value) ? value[0] : value;
      if (await clickInput(page, `input[type=radio][name="${q.questionId}"][value="${v}"]`)) {
        applied.push(q.questionId);
      }
      continue;
    }

    if (q.inputType === 'select') {
      const v = Array.isArray(value) ? value[0] : value;
      try {
        await page.selectOption(`select[name="${q.questionId}"]`, v);
        applied.push(q.questionId);
      } catch {
        /* ignore — will be flagged needsUser */
      }
      continue;
    }

    if (q.inputType === 'text') {
      const v = Array.isArray(value) ? value.join(' ') : value;
      try {
        await page.fill(`[name="${q.questionId}"]`, v);
        applied.push(q.questionId);
      } catch {
        /* ignore */
      }
    }
  }

  return applied;
}

async function clickInput(page: Page, selector: string): Promise<boolean> {
  const input = page.locator(selector).first();
  if ((await input.count()) === 0) return false;

  const id = await input.getAttribute('id');
  if (id) {
    const label = page.locator(`label[for="${cssEscape(id)}"]`).first();
    if ((await label.count()) > 0) {
      try {
        await label.click({ timeout: 5_000 });
        return true;
      } catch {
        /* fall through to the forced click */
      }
    }
  }
  try {
    await input.click({ force: true, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, '\\$1');
}

/** Label on the page's submit button, or null if there is none. */
export async function submitButtonLabel(page: Page): Promise<string | null> {
  const btn = page.locator('#NextButton, input[type=submit], button[type=submit]').first();
  if ((await btn.count()) === 0) return null;
  const value = await btn.getAttribute('value');
  if (value) return value.trim();
  const text = (await btn.textContent())?.trim();
  return text || null;
}

/**
 * ==========================================================================
 * !! PLAN §2.4 IS CONTRADICTED BY THE LIVE SITE — READ BEFORE BUILDING ON THIS
 *
 * Verified 2026-07-28 by `npm run probe:mcdvoice -- --piecemeal --store 05678`:
 *
 *   There is NO page whose submit button reads "Submit"/"Finish"/"Done".
 *   The LAST question page (`#ProgressPercentage` = "100%") carries
 *   `<input type="submit" id="NextButton" value="Next">`, and clicking that
 *   "Next" SUBMITS THE SURVEY. The next page is the Thank-You page: body class
 *   `Finish`, no submit button, validation code in the text.
 *
 * ADOPTED RULE (replaces plan §2.4 rule 1):
 *
 *   A page whose progress reads 100% IS the terminal state. During STAGE, parse
 *   it, record it, and STOP — never call advance() on it. Only the CONFIRM
 *   phase (gated on `confirm: true` after the user's in-app checkbox) may click
 *   Next there, and that click is the submission.
 *
 * TWO independent guards enforce this in advance(): the WalkGuard's record of
 * pages already judged terminal, and a live progress re-check. The original
 * incident happened because there was exactly one guard and it was wrong.
 *
 * `isTerminalPage()` below detects the page AFTER submission (Thank-You), which
 * is too late to be a stop-rule — use isFinalQuestionPage() for that.
 * ==========================================================================
 */
export async function isTerminalPage(page: Page): Promise<boolean> {
  const label = await submitButtonLabel(page);
  return label === null || label.toLowerCase() !== 'next';
}

/** True once the Thank-You page is reached (post-submission). */
export async function isFinishPage(page: Page): Promise<boolean> {
  return page.evaluate(() => document.body.classList.contains('Finish'));
}

/**
 * THE terminal-state rule (adopted 2026-07-28, replacing plan §2.4 rule 1).
 *
 * `#ProgressPercentage` reading exactly 100% means this page IS the terminal
 * state. Clicking "Next" here submits the survey.
 *
 * Staging must parse such a page, record it, and stop. Only the CONFIRM phase
 * may click Next on it.
 */
export async function isFinalQuestionPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const progress = (document.getElementById('ProgressPercentage')?.textContent ?? '').trim();
    return progress === '100%';
  });
}

/**
 * Guard 2 of 2 (defense in depth).
 *
 * The first incident happened because there was exactly ONE guard and it was
 * wrong. A walk records every page index it has judged terminal; `advance()`
 * refuses to act on any page already in that set, independently of re-reading
 * the progress bar. If the progress check regresses or the DOM shifts, this
 * still holds the line.
 */
export class WalkGuard {
  private readonly terminal = new Set<number>();

  markTerminal(pageIndex: number) {
    this.terminal.add(pageIndex);
  }

  isTerminal(pageIndex: number): boolean {
    return this.terminal.has(pageIndex);
  }

  assertAdvanceAllowed(pageIndex: number) {
    if (this.terminal.has(pageIndex)) {
      throw new SubmitGuardError(
        `Refusing to advance from page ${pageIndex}: this walk already recorded it as the ` +
          'terminal page. Clicking "Next" here would submit the survey.',
      );
    }
  }
}

/**
 * Advance one page.
 *
 * ==========================================================================
 * HARD CONSTRAINT (plan §7.4). This function REFUSES to click anything whose
 * value is not exactly "Next". Clicking a Submit/Finish/Done button is the act
 * of sending fabricated feedback to a real restaurant and consuming the user's
 * survey code, and exactly one code path in this app is permitted to do it:
 * `/api/survey/confirm`, and only with `confirm: true` in the request body,
 * after the user ticks the confirmation checkbox.
 *
 * Do not add a flag, an env var, or an "auto mode" that relaxes this.
 * ==========================================================================
 */
export async function advance(page: Page, pageIndex: number, guard?: WalkGuard): Promise<void> {
  await dismissSessionDialog(page);

  // ---- GUARD 1: the walk's own record of what it judged terminal. ----
  // Independent of re-reading the DOM, so a regression in guard 2 cannot
  // silently re-open the path to submission.
  guard?.assertAdvanceAllowed(pageIndex);

  // ---- GUARD 2: live progress check. ----
  // The label assertion further below is NOT sufficient on this site: the final,
  // submitting click is also labelled "Next". 100% progress is the real signal.
  if (await isFinalQuestionPage(page)) {
    guard?.markTerminal(pageIndex);
    throw new SubmitGuardError(
      `Refusing to advance from page ${pageIndex}: progress reads 100%, so this is the ` +
        'terminal page and clicking "Next" would SUBMIT the survey. Submission is only ' +
        'permitted via /api/survey/confirm with explicit user confirmation.',
    );
  }

  const label = await submitButtonLabel(page);
  if (label === null) {
    throw new SubmitGuardError(
      `Refusing to advance: no submit button on page ${pageIndex}. This is the terminal page.`,
    );
  }
  if (label !== 'Next') {
    throw new SubmitGuardError(
      `Refusing to click a button labelled "${label}" on page ${pageIndex}. ` +
        'Only "Next" may be clicked outside the explicit confirm-and-submit path.',
    );
  }

  await politeDelay();
  await clickAndNavigate(page, '#NextButton');

  if (await hasVisibleError(page)) {
    throw new PageBlockedError(
      `mcdvoice.com reported a required-field error on page ${pageIndex}. ` +
        'Some questions on that page need your answer.',
      pageIndex,
    );
  }
}

/**
 * THE ONLY function permitted to click a non-"Next" submit button.
 * Callable exclusively from `/api/survey/confirm` after `confirm: true`.
 *
 * @param confirmed must be literally `true` — a second, in-code restatement of
 *   the guard so this can never be reached by accident.
 */
export async function submitFinalPage(page: Page, confirmed: boolean): Promise<void> {
  if (confirmed !== true) {
    throw new SubmitGuardError(
      'submitFinalPage requires explicit user confirmation and was called without it.',
    );
  }
  await dismissSessionDialog(page);

  const label = await submitButtonLabel(page);
  if (label === null) {
    throw new SubmitGuardError('There is no submit button on this page.');
  }

  await politeDelay();
  await clickAndNavigate(page, '#NextButton, input[type=submit], button[type=submit]');
}

export interface ValidationCodeResult {
  code: string | null;
  text: string;
  screenshot: Buffer;
}

/**
 * Layered scrape of the validation code (plan §2.4). The final page was never
 * captured during recon, so the selector is unverified — which is exactly why
 * the full page text and a screenshot are ALWAYS returned as well, so the user
 * can read the code manually if the scrape misses.
 */
export async function scrapeValidationCode(page: Page): Promise<ValidationCodeResult> {
  const screenshot = await page.screenshot({ fullPage: true });

  const { code, text } = await page.evaluate(() => {
    const root = (document.querySelector('#content') ?? document.body) as HTMLElement;
    const text = root.innerText ?? root.textContent ?? '';

    // 1. An element that advertises itself as the validation code.
    for (const el of Array.from(document.querySelectorAll('[id*="alid"], [class*="alid"]'))) {
      const t = (el as HTMLElement).innerText?.trim() ?? '';
      const m = t.match(/\b([0-9]{4,20})\b/);
      if (m) return { code: m[1], text };
    }

    // 2. Digits near the phrase "validation code".
    const near = text.match(/validation\s*code[^0-9]{0,80}([0-9]{4,20})/i);
    if (near) return { code: near[1], text };

    // 3. Longest standalone digit run of length 4-20 anywhere on the page.
    const runs = text.match(/\b[0-9]{4,20}\b/g) ?? [];
    if (runs.length) {
      const longest = runs.reduce((a, b) => (b.length > a.length ? b : a));
      return { code: longest, text };
    }

    return { code: null as string | null, text };
  });

  return { code, text, screenshot };
}
