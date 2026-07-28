import { getDb, nowIso } from '../db';
import type { Receipt, ReceiptItem, ReceiptStatus } from '../types';

interface Row {
  id: string;
  created_at: string;
  updated_at: string;
  image_path: string;
  ocr_raw_text: string | null;
  survey_code: string | null;
  store_number: string | null;
  register_number: string | null;
  visit_date: string | null;
  visit_time: string | null;
  order_number: string | null;
  total_amount: number | null;
  items_json: string | null;
  status: string;
  validation_code: string | null;
  submitted_at: string | null;
  replay_attempts: number;
  last_error: string | null;
}

function toReceipt(row: Row): Receipt {
  let items: ReceiptItem[] = [];
  if (row.items_json) {
    try {
      const parsed = JSON.parse(row.items_json);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = [];
    }
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    imagePath: row.image_path,
    ocrRawText: row.ocr_raw_text,
    surveyCode: row.survey_code,
    storeNumber: row.store_number,
    registerNumber: row.register_number,
    visitDate: row.visit_date,
    visitTime: row.visit_time,
    orderNumber: row.order_number,
    totalAmount: row.total_amount,
    items,
    status: row.status as ReceiptStatus,
    validationCode: row.validation_code,
    submittedAt: row.submitted_at,
    replayAttempts: row.replay_attempts,
    lastError: row.last_error,
  };
}

export function createReceipt(id: string, imagePath: string): Receipt {
  const ts = nowIso();
  getDb()
    .prepare(
      `INSERT INTO receipts (id, created_at, updated_at, image_path, status)
       VALUES (?, ?, ?, ?, 'new')`,
    )
    .run(id, ts, ts, imagePath);
  return getReceipt(id)!;
}

export function getReceipt(id: string): Receipt | null {
  const row = getDb().prepare('SELECT * FROM receipts WHERE id = ?').get(id) as Row | undefined;
  return row ? toReceipt(row) : null;
}

export function getReceiptByCode(code: string): Receipt | null {
  const row = getDb().prepare('SELECT * FROM receipts WHERE survey_code = ?').get(code) as
    | Row
    | undefined;
  return row ? toReceipt(row) : null;
}

export function listReceipts(): Receipt[] {
  const rows = getDb()
    .prepare('SELECT * FROM receipts ORDER BY created_at DESC')
    .all() as Row[];
  return rows.map(toReceipt);
}

/** Fields a user (or the OCR route) is allowed to write back onto a receipt. */
export interface ReceiptPatch {
  ocrRawText?: string | null;
  surveyCode?: string | null;
  storeNumber?: string | null;
  registerNumber?: string | null;
  visitDate?: string | null;
  visitTime?: string | null;
  orderNumber?: string | null;
  totalAmount?: number | null;
  items?: ReceiptItem[] | null;
}

const PATCH_COLUMNS: Record<keyof ReceiptPatch, string> = {
  ocrRawText: 'ocr_raw_text',
  surveyCode: 'survey_code',
  storeNumber: 'store_number',
  registerNumber: 'register_number',
  visitDate: 'visit_date',
  visitTime: 'visit_time',
  orderNumber: 'order_number',
  totalAmount: 'total_amount',
  items: 'items_json',
};

export function updateReceipt(id: string, patch: ReceiptPatch): Receipt | null {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const key of Object.keys(patch) as (keyof ReceiptPatch)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    if (key === 'items') values.push(value === null ? null : JSON.stringify(value));
    else values.push(value as string | number | null);
  }

  if (sets.length) {
    sets.push('updated_at = ?');
    values.push(nowIso());
    values.push(id);
    getDb()
      .prepare(`UPDATE receipts SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values);
  }
  return getReceipt(id);
}

export function setReceiptStatus(id: string, status: ReceiptStatus, lastError?: string | null) {
  getDb()
    .prepare('UPDATE receipts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
    .run(status, lastError ?? null, nowIso(), id);
}

export function markSubmitted(id: string, validationCode: string | null) {
  const ts = nowIso();
  getDb()
    .prepare(
      `UPDATE receipts
          SET status = 'submitted', validation_code = ?, submitted_at = ?,
              last_error = NULL, updated_at = ?
        WHERE id = ?`,
    )
    .run(validationCode, ts, ts, id);
}

export function incrementReplayAttempts(id: string): number {
  getDb()
    .prepare('UPDATE receipts SET replay_attempts = replay_attempts + 1, updated_at = ? WHERE id = ?')
    .run(nowIso(), id);
  return getReceipt(id)?.replayAttempts ?? 0;
}

export function deleteReceipt(id: string) {
  getDb().prepare('DELETE FROM receipts WHERE id = ?').run(id);
}
