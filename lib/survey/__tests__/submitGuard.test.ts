/**
 * Regression tests for the terminal-page guards.
 *
 * These exist because of a real incident: a staging walk built to the plan's
 * original rule ("stop when the submit button is no longer labelled Next")
 * walked to completion and SUBMITTED a survey, because the final page's button
 * is also labelled "Next". Never let that rule come back.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isTerminalPageHtml, isTerminalProgress, parsePage } from '../parsePage';
import { SubmitGuardError, WalkGuard, advance, isFinalQuestionPage } from '../mcdvoice';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/**
 * Minimal stand-in for a Playwright Page. `advance()` only needs `evaluate`
 * (for the progress/error checks) and the locator plumbing, so a walk that is
 * correctly guarded never reaches the click.
 */
function fakePage(html: string) {
  const page = parsePage(html);
  const progress = page.progress;
  let clicked = false;
  return {
    get clicked() {
      return clicked;
    },
    // isFinalQuestionPage / hasVisibleError / stillOnEntryForm all go through this.
    evaluate: async (fn: (...a: unknown[]) => unknown) => {
      const src = fn.toString();
      if (src.includes('ProgressPercentage')) return (progress ?? '').trim() === '100%';
      if (src.includes('sessionTimeoutDialog')) return false;
      return false;
    },
    locator: () => ({
      count: async () => 1,
      first: () => ({
        count: async () => 1,
        getAttribute: async (attr: string) =>
          attr === 'value' ? (page.submitLabel ?? null) : null,
        textContent: async () => page.submitLabel,
        click: async () => {
          clicked = true;
        },
      }),
      getAttribute: async (attr: string) => (attr === 'value' ? (page.submitLabel ?? null) : null),
      textContent: async () => page.submitLabel,
      click: async () => {
        clicked = true;
      },
    }),
    click: async () => {
      clicked = true;
    },
    waitForNavigation: async () => null,
    waitForLoadState: async () => undefined,
    getByRole: () => ({ count: async () => 0, first: () => ({ click: async () => {} }) }),
  };
}

describe('terminal progress rule', () => {
  it('treats exactly 100% as terminal', () => {
    expect(isTerminalProgress('100%')).toBe(true);
    expect(isTerminalProgress(' 100% ')).toBe(true);
    expect(isTerminalProgress('99%')).toBe(false);
    expect(isTerminalProgress('89%')).toBe(false);
    expect(isTerminalProgress(null)).toBe(false);
  });

  it('recognises the real 100% page captured from the live site', () => {
    const html = fixture('live-terminal-100pct.html');
    expect(parsePage(html).progress).toBe('100%');
    // The trap: the button still says "Next".
    expect(parsePage(html).submitLabel).toBe('Next');
    expect(isTerminalPageHtml(html)).toBe(true);
  });

  it('recognises the post-submission Thank-You page', () => {
    expect(isTerminalPageHtml(fixture('live-thankyou-validation.html'))).toBe(true);
  });

  it('does not treat ordinary question pages as terminal', () => {
    expect(isTerminalPageHtml(fixture('live-grid-5point.html'))).toBe(false);
    expect(isTerminalPageHtml(fixture('live-checkbox-multi.html'))).toBe(false);
    expect(isTerminalPageHtml(fixture('live-freetext-comment.html'))).toBe(false);
  });
});

describe('GUARD 2 — advance() refuses to click on a 100%-progress page', () => {
  it('detects the terminal page live', async () => {
    const page = fakePage(fixture('live-terminal-100pct.html'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await isFinalQuestionPage(page as any)).toBe(true);
  });

  it('throws SubmitGuardError instead of clicking', async () => {
    const page = fakePage(fixture('live-terminal-100pct.html'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(advance(page as any, 17)).rejects.toThrow(SubmitGuardError);
    expect(page.clicked).toBe(false);
  });

  it('says why, mentioning submission', async () => {
    const page = fakePage(fixture('live-terminal-100pct.html'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(advance(page as any, 17)).rejects.toThrow(/SUBMIT/i);
  });

  it('records the page as terminal in the guard when it fires', async () => {
    const page = fakePage(fixture('live-terminal-100pct.html'));
    const guard = new WalkGuard();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(advance(page as any, 17, guard)).rejects.toThrow(SubmitGuardError);
    expect(guard.isTerminal(17)).toBe(true);
  });
});

describe('GUARD 1 — the walk record blocks a second attempt independently', () => {
  it('refuses any page already recorded as terminal, without re-reading the DOM', async () => {
    const guard = new WalkGuard();
    guard.markTerminal(17);
    // A page that would otherwise look perfectly advanceable (99%, button "Next").
    const page = fakePage(fixture('live-grid-5point.html'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(advance(page as any, 17, guard)).rejects.toThrow(SubmitGuardError);
    expect(page.clicked).toBe(false);
  });

  it('still allows other pages', () => {
    const guard = new WalkGuard();
    guard.markTerminal(17);
    expect(guard.isTerminal(17)).toBe(true);
    expect(guard.isTerminal(16)).toBe(false);
    expect(() => guard.assertAdvanceAllowed(16)).not.toThrow();
    expect(() => guard.assertAdvanceAllowed(17)).toThrow(SubmitGuardError);
  });
});

describe('the original bad rule must never return', () => {
  it('a "Next" button label alone is NOT sufficient to permit advancing', () => {
    const html = fixture('live-terminal-100pct.html');
    const page = parsePage(html);
    // This is exactly the state the old rule considered safe to click.
    expect(page.submitLabel).toBe('Next');
    // The adopted rule must still call it terminal.
    expect(isTerminalPageHtml(html)).toBe(true);
  });
});
