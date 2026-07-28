import { NextResponse } from 'next/server';
import { getRun, getRunMessage } from '@/lib/db/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Polled by the UI during long runs. Staging takes 30-90s, which is longer than
 * some phone browsers and proxies will hold a request open.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const run = getRun(runId);
  if (!run) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  return NextResponse.json({
    status: run.status,
    phase: run.phase,
    pageIndex: run.pageCount ?? 0,
    message: getRunMessage(runId) ?? run.error ?? run.status,
    error: run.error,
    finishedAt: run.finishedAt,
  });
}
