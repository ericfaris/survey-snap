import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { UPLOAD_DIR } from '@/lib/db';
import {
  getReceipt,
  incrementReplayAttempts,
  markSubmitted,
  setReceiptStatus,
} from '@/lib/db/receipts';
import { confirmedAnswerMap, setConfirmedAnswers } from '@/lib/db/answers';
import { createRun, updateRun } from '@/lib/db/runs';
import { closeBrowser, launchBrowser } from '@/lib/survey/browser';
import {
  InvalidCodeError,
  enterCode,
  isFinalQuestionPage,
  scrapeValidationCode,
  submitFinalPage,
} from '@/lib/survey/mcdvoice';
import { walkSurvey } from '@/lib/survey/stage';
import {
  closeSession,
  closeSessionsForReceipt,
  getSession,
  isAlive,
} from '@/lib/survey/sessionStore';
import { MAX_REPLAY_ATTEMPTS } from '@/lib/survey/limits';
import type { AnswerValue } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const AnswerSchema = z.union([z.string(), z.array(z.string()), z.null()]);
const Body = z.object({
  receiptId: z.string().min(1),
  stagingSessionId: z.string().nullable().optional(),
  /** Must be literally true. This is the gate for the whole route. */
  confirm: z.boolean(),
  answers: z.record(z.string(), AnswerSchema).optional(),
});

/**
 * Phase 2 — CONFIRM & SUBMIT.
 *
 * ==========================================================================
 * THIS IS THE ONLY ROUTE IN THE APP PERMITTED TO SUBMIT A SURVEY.
 *
 * It is the only caller of `submitFinalPage()`, which is the only function
 * allowed to click a submit button on a 100%-progress page. It hard-rejects
 * unless `confirm: true` is present in the request body, which the UI sets only
 * after the user ticks the confirmation checkbox in ConfirmSubmitDialog.
 *
 * Do not add a flag, env var, "auto mode", or CLI path that reaches this
 * behaviour without that checkbox.
 * ==========================================================================
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));

  // ---- GATE 1: explicit confirmation must be present and true. ----
  if (!parsed.success || parsed.data.confirm !== true) {
    return NextResponse.json(
      {
        error: 'CONFIRMATION_REQUIRED',
        message:
          'Submission requires explicit confirmation. This request did not carry confirm: true.',
      },
      { status: 400 },
    );
  }

  const { receiptId, stagingSessionId, answers: bodyAnswers } = parsed.data;
  const receipt = getReceipt(receiptId);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  // ---- GATE 2: never submit the same receipt twice. ----
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

  if (!receipt.surveyCode) {
    return NextResponse.json(
      { error: 'INVALID_CODE', message: 'This receipt has no confirmed survey code.' },
      { status: 422 },
    );
  }

  if (bodyAnswers) setConfirmedAnswers(receiptId, bodyAnswers);
  const answers: Record<string, AnswerValue> = confirmedAnswerMap(receiptId);

  const runId = randomUUID();
  createRun(runId, receiptId, 'confirm');

  const session = stagingSessionId ? getSession(stagingSessionId) : null;
  const canResume = isAlive(session) && session.receiptId === receiptId;

  try {
    if (canResume) {
      const result = await resumeAndSubmit(session!, answers, runId, receiptId);
      return NextResponse.json({ ...result, path: 'resume' });
    }
    const result = await replayAndSubmit(receipt.surveyCode, answers, runId, receiptId);
    return NextResponse.json({ ...result, path: 'replay' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateRun(runId, { status: 'failed', error: message, finished: true, message });

    if (err instanceof InvalidCodeError) {
      // Never silently mark a receipt submitted when the code was rejected.
      setReceiptStatus(receiptId, 'error', message);
      return NextResponse.json(
        {
          error: 'CODE_REJECTED_ON_REPLAY',
          message:
            'mcdvoice.com rejected the survey code when re-entering it to submit. The code may ' +
            'already have been consumed by the earlier run. This receipt has NOT been recorded ' +
            'as submitted — check the site manually before retrying.',
        },
        { status: 409 },
      );
    }

    setReceiptStatus(receiptId, 'error', message);
    return NextResponse.json({ error: 'SUBMIT_FAILED', message, runId }, { status: 500 });
  }
}

interface SubmitResult {
  validationCode: string | null;
  finalPageText: string;
  screenshotUrl: string;
}

/** Persist the terminal page's text + screenshot — the manual-read safety net. */
async function persistFinalArtifacts(
  runId: string,
  receiptId: string,
  text: string,
  screenshot: Buffer,
  code: string | null,
): Promise<SubmitResult> {
  const file = `${runId}-final.png`;
  await fs.writeFile(path.join(UPLOAD_DIR, file), screenshot);

  updateRun(runId, {
    status: 'submitted',
    finalPageText: text,
    finished: true,
    message: code ? `Validation code ${code}` : 'Submitted, but no code was scraped.',
  });
  markSubmitted(receiptId, code);

  return {
    validationCode: code,
    finalPageText: text,
    screenshotUrl: `/api/runs/${runId}/final.png`,
  };
}

