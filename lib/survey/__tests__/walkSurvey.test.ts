/**
 * Tests for the staging walk.
 *
 * The single most important property: the walk STOPS at the terminal
 * (100%-progress) page and never clicks its "Next" button, because that click
 * is the submission. Verified here against real captured HTML, without a
 * browser and without touching the network.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { walkSurvey } from '../stage';
import { parsePage } from '../parsePage';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

/**
 * A scripted stand-in for a Playwright Page: it serves a fixed sequence of real
 * captured pages and records every click.
 */
function scriptedPage(sequence: string[]) {
  let index = 0;
  const clicks: number[] = [];

  const current = () => sequence[Math.min(index, sequence.length - 1)];
  const parsedNow = () => parsePage(current());

  const page = {
    get pageIndex() {
      return index;
    },
    get clicks() {
      return clicks;
    },
    content: async () => current(),
    screenshot: async () => Buffer.from(''),
    url: () => `https://www.mcdvoice.com/Survey.aspx?c=${1000 + index}`,
    isClosed: () => false,
    evaluate: async (fn: (...a: unknown[]) => unknown) => {
      const src = fn.toString();
      if (src.includes('ProgressPercentage')) {
        return (parsedNow().progress ?? '').trim() === '100%';
      }
      if (src.includes('inputErrorBorder')) return false;
      if (src.includes("classList.contains('Finish')")) return false;
      if (src.includes('#CN1')) return false;
      return false;
    },
    locator: (selector: string) => makeLocator(selector),
    click: async () => {
      clicks.push(index);
      index++;
    },
    fill: async () => {},
    selectOption: async () => {},
    waitForNavigation: async () => null,
    waitForLoadState: async () => undefined,
    getByRole: () => ({ count: async () => 0, first: () => ({ click: async () => {} }) }),
  };

  function makeLocator(selector: string) {
    const isSubmit = /NextButton|submit/.test(selector);
    const node = {
      count: async () => (isSubmit ? (parsedNow().submitLabel ? 1 : 0) : 1),
      first: () => node,
      getAttribute: async (attr: string) => {
        if (isSubmit && attr === 'value') return parsedNow().submitLabel;
        return null;
      },
      textContent: async () => (isSubmit ? parsedNow().submitLabel : ''),
      isChecked: async () => false,
      click: async () => {
        if (isSubmit) {
          clicks.push(index);
          index++;
        }
      },
    };
    return node;
  }

  return page;
}

const QUESTION_PAGE = 'live-grid-5point.html';
const CHECKBOX_PAGE = 'live-checkbox-multi.html';
const FREETEXT_PAGE = 'live-freetext-comment.html';
const TERMINAL_PAGE = 'live-terminal-100pct.html';

describe('walkSurvey stops at the terminal page', () => {
  it('never clicks the terminal page — the click that would submit', async () => {
    const seq = [QUESTION_PAGE, CHECKBOX_PAGE, TERMINAL_PAGE].map(fixture);
    const page = scriptedPage(seq);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);

    expect(outcome.reachedTerminal).toBe(true);
    // Two advances (pages 0 and 1). The terminal page is index 2 and must not
    // appear in the click log.
    expect(page.clicks).toEqual([0, 1]);
    expect(page.clicks).not.toContain(2);
  });

  it('records the terminal page as terminal in its guard', async () => {
    const seq = [QUESTION_PAGE, TERMINAL_PAGE].map(fixture);
    const page = scriptedPage(seq);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);
    expect(outcome.guard.isTerminal(1)).toBe(true);
  });

  it('still stages the questions ON the terminal page', async () => {
    const seq = [QUESTION_PAGE, TERMINAL_PAGE].map(fixture);
    const page = scriptedPage(seq);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);

    const terminalQuestions = outcome.questions.filter((q) => q.pageIndex === 1);
    expect(terminalQuestions.length).toBeGreaterThan(0);
    // The income dropdown is a select — never guessed.
    expect(terminalQuestions.every((q) => q.needsUser)).toBe(true);
  });

  it('reports the terminal button label, which is still "Next"', async () => {
    const page = scriptedPage([fixture(TERMINAL_PAGE)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);
    expect(outcome.terminalButtonLabel).toBe('Next');
    expect(page.clicks).toEqual([]);
  });

  it('stops immediately when the very first page is terminal', async () => {
    const page = scriptedPage([fixture(TERMINAL_PAGE)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);
    expect(outcome.pages).toBe(1);
    expect(page.clicks).toEqual([]);
  });
});

describe('walkSurvey transcript', () => {
  it('collects questions from every page it visits, in page order', async () => {
    const seq = [QUESTION_PAGE, FREETEXT_PAGE, CHECKBOX_PAGE, TERMINAL_PAGE].map(fixture);
    const page = scriptedPage(seq);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);

    expect(outcome.pages).toBe(4);
    const indices = outcome.questions.map((q) => q.pageIndex);
    expect([...indices].sort((a, b) => a - b)).toEqual(indices);
    expect(new Set(indices)).toEqual(new Set([0, 1, 2, 3]));

    // The S-prefixed free-text box must be present, not dropped as static text.
    expect(outcome.questions.some((q) => q.questionId === 'S081000')).toBe(true);
  });

  it('applies suggested answers where the strategy is confident', async () => {
    const page = scriptedPage([fixture(QUESTION_PAGE), fixture(TERMINAL_PAGE)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);
    const scales = outcome.questions.filter((q) => q.inputType === 'radio_grid');
    expect(scales.length).toBeGreaterThan(0);
    for (const q of scales) {
      expect(q.suggested).not.toBeNull();
      expect(q.needsUser).toBe(false);
    }
  });

  it('honours explicit answers over the strategy (the replay path)', async () => {
    const page = scriptedPage([fixture(QUESTION_PAGE), fixture(TERMINAL_PAGE)]);
    const answers = { R008000: '1' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any, { answers });
    const q = outcome.questions.find((q) => q.questionId === 'R008000');
    expect(q?.suggested).toBe('1');
  });
});

describe('walkSurvey safety limits', () => {
  it('cannot loop forever on a page that never advances', async () => {
    // A single non-terminal page served repeatedly.
    const page = scriptedPage([fixture(QUESTION_PAGE)]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outcome = await walkSurvey(page as any);
    expect(outcome.pages).toBeLessThanOrEqual(40);
  });
});
