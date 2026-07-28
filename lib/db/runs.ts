import { getDb, nowIso } from '../db';
import type { RunPhase, RunStatus, StagedQuestion, SurveyRun } from '../types';

interface Row {
  id: string;
  receipt_id: string;
  phase: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  page_count: number | null;
  transcript_json: string | null;
  final_page_text: string | null;
  error: string | null;
}

function toRun(row: Row): SurveyRun {
  let transcript: StagedQuestion[] = [];
  if (row.transcript_json) {
    try {
      const parsed = JSON.parse(row.transcript_json);
      if (Array.isArray(parsed)) transcript = parsed;
    } catch {
      transcript = [];
    }
  }
  return {
    id: row.id,
    receiptId: row.receipt_id,
    phase: row.phase as RunPhase,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status as RunStatus,
    pageCount: row.page_count,
    transcript,
    finalPageText: row.final_page_text,
    error: row.error,
  };
}

export function createRun(id: string, receiptId: string, phase: RunPhase): SurveyRun {
  getDb()
    .prepare(
      `INSERT INTO survey_runs (id, receipt_id, phase, started_at, status)
       VALUES (?, ?, ?, ?, 'running')`,
    )
    .run(id, receiptId, phase, nowIso());
  return getRun(id)!;
}

export interface RunPatch {
  status?: RunStatus;
  pageCount?: number;
  transcript?: StagedQuestion[];
  finalPageText?: string | null;
  error?: string | null;
  finished?: boolean;
  /** Free-form progress note surfaced by /api/survey/status/[runId]. */
  message?: string;
}

/** In-memory progress notes; not worth a DB column, and lost on restart is fine. */
type Global = typeof globalThis & { __surveySnapRunMessages?: Map<string, string> };
const g = globalThis as Global;
g.__surveySnapRunMessages ??= new Map<string, string>();

export function setRunMessage(runId: string, message: string) {
  g.__surveySnapRunMessages!.set(runId, message);
}

export function getRunMessage(runId: string): string | null {
  return g.__surveySnapRunMessages!.get(runId) ?? null;
}

export function updateRun(id: string, patch: RunPatch): SurveyRun | null {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.pageCount !== undefined) {
    sets.push('page_count = ?');
    values.push(patch.pageCount);
  }
  if (patch.transcript !== undefined) {
    sets.push('transcript_json = ?');
    values.push(JSON.stringify(patch.transcript));
  }
  if (patch.finalPageText !== undefined) {
    sets.push('final_page_text = ?');
    values.push(patch.finalPageText);
  }
  if (patch.error !== undefined) {
    sets.push('error = ?');
    values.push(patch.error);
  }
  if (patch.finished) {
    sets.push('finished_at = ?');
    values.push(nowIso());
  }
  if (patch.message !== undefined) setRunMessage(id, patch.message);

  if (sets.length) {
    values.push(id);
    getDb()
      .prepare(`UPDATE survey_runs SET ${sets.join(', ')} WHERE id = ?`)
      .run(...values);
  }
  return getRun(id);
}

export function getRun(id: string): SurveyRun | null {
  const row = getDb().prepare('SELECT * FROM survey_runs WHERE id = ?').get(id) as Row | undefined;
  return row ? toRun(row) : null;
}

export function latestRun(receiptId: string, phase?: RunPhase): SurveyRun | null {
  const row = phase
    ? (getDb()
        .prepare(
          'SELECT * FROM survey_runs WHERE receipt_id = ? AND phase = ? ORDER BY started_at DESC LIMIT 1',
        )
        .get(receiptId, phase) as Row | undefined)
    : (getDb()
        .prepare('SELECT * FROM survey_runs WHERE receipt_id = ? ORDER BY started_at DESC LIMIT 1')
        .get(receiptId) as Row | undefined);
  return row ? toRun(row) : null;
}
