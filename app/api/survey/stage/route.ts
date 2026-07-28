import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getReceipt, setReceiptStatus } from '@/lib/db/receipts';
import { replaceAnswers } from '@/lib/db/answers';
import { createRun, updateRun } from '@/lib/db/runs';
import { closeBrowser, launchBrowser } from '@/lib/survey/browser';
import { InvalidCodeError, enterCode } from '@/lib/survey/mcdvoice';
import { walkSurvey } from '@/lib/survey/stage';
import {
  SESSION_TTL_MS,
  closeSessionsForReceipt,
  putSession,
} from '@/lib/survey/sessionStore';
import { isValidSurveyCode } from '@/lib/ocr/extractCode';
import type { StageResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({ receiptId: z.string().min(1) });

/**
 * Phase 1 — STAGE.
 *
 * Walks the survey and records a suggested answer for every question, stopping
 * at the terminal (100% progress) page WITHOUT clicking it. Nothing is
 * submitted here; the browser is held open so the confirm phase can resume it.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Expected { receiptId }.' },
      { status: 400 },
    );
  }

  const receipt = getReceipt(parsed.data.receiptId);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (receipt.status === 'submitted') {
    return NextResponse.json(
      {
        error: 'ALREADY_SUBMITTED',
        message: 'This receipt has already been submitted.',
        validationCode: receipt.validationCode,
      },
      { status: 409 },
    );
  }

  if (!isValidSurveyCode(receipt.surveyCode)) {
    return NextResponse.json(
      {
        error: 'INVALID_CODE',
        message: 'This receipt needs a confirmed 26-digit survey code before staging.',
      },
      { status: 422 },
    );
  }

  // One browser at a time — drop any session already held for this receipt.
  await closeSessionsForReceipt(receipt.id);

  const runId = randomUUID();
  createRun(runId, receipt.id, 'stage');

  const bundle = await launchBrowser();
  let keepOpen = false;

  try {
    updateRun(runId, { message: 'Entering the survey code…' });
    await enterCode(bundle.page, receipt.surveyCode);

    const outcome = await walkSurvey(bundle.page, {
      ctx: { ocrText: receipt.ocrRawText ?? undefined, metadata: { items: receipt.items } },
      onProgress: (pageIndex, message) =>
        updateRun(runId, { message: `Page ${pageIndex + 1}: ${message}` }),
    });

    replaceAnswers(receipt.id, outcome.questions);
    setReceiptStatus(receipt.id, 'staged');
    updateRun(runId, {
      status: 'staged',
      pageCount: outcome.pages,
      transcript: outcome.questions,
      finished: true,
      message: outcome.blocked
        ? 'Stopped early — some questions need your answer.'
        : 'Staged. Nothing has been submitted.',
    });

    const sessionId = randomUUID();
    const createdAt = Date.now();
    putSession({
      id: sessionId,
      receiptId: receipt.id,
      browser: bundle.browser,
      context: bundle.context,
      page: bundle.page,
      createdAt,
      transcript: outcome.questions,
      status: 'staged',
      terminalButtonLabel: outcome.terminalButtonLabel,
    });
    keepOpen = true;

    const result: StageResult & { runId: string; blocked: boolean; reachedTerminal: boolean } = {
      stagingSessionId: sessionId,
      receiptId: receipt.id,
      pages: outcome.pages,
      questions: outcome.questions,
      terminalButtonLabel: outcome.terminalButtonLabel,
      expiresAt: new Date(createdAt + SESSION_TTL_MS).toISOString(),
      runId,
      blocked: outcome.blocked,
      reachedTerminal: outcome.reachedTerminal,
    };
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateRun(runId, { status: 'failed', error: message, finished: true, message });
    setReceiptStatus(receipt.id, 'error', message);

    if (err instanceof InvalidCodeError) {
      return NextResponse.json({ error: 'INVALID_CODE', message }, { status: 422 });
    }
    return NextResponse.json({ error: 'STAGE_FAILED', message, runId }, { status: 500 });
  } finally {
    // Every error path must close the browser — orphaned Chromiums eat RAM.
    if (!keepOpen) await closeBrowser(bundle);
  }
}
