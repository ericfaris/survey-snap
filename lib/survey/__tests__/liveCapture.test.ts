/**
 * Tests against HTML captured LIVE from mcdvoice.com on 2026-07-28 by
 * `npm run probe:mcdvoice -- --piecemeal --store 05678`.
 *
 * These pin the two places where the live site contradicts the plan's §2.3/§2.4
 * reconnaissance. Both are load-bearing, so they get explicit tests.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from '../parsePage';
import { suggestAnswers } from '../answerStrategy';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('DISCREPANCY 1 — the terminal page is NOT signalled by a changed button label', () => {
  it('the LAST question page still has a button reading exactly "Next"', () => {
    const page = parsePage(fixture('live-last-question-select.html'), 16);
    expect(page.progress).toBe('100%');
    expect(page.submitLabel).toBe('Next');
    // Plan §2.4 rule 1 expected "Submit"/"Finish"/"Done" here. It never appears,
    // so `advance()`'s `value === 'Next'` assertion cannot detect the end of the
    // survey — clicking this "Next" SUBMITS.
  });

  it('the page after it is the Thank-You page: no submit button, body class "Finish"', () => {
    const html = fixture('live-thankyou-validation.html');
    const page = parsePage(html, 17);
    expect(page.submitLabel).toBeNull();
    expect(page.questions).toHaveLength(0);
    expect(html).toMatch(/class="[^"]*\bFinish\b[^"]*"/);
    expect(html).toMatch(/Validation Code/i);
  });

  it('a validation code is present on that page', () => {
    const html = fixture('live-thankyou-validation.html');
    const m = html.replace(/<[^>]+>/g, ' ').match(/Validation Code:\s*([0-9]{4,20})/i);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/^\d{4,20}$/);
  });
});

describe('DISCREPANCY 2 — an S-prefixed id can be a real question', () => {
  const page = parsePage(fixture('live-freetext-comment.html'), 12);

  it('lists S081000 as the page field', () => {
    expect(page.postedFns).toEqual(['S081000']);
  });

  it('parses the free-text comment box rather than dropping it as static text', () => {
    expect(page.questions).toHaveLength(1);
    const q = page.questions[0];
    expect(q.questionId).toBe('S081000');
    expect(q.inputType).toBe('text');
    expect(q.prompt).toMatch(/what you liked best about your experience/i);
  });

  it('never guesses free-text content', () => {
    const [q] = suggestAnswers(page.questions);
    expect(q.suggested).toBeNull();
    expect(q.needsUser).toBe(true);
  });
});

describe('live grid page parses as expected', () => {
  const page = parsePage(fixture('live-grid-5point.html'), 6);

  it('finds all six scale rows', () => {
    const grid = page.questions.filter((q) => q.inputType === 'radio_grid');
    expect(grid).toHaveLength(6);
    expect(page.postedFns).toHaveLength(6);
  });

  it('still selects the most positive option by label', () => {
    for (const q of suggestAnswers(page.questions)) {
      const chosen = q.options.find((o) => o.value === q.suggested);
      expect(chosen?.label).toBe('Highly Satisfied');
    }
  });

  it('confirms question ids drifted from the plan — the parser must not depend on them', () => {
    // Plan §2.3 listed R028000|R006000|R011000|R000351|R007000|R009000 here.
    // Live capture shows a different set on this page index.
    expect(page.postedFns).toContain('R008000');
  });
});

describe('live checkbox page parses as expected', () => {
  const page = parsePage(fixture('live-checkbox-multi.html'), 9);

  it('treats each checkbox as its own question with the legend as group prompt', () => {
    expect(page.questions.length).toBeGreaterThanOrEqual(8);
    for (const q of page.questions) {
      expect(q.inputType).toBe('checkbox');
      expect(q.groupPrompt).toMatch(/which of the following did you order/i);
    }
  });
});