/** Fast path: the held browser is still on the terminal page. One click. */
async function resumeAndSubmit(
  session: NonNullable<ReturnType<typeof getSession>>,
  answers: Record<string, AnswerValue>,
  runId: string,
  receiptId: string,
): Promise<SubmitResult> {
  updateRun(runId, { message: 'Resuming the held survey session…' });
  const page = session.page;
  session.status = 'submitting';

  // Re-apply answers in case the user edited them after staging.
  const { applyAnswers } = await import('@/lib/survey/mcdvoice');
  await applyAnswers(page, session.transcript, answers);

  // Sanity: we must actually be on the terminal page before submitting.
  if (!(await isFinalQuestionPage(page))) {
    // Capture what the page actually shows before we lose the session, so a
    // repeat of this failure is diagnosable instead of a guess. This never
    // clicks anything — read-only.
    let driftedText = '(could not read page text)';
    let driftedUrl = '(unknown)';
    try {
      driftedText = (await page.evaluate(() => document.body?.innerText ?? '')).slice(0, 4000);
      driftedUrl = page.url();
      const shot = await page.screenshot({ fullPage: true }).catch(() => null);
      if (shot) {
        const file = `${runId}-drift.png`;
        await fs.writeFile(path.join(UPLOAD_DIR, file), shot);
      }
    } catch {
      /* best-effort diagnostics only; fall through to the real error */
    }
    updateRun(runId, {
      message: `Drift detail — url: ${driftedUrl}`,
      finalPageText: driftedText,
    });
    throw new Error(
      'The held session is not on the final page any more. Re-stage this receipt and try again.',
    );
  }

  updateRun(runId, { message: 'Submitting…' });
  await submitFinalPage(page, true);

  const { code, text, screenshot } = await scrapeValidationCode(page);
  await closeSession(session.id);
  return persistFinalArtifacts(runId, receiptId, text, screenshot, code);
}

/**
 * Replay path: the held session died or the answers changed materially.
 * Re-enters the code and walks again with the confirmed answers.
 */
async function replayAndSubmit(
  surveyCode: string,
  answers: Record<string, AnswerValue>,
  runId: string,
  receiptId: string,
): Promise<SubmitResult> {
  const attempts = getReceipt(receiptId)?.replayAttempts ?? 0;
  if (attempts >= MAX_REPLAY_ATTEMPTS) {
    const err = new Error(
      `This receipt has already been replayed ${attempts} times. Refusing to try again so the ` +
        'five-surveys-per-month-per-restaurant allowance is not burned.',
    );
    err.name = 'ReplayLimitError';
    throw err;
  }
  incrementReplayAttempts(receiptId);
  await closeSessionsForReceipt(receiptId);

  updateRun(runId, { message: 'Re-entering the survey code…' });
  const bundle = await launchBrowser();
  try {
    await enterCode(bundle.page, surveyCode);

    // Re-parse every live page and match by question id — branching means the
    // page sequence can differ once answers change.
    const outcome = await walkSurvey(bundle.page, {
      answers,
      onProgress: (i, m) => updateRun(runId, { message: `Page ${i + 1}: ${m}` }),
    });

    if (!outcome.reachedTerminal) {
      throw new Error(
        'The replay stopped before the final page — some questions still need answers. ' +
          'Nothing was submitted.',
      );
    }

    updateRun(runId, { message: 'Submitting…' });
    await submitFinalPage(bundle.page, true);

    const { code, text, screenshot } = await scrapeValidationCode(bundle.page);
    return await persistFinalArtifacts(runId, receiptId, text, screenshot, code);
  } finally {
    await closeBrowser(bundle);
  }
}
