import type { ReceiptItem, ReceiptMetadata } from '../types';

/**
 * Best-effort receipt metadata from OCR text. Every field is optional and the
 * user can correct all of them in the UI.
 *
 * NOTE: deliberately parsed from the *printed text*, never by slicing fields out
 * of the 26-digit code. Blogs claim a fixed layout inside that code; it is
 * unverified folklore and must not be load-bearing.
 */

export function parseStoreNumber(text: string): string | null {
  const patterns = [
    /(?:store|survey|restaurant)\s*#?\s*:?\s*(\d{3,5})\b/i,
    /\bKS\s*#?\s*\d{1,2}\b[\s\S]{0,40}?\bstore\s*#?\s*(\d{3,5})\b/i,
    /^#\s*(\d{3,5})\s*$/m,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].padStart(5, '0');
  }
  return null;
}

export function parseRegisterNumber(text: string): string | null {
  const m = text.match(/\bKS\s*#?\s*:?\s*(\d{1,2})\b/i) || text.match(/\bREG\s*#?\s*:?\s*(\d{1,2})\b/i);
  return m ? m[1] : null;
}

/** Returns ISO `YYYY-MM-DD`. Receipts print US `MM/DD/YYYY`. */
export function parseVisitDate(text: string): string | null {
  let m = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/);
  if (m) {
    const yy = Number(m[3]);
    const year = yy < 70 ? 2000 + yy : 1900 + yy;
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** Returns 24-hour `HH:MM`. */
export function parseVisitTime(text: string): string | null {
  const m = text.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2];
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && hour < 12) hour += 12;
  if (mer === 'AM' && hour === 12) hour = 0;
  if (hour > 23 || Number(minute) > 59) return null;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function parseOrderNumber(text: string): string | null {
  const m =
    text.match(/order\s*#?\s*:?\s*(\d{1,4})\b/i) ||
    text.match(/\bside\s*\d\s*order\s*#?\s*(\d{1,4})\b/i);
  return m ? m[1] : null;
}

/** Last `Total $N.NN` wins — that is the post-tax figure the survey asks for. */
export function parseTotalAmount(text: string): number | null {
  const matches = [...text.matchAll(/total\s*:?\s*\$?\s*(\d{1,4}\.\d{2})/gi)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
}

const ITEM_NOISE = /^(sub\s*total|subtotal|total|tax|cash|change|debit|credit|visa|mastercard)\b/i;

export function parseItems(text: string): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(.{3,40}?)\s+(\d{1,3}\.\d{2})\s*$/);
    if (!m) continue;
    const name = m[2].trim();
    if (ITEM_NOISE.test(name)) continue;
    items.push({ qty: Number(m[1]), name, price: Number(m[3]) });
  }
  return items;
}

export function extractMetadata(text: string): ReceiptMetadata {
  return {
    storeNumber: parseStoreNumber(text),
    registerNumber: parseRegisterNumber(text),
    visitDate: parseVisitDate(text),
    visitTime: parseVisitTime(text),
    orderNumber: parseOrderNumber(text),
    totalAmount: parseTotalAmount(text),
    items: parseItems(text),
  };
}

/** Heuristic used by the answer strategy: was this a drive-thru visit? */
export function looksLikeDriveThru(text: string): boolean {
  return /drive.?thru|drivethru|\bD\/T\b/i.test(text);
}
