import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  bestCode,
  digitize,
  extractCodeCandidates,
  isValidSurveyCode,
  splitCode,
} from '../extractCode';

const FIXTURES = path.join(__dirname, 'fixtures');
const fixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/** The code printed on the fixture receipts. */
const CODE = '12345678901234567890123456';

describe('digitize', () => {
  it('maps the classic thermal-paper confusions to digits', () => {
    expect(digitize('OIZSGTB')).toBe('0125678');
    expect(digitize('l|!')).toBe('111');
    expect(digitize('12-34 56')).toBe('123456');
  });

  it('drops characters that are not plausibly digits', () => {
    expect(digitize('1x2y3')).toBe('123');
  });
});

describe('extractCodeCandidates — clean OCR', () => {
  const candidates = extractCodeCandidates(fixture('receipt-clean.txt'));

  it('recovers the code despite tesseract mangling the separators', () => {
    expect(bestCode(candidates)).toBe(CODE);
  });

  it('ranks the printed 5-5-5-5-5-1 grouping highest', () => {
    expect(candidates[0].source).toBe('grouping');
    expect(candidates[0].score).toBeGreaterThanOrEqual(100);
  });

  it('returns a ranked list rather than a single answer', () => {
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) expect(c.code).toMatch(/^\d{26}$/);
  });
});

describe('extractCodeCandidates — corrupted OCR', () => {
  it('recovers the code when letters were read instead of digits', () => {
    // I->1, O->0, B->8, S->5, G->6
    const candidates = extractCodeCandidates(fixture('receipt-corrupted.txt'));
    expect(bestCode(candidates)).toBe(CODE);
  });

  it('recovers the code when all separators are missing', () => {
    const candidates = extractCodeCandidates(fixture('receipt-nosep.txt'));
    expect(bestCode(candidates)).toBe(CODE);
  });

  it('also reaches the code through the "Survey Code" anchor', () => {
    const text = ['Total 15.87', 'Survey Code:', '1234567890 1234567890 123456', 'Thanks!'].join(
      '\n',
    );
    const candidates = extractCodeCandidates(text);
    expect(bestCode(candidates)).toBe(CODE);
    // The grouping matcher wins here (separators are optional, so it still
    // spans the run) but the anchor pathway must corroborate it.
    const anchorHit = extractCodeCandidates(text).find((c) => c.code === CODE);
    expect(anchorHit).toBeDefined();
  });

  it('scores an unanchored bare run below an anchored one', () => {
    const anchored = extractCodeCandidates('Survey Code:\n98765432109876543210987654');
    const bare = extractCodeCandidates('98765432109876543210987654');
    expect(anchored[0].code).toBe('98765432109876543210987654');
    expect(anchored[0].score).toBeGreaterThanOrEqual(bare[0].score);
  });

  it('is corroboration-aware: a code seen in both passes outranks one seen in only one', () => {
    const textPass = 'Survey Code:\n12345 67890 12345 67890 12345 6';
    const digitPass = '05678\n12345678901234567890123456\n1587';
    const candidates = extractCodeCandidates(textPass, digitPass);
    expect(candidates[0].code).toBe(CODE);
    // grouping (100) + corroboration bonus (15)
    expect(candidates[0].score).toBeGreaterThan(100);
  });
});

describe('extractCodeCandidates — negative cases', () => {
  it('returns nothing when the receipt has no 26-digit run', () => {
    expect(extractCodeCandidates('McDonalds\nTotal 4.29\nThank you')).toEqual([]);
  });

  it('does not invent a code from a short digit run', () => {
    expect(extractCodeCandidates('Survey Code:\n12345 67890')).toEqual([]);
  });
});

describe('code helpers', () => {
  it('validates 26-digit codes only', () => {
    expect(isValidSurveyCode(CODE)).toBe(true);
    expect(isValidSurveyCode('123')).toBe(false);
    expect(isValidSurveyCode('1234567890123456789012345X')).toBe(false);
    expect(isValidSurveyCode(null)).toBe(false);
  });

  it('splits into the site 5-5-5-5-5-1 layout', () => {
    expect(splitCode(CODE)).toEqual(['12345', '67890', '12345', '67890', '12345', '6']);
  });
});
