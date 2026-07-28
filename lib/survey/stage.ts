import { randomUUID } from 'node:crypto';
import type { Page } from 'playwright';
import {
  InvalidCodeError,
  PageBlockedError,
  SubmitGuardError,
  WalkGuard,
  advance,
  applyAnswers,
  enterCode,
  isFinalQuestionPage,
  isTerminalPage,
  readPage,
  submitButtonLabel,
} from './mcdvoice';
import { suggestAnswers, type StrategyContext } from './answerStrategy';
import type { AnswerValue, StagedQuestion } from '../types';

export const MAX_PAGES = 40;
export const WALL_CLOCK_MS = 3 * 60 * 1000;

export interface WalkOutcome {
  questions: StagedQuestion[];
  pages: number;
  terminalButtonLabel: string | null;
  reachedTerminal: boolean;
  blocked: boolean;
  guard: WalkGuard;
}

export interface WalkOptions {
  ctx?: StrategyContext;
  /**
   * Answers to apply instead of the strategy's suggestions, keyed by question
   * id. Used by the confirm phase's replay path.
   */
  answers?: Record<string, AnswerValue>;
  onProgress?: (pageIndex: number, message: string) => void;
}

/**
 * Walk the survey forward, applying answers, and STOP at the terminal page.
 *
 * The terminal page (100% progress) is parsed and its questions are included in
 * the transcript, but `advance()` is never called on it — see the amended rule
 * in the plan §2.5 and the block comment in mcdvoice.ts. Nothing here can
 * submit; submission lives only in the confirm route.
 */
export async function walkSurvey(page: Page, options: WalkOptions = {}): Promise<WalkOutcome> {
  const { ctx = {}, answers, onProgress } = options;
  const guard = new WalkGuard();
  const collected: StagedQuestion[] = [];
  const startedAt = Date.now();

  let terminalButtonLabel: string | null = null;
  let reachedTerminal = false;
  let blocked = false;
  let pageIndex = 0;
  let visited = 0;

  for (; pageIndex < MAX_PAGES; pageIndex++) {
    if (Date.now() - startedAt > WALL_CLOCK_MS) {
      throw new Error(`Staging exceeded its ${WALL_CLOCK_MS / 1000}s time budget.`);
    }

    const read = await readPage(page, pageIndex);
    visited++;
    const questions = answers
      ? read.questions.map((q) => ({
          ...q,
          suggested: answers[q.questionId] ?? null,
          needsUser: (answers[q.questionId] ?? null) === null,
        }))
      : suggestAnswers(read.questions, ctx);

    collected.push(...questions);
    onProgress?.(pageIndex, `Reading page ${pageIndex + 1} (${read.progress ?? '?'} complete)`);

    // ---- Terminal state: record it, never advance from it. ----
    if (await isFinalQuestionPage(page)) {
      guard.markTerminal(pageIndex);
      terminalButtonLabel = await submitButtonLabel(page);
      reachedTerminal = true;
      // Apply answers so the page is ready for the confirm click, but do NOT
      // click. Whoever resumes this session submits from exactly here.
      await applyAnswers(
        page,
        questions,
        answers ?? Object.fromEntries(questions.map((q) => [q.questionId, q.suggested])),
      );
      onProgress?.(pageIndex, 'Reached the final page. Nothing submitted.');
      break;
    }

    // Post-submission page: should be unreachable, but never loop on it.
    if (await isTerminalPage(page)) {
      terminalButtonLabel = await submitButtonLabel(page);
      reachedTerminal = true;
      break;
    }

    await applyAnswers(
      page,
      questions,
      answers ?? Object.fromEntries(questions.map((q) => [q.questionId, q.suggested])),
    );

    try {
      await advance(page, pageIndex, guard);
    } catch (err) {
      if (err instanceof PageBlockedError) {
        // A required field on this page needs the user. Mark them and stop.
        for (const q of collected.filter((q) => q.pageIndex === pageIndex && q.suggested === null)) {
          q.needsUser = true;
        }
        blocked = true;
        break;
      }
      if (err instanceof SubmitGuardError) {
        // Guard fired — treat as terminal, never as a crash.
        guard.markTerminal(pageIndex);
        terminalButtonLabel = await submitButtonLabel(page);
        reachedTerminal = true;
        break;
      }
      throw err;
    }
  }

  return {
    questions: collected,
    pages: visited,
    terminalButtonLabel,
    reachedTerminal,
    blocked,
    guard,
  };
}

export { InvalidCodeError, enterCode, randomUUID };
