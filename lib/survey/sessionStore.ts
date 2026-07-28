import type { Browser, BrowserContext, Page } from 'playwright';
import type { StagedQuestion } from '../types';
import { closeBrowser } from './browser';

/**
 * Registry of live Chromium sessions held between staging and confirmation.
 *
 * Held deliberately (plan §3.5): the survey has no Back button, so resuming the
 * same session is the only way to submit without re-entering the 26-digit code.
 *
 * The TTL is 15 minutes — under the site's own 1200 s (20 min) server session —
 * so we never hand the user a session that is already dead upstream.
 */
export const SESSION_TTL_MS = 15 * 60 * 1000;

export interface LiveSession {
  id: string;
  receiptId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
  transcript: StagedQuestion[];
  status: 'staged' | 'submitting' | 'closed';
  /** Submit-button label seen on the terminal page, e.g. 'Submit'. */
  terminalButtonLabel: string | null;
}

type Global = typeof globalThis & {
  __surveySnapSessions?: Map<string, LiveSession>;
  __surveySnapSweeper?: NodeJS.Timeout;
};

// Attaching to globalThis is required: Next dev HMR re-evaluates modules and
// would otherwise silently orphan live browsers.
const g = globalThis as Global;
g.__surveySnapSessions ??= new Map<string, LiveSession>();

const sessions = g.__surveySnapSessions;

export function putSession(session: LiveSession) {
  sessions.set(session.id, session);
  ensureSweeper();
}

export function getSession(id: string): LiveSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (isExpired(s)) return null;
  return s;
}

export function isExpired(s: LiveSession): boolean {
  return s.status === 'closed' || Date.now() - s.createdAt >= SESSION_TTL_MS;
}

export function expiresAt(s: LiveSession): string {
  return new Date(s.createdAt + SESSION_TTL_MS).toISOString();
}

/** True when the held page is still usable for the fast (resume) path. */
export function isAlive(s: LiveSession | null): s is LiveSession {
  return !!s && !isExpired(s) && !s.page.isClosed();
}

export async function closeSession(id: string) {
  const s = sessions.get(id);
  sessions.delete(id);
  if (!s) return;
  s.status = 'closed';
  await closeBrowser(s);
}

/** Close any session already held for this receipt — one browser at a time. */
export async function closeSessionsForReceipt(receiptId: string) {
  for (const [id, s] of sessions) {
    if (s.receiptId === receiptId) {
      sessions.delete(id);
      s.status = 'closed';
      await closeBrowser(s);
    }
  }
}

export function listSessions(): LiveSession[] {
  return [...sessions.values()];
}

function ensureSweeper() {
  if (g.__surveySnapSweeper) return;
  g.__surveySnapSweeper = setInterval(() => {
    for (const [id, s] of sessions) {
      if (isExpired(s)) {
        sessions.delete(id);
        void closeBrowser(s);
      }
    }
  }, 60_000);
  // Never keep the process alive just to run the reaper.
  g.__surveySnapSweeper.unref?.();
}
