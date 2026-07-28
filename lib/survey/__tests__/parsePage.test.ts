import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { hasFieldError, isQuestionId, parsePage } from '../parsePage';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('question id classification', () => {
  it('treats R-prefixed ids as questions and S-prefixed as static text', () => {
    expect(isQuestionId('R028000')).toBe(true);
    expect(isQuestionId('S000100')).toBe(false);
  });
});

describe('parsePage — 5-point satisfaction grid', () => {
  const page = parsePage(fixture('grid-5point.html'), 6);

  it('reads the authoritative field list from #PostedFNS', () => {
    expect(page.postedFns).toEqual([
      'R028000',
      'R006000',
      'R011000',
      'R000351',
      'R007000',
      'R009000',
    ]);
  });

  it('reads the submit label and progress', () => {
    expect(page.submitLabel).toBe('Next');
    expect(page.progress).toBe('4%');
  });

  it('extracts one question per grid row with its prompt', () => {
    const ids = page.questions.filter((q) => q.inputType === 'radio_grid').map((q) => q.questionId);
    expect(ids).toEqual(['R028000', 'R006000', 'R011000']);

    const q = page.questions.find((q) => q.questionId === 'R028000')!;
    expect(q.prompt).toBe('The quality of your food.');
    expect(q.pageIndex).toBe(6);
    expect(q.required).toBe(true);
  });

  it('resolves option labels via aria-labelledby, not by numeric value', () => {
    const q = page.questions.find((q) => q.questionId === 'R028000')!;
    expect(q.options).toEqual([
      { value: '5', label: 'Highly Satisfied' },
      { value: '4', label: 'Satisfied' },
      { value: '3', label: 'Neither Satisfied nor Dissatisfied' },
      { value: '2', label: 'Dissatisfied' },
      { value: '1', label: 'Highly Dissatisfied' },
    ]);
  });

  it('surfaces PostedFNS fields it could not parse rather than dropping them', () => {
    const unknown = page.questions.filter((q) => q.inputType === 'unknown').map((q) => q.questionId);
    expect(unknown).toEqual(['R000351', 'R007000', 'R009000']);
    for (const q of page.questions.filter((q) => q.inputType === 'unknown')) {
      expect(q.needsUser).toBe(true);
      expect(q.suggested).toBeNull();
    }
  });
});

describe('parsePage — Yes/No grid', () => {
  const page = parsePage(fixture('grid-yesno.html'), 10);

  it('parses the question and its two options', () => {
    expect(page.questions).toHaveLength(1);
    const q = page.questions[0];
    expect(q.questionId).toBe('R016000');
    expect(q.prompt).toBe('Did you experience a problem during your visit?');
    expect(q.inputType).toBe('radio_grid');
    expect(q.options).toEqual([
      { value: '1', label: 'Yes' },
      { value: '2', label: 'No' },
    ]);
  });

  it('confirms Yes is value 1 here — the opposite of the 5-point scale', () => {
    const yes = page.questions[0].options.find((o) => o.label === 'Yes')!;
    expect(yes.value).toBe('1');
  });
});

describe('parsePage — vertical single-select + static text', () => {
  const page = parsePage(fixture('radio-vertical.html'), 1);

  it('ignores the static text block (S-prefixed id)', () => {
    expect(page.postedFns).toEqual(['S000100', 'R000455']);
    expect(page.questions.map((q) => q.questionId)).toEqual(['R000455']);
  });

  it('parses the legend as the prompt', () => {
    expect(page.questions[0].prompt).toBe('How did you place your order?');
    expect(page.questions[0].inputType).toBe('radio_list');
  });

  it('keeps DOM order (Opt1, Opt3, Opt2) with correct value/label pairs', () => {
    expect(page.questions[0].options).toEqual([
      { value: '1', label: 'With an employee at the restaurant' },
      { value: '3', label: 'Using the McDonald’s Mobile app' },
      { value: '2', label: 'Using a kiosk inside the restaurant' },
    ]);
  });
});

describe('parsePage — multi-select checkboxes', () => {
  const page = parsePage(fixture('checkbox-multi.html'), 9);

  it('treats each checkbox as its own question id', () => {
    expect(page.questions).toHaveLength(8);
    expect(page.questions.map((q) => q.questionId)).toEqual(page.postedFns);
    for (const q of page.questions) expect(q.inputType).toBe('checkbox');
  });

  it('carries the legend as the group prompt and the label as the item prompt', () => {
    const q = page.questions[0];
    expect(q.groupPrompt).toBe(
      'Which of the following did you order on this visit? (Please select all that apply.)',
    );
    expect(q.prompt).toBe('Breakfast');
    expect(q.options).toEqual([{ value: '1', label: 'Breakfast' }]);
  });

  it('decodes HTML entities in labels', () => {
    expect(page.questions[1].prompt).toBe('Burgers, Chicken & Fish');
  });

  it('marks individual checkboxes as not required', () => {
    for (const q of page.questions) expect(q.required).toBe(false);
  });
});

describe('parsePage — terminal page detection', () => {
  it('reports a submit label that is no longer "Next"', () => {
    const page = parsePage(fixture('terminal-page.html'), 14);
    expect(page.submitLabel).toBe('Submit');
    expect(page.submitLabel).not.toBe('Next');
    expect(page.questions).toHaveLength(0);
  });
});

describe('hasFieldError', () => {
  it('detects the invalid-code signature', () => {
    expect(hasFieldError(fixture('invalid-code.html'))).toBe(true);
  });

  it('does not fire on a normal question page', () => {
    expect(hasFieldError(fixture('grid-5point.html'))).toBe(false);
    expect(hasFieldError(fixture('checkbox-multi.html'))).toBe(false);
  });
});

describe('parsePage — resilience', () => {
  it('never throws on unexpected markup', () => {
    expect(() => parsePage('<html><body><p>hello</p></body></html>')).not.toThrow();
    expect(() => parsePage('')).not.toThrow();
  });

  it('returns empty results rather than crashing', () => {
    const page = parsePage('<html><body></body></html>');
    expect(page.questions).toEqual([]);
    expect(page.postedFns).toEqual([]);
    expect(page.submitLabel).toBeNull();
  });
});
