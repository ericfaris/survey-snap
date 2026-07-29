import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parsePage } from '../parsePage';
import {
  isNegativePolarity,
  mostPositiveOption,
  positivityScore,
  suggestAnswer,
  suggestAnswers,
} from '../answerStrategy';
import type { StagedQuestion } from '../../types';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const label = (q: StagedQuestion, value: unknown) =>
  q.options.find((o) => o.value === value)?.label;

describe('positivity lexicon', () => {
  it('ranks the strongest positives highest', () => {
    expect(positivityScore('Highly Satisfied')).toBeGreaterThan(positivityScore('Satisfied'));
    expect(positivityScore('Satisfied')).toBeGreaterThan(
      positivityScore('Neither Satisfied nor Dissatisfied'),
    );
    expect(positivityScore('Highly Dissatisfied')).toBeLessThan(0);
  });

  it('picks the most positive option by label', () => {
    expect(
      mostPositiveOption([
        { value: '1', label: 'Highly Dissatisfied' },
        { value: '5', label: 'Highly Satisfied' },
      ]),
    ).toEqual({ value: '5', label: 'Highly Satisfied' });
  });
});

describe('5-point scale — picks the best option by LABEL, which is value "5"', () => {
  const page = parsePage(fixture('grid-5point.html'), 6);
  const answered = suggestAnswers(page.questions);

  it('selects "Highly Satisfied" for the food-quality question', () => {
    const q = answered.find((q) => q.questionId === 'R028000')!;
    expect(label(q, q.suggested)).toBe('Highly Satisfied');
    expect(q.suggested).toBe('5');
    expect(q.needsUser).toBe(false);
  });

  it('does the same for every scale row on the page', () => {
    for (const q of answered.filter((q) => q.inputType === 'radio_grid')) {
      expect(label(q, q.suggested)).toBe('Highly Satisfied');
    }
  });

  it('leaves unparseable PostedFNS entries blank and flagged', () => {
    for (const q of answered.filter((q) => q.inputType === 'unknown')) {
      expect(q.suggested).toBeNull();
      expect(q.needsUser).toBe(true);
    }
  });
});

describe('negative polarity — "Did you experience a problem?" must answer No', () => {
  const page = parsePage(fixture('grid-yesno.html'), 10);
  const [q] = suggestAnswers(page.questions);

  it('detects the negative polarity of the prompt', () => {
    expect(isNegativePolarity('Did you experience a problem during your visit?')).toBe(true);
    expect(isNegativePolarity('The quality of your food.')).toBe(false);
  });

  it('answers No — value "2" here, NOT option 1', () => {
    expect(label(q, q.suggested)).toBe('No');
    expect(q.suggested).toBe('2');
    expect(q.needsUser).toBe(false);
  });
});

describe('Yes/No factual rules', () => {
  const yesNo = (prompt: string): StagedQuestion => ({
    questionId: 'R000060',
    pageIndex: 0,
    prompt,
    inputType: 'radio_grid',
    options: [
      { value: '1', label: 'Yes' },
      { value: '2', label: 'No' },
    ],
    suggested: null,
    needsUser: false,
    required: true,
  });

  it('answers Yes to "did you visit the McDonald\'s located at…" — value "1"', () => {
    const q = yesNo("Did you visit the McDonald's located at 1300 N COAST HWY in NEWPORT, OR?");
    const s = suggestAnswer(q);
    expect(label(q, s.suggested)).toBe('Yes');
    expect(s.suggested).toBe('1');
  });

  it('answers Yes to "Was your order accurate?"', () => {
    const s = suggestAnswer(yesNo('Was your order accurate?'));
    expect(s.suggested).toBe('1');
  });

  it('answers No to the MyMcDonald\'s Rewards question (avoids the follow-up branch)', () => {
    const q = yesNo("Are you a member of MyMcDonald's Rewards?");
    const s = suggestAnswer(q);
    expect(label(q, s.suggested)).toBe('No');
  });
});

