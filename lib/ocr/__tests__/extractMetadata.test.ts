import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  extractMetadata,
  looksLikeDriveThru,
  parseItems,
  parseTotalAmount,
  parseVisitDate,
  parseVisitTime,
} from '../extractMetadata';

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

describe('extractMetadata over a real tesseract capture', () => {
  const meta = extractMetadata(fixture('receipt-clean.txt'));

  it('parses the store and register numbers', () => {
    expect(meta.storeNumber).toBe('05678');
    expect(meta.registerNumber).toBe('3');
  });

  it('parses date and time into ISO / 24-hour form', () => {
    expect(meta.visitDate).toBe('2026-07-28');
    expect(meta.visitTime).toBe('12:34');
  });

  it('parses the order number and post-tax total', () => {
    expect(meta.orderNumber).toBe('91');
    expect(meta.totalAmount).toBeCloseTo(15.87);
  });

  it('parses line items and skips subtotal/tax/cash noise', () => {
    const names = meta.items.map((i) => i.name);
    expect(names).toContain('Big Mac Meal');
    expect(names).toContain('Fried Apple Pie');
    expect(names).not.toContain('Subtotal');
    expect(names).not.toContain('Total');
    expect(names).not.toContain('CASH');
  });
});

describe('date parsing', () => {
  it('reads MM/DD/YYYY', () => {
    expect(parseVisitDate('KS# 3 07/28/2026')).toBe('2026-07-28');
  });
  it('reads 2-digit years', () => {
    expect(parseVisitDate('date 7/4/26')).toBe('2026-07-04');
  });
  it('returns null when absent', () => {
    expect(parseVisitDate('no date here')).toBeNull();
  });
});

describe('time parsing', () => {
  it('converts PM to 24-hour', () => {
    expect(parseVisitTime('Side 1 12:34:07 PM')).toBe('12:34');
    expect(parseVisitTime('at 1:05 PM')).toBe('13:05');
  });
  it('converts midnight AM correctly', () => {
    expect(parseVisitTime('12:15 AM')).toBe('00:15');
  });
  it('accepts 24-hour input unchanged', () => {
    expect(parseVisitTime('19:42')).toBe('19:42');
  });
  it('rejects impossible times', () => {
    expect(parseVisitTime('99:99')).toBeNull();
  });
});

describe('total parsing', () => {
  it('takes the LAST total (post-tax)', () => {
    expect(parseTotalAmount('Subtotal 10.00\nTotal 10.85')).toBeCloseTo(10.85);
  });
  it('returns null without a total', () => {
    expect(parseTotalAmount('Cash 20.00')).toBeNull();
  });
});

describe('item parsing', () => {
  it('captures qty, name and price', () => {
    expect(parseItems('2 Big Mac 11.98')).toEqual([{ qty: 2, name: 'Big Mac', price: 11.98 }]);
  });
  it('ignores lines that are not priced items', () => {
    expect(parseItems('  1 Med Fries\nThank you')).toEqual([]);
  });
});

describe('drive-thru detection', () => {
  it('recognises the common spellings', () => {
    expect(looksLikeDriveThru('DRIVE THRU')).toBe(true);
    expect(looksLikeDriveThru('Drive-Thru order')).toBe(true);
    expect(looksLikeDriveThru('drivethru')).toBe(true);
    expect(looksLikeDriveThru('Dine In')).toBe(false);
  });
});
