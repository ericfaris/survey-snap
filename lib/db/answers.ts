import { getDb } from '../db';
import type { AnswerValue, InputType, QuestionOption, StagedQuestion } from '../types';

interface Row {
  id: number;
  receipt_id: string;
  question_id: string;
  page_index: number;
  prompt: string;
  input_type: string;
  options_json: string | null;
  suggested: string | null;
  confirmed: string | null;
  needs_user: number;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface StoredAnswer extends StagedQuestion {
  confirmed: AnswerValue;
}

function toAnswer(row: Row): StoredAnswer {
  return {
    questionId: row.question_id,
    pageIndex: row.page_index,
    prompt: row.prompt,
    inputType: row.input_type as InputType,
    options: parseJson<QuestionOption[]>(row.options_json, []),
    suggested: parseJson<AnswerValue>(row.suggested, null),
    confirmed: parseJson<AnswerValue>(row.confirmed, null),
    needsUser: row.needs_user === 1,
    required: true,
  };
}

/**
 * Replace the whole staged answer set for a receipt. Staging is authoritative:
 * a re-stage supersedes anything previously recorded.
 */
export function replaceAnswers(receiptId: string, questions: StagedQuestion[]) {
  const db = getDb();
  const del = db.prepare('DELETE FROM answers WHERE receipt_id = ?');
  const ins = db.prepare(
    `INSERT INTO answers
       (receipt_id, question_id, page_index, prompt, input_type, options_json, suggested, confirmed, needs_user)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    del.run(receiptId);
    for (const q of questions) {
      ins.run(
        receiptId,
        q.questionId,
        q.pageIndex,
        q.groupPrompt ? `${q.groupPrompt} — ${q.prompt}` : q.prompt,
        q.inputType,
        JSON.stringify(q.options),
        JSON.stringify(q.suggested ?? null),
        JSON.stringify(q.suggested ?? null),
        q.needsUser ? 1 : 0,
      );
    }
  })();
}

export function listAnswers(receiptId: string): StoredAnswer[] {
  const rows = getDb()
    .prepare('SELECT * FROM answers WHERE receipt_id = ? ORDER BY page_index, id')
    .all(receiptId) as Row[];
  return rows.map(toAnswer);
}

/** Persist user edits from the review UI. Silently ignores unknown question ids. */
export function setConfirmedAnswers(receiptId: string, answers: Record<string, AnswerValue>) {
  const db = getDb();
  const upd = db.prepare(
    'UPDATE answers SET confirmed = ?, needs_user = ? WHERE receipt_id = ? AND question_id = ?',
  );
  db.transaction(() => {
    for (const [questionId, value] of Object.entries(answers)) {
      const empty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
      upd.run(JSON.stringify(value ?? null), empty ? 1 : 0, receiptId, questionId);
    }
  })();
}

/** Map of questionId -> confirmed (falling back to suggested) for the submit walk. */
export function confirmedAnswerMap(receiptId: string): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const a of listAnswers(receiptId)) {
    out[a.questionId] = a.confirmed ?? a.suggested ?? null;
  }
  return out;
}

/** True when the user's confirmed answers differ from what staging suggested. */
export function answersDifferFromSuggested(
  receiptId: string,
  answers: Record<string, AnswerValue>,
): boolean {
  const stored = listAnswers(receiptId);
  const norm = (v: AnswerValue) => JSON.stringify(Array.isArray(v) ? [...v].sort() : (v ?? null));
  for (const a of stored) {
    if (!(a.questionId in answers)) continue;
    if (norm(answers[a.questionId]) !== norm(a.suggested)) return true;
  }
  return false;
}