describe('vertical single-select', () => {
  const page = parsePage(fixture('radio-vertical.html'), 1);

  it('prefers "With an employee at the restaurant" for order placement', () => {
    const [q] = suggestAnswers(page.questions);
    expect(label(q, q.suggested)).toBe('With an employee at the restaurant');
    expect(q.suggested).toBe('1');
  });
});

describe('visit type — no confident default', () => {
  const visitType: StagedQuestion = {
    questionId: 'R004000',
    pageIndex: 2,
    prompt: 'Please select your visit type:',
    inputType: 'radio_list',
    options: [
      { value: '1', label: 'Drive-thru' },
      { value: '2', label: 'Carry out' },
      { value: '3', label: 'Dine-in' },
    ],
    suggested: null,
    needsUser: false,
    required: true,
  };

  it('picks a provisional first option and still asks the user when the receipt gives no hint', () => {
    // mcdvoice.com has no Back button and rejects a blank required radio,
    // which would permanently stall the staging walk on this page (verified
    // live). A required radio question always gets a provisional pick so
    // staging can keep going; needsUser stays true so the review UI still
    // makes the user confirm it before anything is submitted.
    const s = suggestAnswer(visitType);
    expect(s.suggested).toBe(visitType.options[0].value);
    expect(s.needsUser).toBe(true);
  });

  it('picks Drive-thru when the OCR text says so', () => {
    const s = suggestAnswer(visitType, { ocrText: 'MCDONALDS\nDRIVE THRU\nTotal 15.87' });
    expect(s.suggested).toBe('1');
    expect(s.needsUser).toBe(false);
  });
});

describe('multi-select checkboxes', () => {
  const page = parsePage(fixture('checkbox-multi.html'), 9);

  it('ticks boxes whose label overlaps the receipt line items', () => {
    const answered = suggestAnswers(page.questions, {
      metadata: {
        items: [
          { qty: 1, name: 'Big Mac Meal', price: 9.79 },
          { qty: 1, name: 'Fried Apple Pie', price: 1.79 },
        ],
      },
    });
    const pie = answered.find((q) => q.prompt === 'Fried Apple Pie')!;
    expect(pie.suggested).toEqual(['1']);
    expect(pie.needsUser).toBe(false);
  });

  it('leaves everything unchecked and flagged when nothing matches', () => {
    const answered = suggestAnswers(page.questions, { metadata: { items: [] } });
    for (const q of answered) {
      expect(q.suggested).toBeNull();
      expect(q.needsUser).toBe(true);
    }
  });
});

describe('unrecognised types are never guessed', () => {
  const base = {
    questionId: 'R099999',
    pageIndex: 12,
    options: [],
    suggested: null,
    needsUser: false,
    required: false,
  };

  it('leaves free text blank', () => {
    const s = suggestAnswer({ ...base, prompt: 'Tell us more', inputType: 'text' });
    expect(s).toEqual({ suggested: null, needsUser: true });
  });

  it('leaves dropdowns blank', () => {
    const s = suggestAnswer({
      ...base,
      prompt: 'What is your age?',
      inputType: 'select',
      options: [{ value: '1', label: '18-24' }],
    });
    expect(s).toEqual({ suggested: null, needsUser: true });
  });

  it('leaves unknown types blank', () => {
    const s = suggestAnswer({ ...base, prompt: 'mystery', inputType: 'unknown' });
    expect(s).toEqual({ suggested: null, needsUser: true });
  });

  it('picks a provisional first option for a required radio with no recognisable labels, but still flags it', () => {
    // Same forward-only-site constraint as the visit-type case: a required
    // radio question can never be left blank going into a live click.
    const s = suggestAnswer({
      ...base,
      prompt: 'Pick one',
      inputType: 'radio_list',
      options: [
        { value: '1', label: 'Option A' },
        { value: '2', label: 'Option B' },
      ],
    });
    expect(s).toEqual({ suggested: '1', needsUser: true });
  });

  it('still leaves an optional (non-radio) unrecognised question blank', () => {
    const s = suggestAnswer({ ...base, prompt: 'mystery optional', inputType: 'checkbox' });
    expect(s).toEqual({ suggested: null, needsUser: true });
  });
});
