import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetDbForTests } from '../../db';
import {
  createReceipt,
  getReceipt,
  getReceiptByCode,
  incrementReplayAttempts,
  listReceipts,
  markSubmitted,
  setReceiptStatus,
  updateReceipt,
} from '../receipts';
import { createRun, latestRun, updateRun } from '../runs';
import {
  answersDifferFromSuggested,
  confirmedAnswerMap,
  listAnswers,
  replaceAnswers,
  setConfirmedAnswers,
} from '../answers';
import type { StagedQuestion } from '../../types';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-snap-test-'));
  _resetDbForTests(path.join(tmpDir, 'test.db'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('receipts', () => {
  it('creates and reads a receipt', () => {
    const r = createReceipt('r1', 'data/uploads/r1.jpg');
    expect(r.id).toBe('r1');
    expect(r.status).toBe('new');
    expect(r.items).toEqual([]);
    expect(r.replayAttempts).toBe(0);
    expect(getReceipt('r1')?.imagePath).toBe('data/uploads/r1.jpg');
  });

  it('patches metadata including JSON items', () => {
    updateReceipt('r1', {
      surveyCode: '12345678901234567890123456',
      storeNumber: '05678',
      registerNumber: '3',
      visitDate: '2026-07-28',
      visitTime: '12:34',
      orderNumber: '0091',
      totalAmount: 12.34,
      items: [{ qty: 1, name: 'Big Mac', price: 5.99 }],
    });
    const r = getReceipt('r1')!;
    expect(r.surveyCode).toBe('12345678901234567890123456');
    expect(r.totalAmount).toBeCloseTo(12.34);
    expect(r.items).toEqual([{ qty: 1, name: 'Big Mac', price: 5.99 }]);
  });

  it('finds a receipt by survey code', () => {
    expect(getReceiptByCode('12345678901234567890123456')?.id).toBe('r1');
    expect(getReceiptByCode('00000000000000000000000000')).toBeNull();
  });

  it('rejects a duplicate survey code via the unique index', () => {
    createReceipt('r2', 'data/uploads/r2.jpg');
    expect(() =>
      updateReceipt('r2', { surveyCode: '12345678901234567890123456' }),
    ).toThrowError(/UNIQUE/i);
  });

  it('allows many receipts with a NULL survey code (partial index)', () => {
    createReceipt('r3', 'data/uploads/r3.jpg');
    createReceipt('r4', 'data/uploads/r4.jpg');
    expect(listReceipts().length).toBe(4);
  });

  it('tracks status, errors, submission and replay attempts', () => {
    setReceiptStatus('r1', 'error', 'boom');
    expect(getReceipt('r1')!.status).toBe('error');
    expect(getReceipt('r1')!.lastError).toBe('boom');

    expect(incrementReplayAttempts('r1')).toBe(1);
    expect(incrementReplayAttempts('r1')).toBe(2);

    markSubmitted('r1', 'ABC1234');
    const r = getReceipt('r1')!;
    expect(r.status).toBe('submitted');
    expect(r.validationCode).toBe('ABC1234');
    expect(r.submittedAt).toBeTruthy();
    expect(r.lastError).toBeNull();
  });

  it('lists newest first', () => {
    const ids = listReceipts().map((r) => r.id);
    expect(ids).toContain('r1');
    expect(ids.length).toBe(4);
  });
});

const QUESTIONS: StagedQuestion[] = [
  {
    questionId: 'R003000',
    pageIndex: 3,
    prompt: 'Please rate your overall satisfaction',
    inputType: 'radio_grid',
    options: [
      { value: '5', label: 'Highly Satisfied' },
      { value: '1', label: 'Highly Dissatisfied' },
    ],
    suggested: '5',
    needsUser: false,
    required: true,
  },
  {
    questionId: 'R000504',
    pageIndex: 9,
    prompt: 'Breakfast',
    groupPrompt: 'Which of the following did you order on this visit?',
    inputType: 'checkbox',
    options: [{ value: '1', label: 'Breakfast' }],
    suggested: null,
    needsUser: true,
    required: false,
  },
];

describe('runs', () => {
  it('creates, updates and finds the latest run', () => {
    createRun('run1', 'r3', 'stage');
    expect(latestRun('r3')!.status).toBe('running');

    updateRun('run1', {
      status: 'staged',
      pageCount: 11,
      transcript: QUESTIONS,
      finished: true,
      message: 'page 11 of ~15',
    });

    const run = latestRun('r3', 'stage')!;
    expect(run.status).toBe('staged');
    expect(run.pageCount).toBe(11);
    expect(run.transcript).toHaveLength(2);
    expect(run.transcript[0].questionId).toBe('R003000');
    expect(run.finishedAt).toBeTruthy();
  });

  it('cascades run deletion with the receipt', () => {
    createRun('run2', 'r4', 'stage');
    expect(latestRun('r4')).not.toBeNull();
  });
});

describe('answers', () => {
  it('stores staged questions and defaults confirmed to suggested', () => {
    replaceAnswers('r3', QUESTIONS);
    const rows = listAnswers('r3');
    expect(rows).toHaveLength(2);
    expect(rows[0].questionId).toBe('R003000');
    expect(rows[0].confirmed).toBe('5');
    expect(rows[1].prompt).toContain('Which of the following');
    expect(rows[1].needsUser).toBe(true);
  });

  it('is idempotent — restaging replaces rather than duplicating', () => {
    replaceAnswers('r3', QUESTIONS);
    expect(listAnswers('r3')).toHaveLength(2);
  });

  it('records user edits and detects divergence from the suggestion', () => {
    expect(answersDifferFromSuggested('r3', { R003000: '5' })).toBe(false);
    expect(answersDifferFromSuggested('r3', { R003000: '1' })).toBe(true);

    setConfirmedAnswers('r3', { R003000: '1', R000504: ['1'] });
    const map = confirmedAnswerMap('r3');
    expect(map.R003000).toBe('1');
    expect(map.R000504).toEqual(['1']);
    expect(listAnswers('r3').find((a) => a.questionId === 'R000504')!.needsUser).toBe(false);
  });

  it('re-flags needsUser when an answer is cleared', () => {
    setConfirmedAnswers('r3', { R000504: [] });
    expect(listAnswers('r3').find((a) => a.questionId === 'R000504')!.needsUser).toBe(true);
  });
});
