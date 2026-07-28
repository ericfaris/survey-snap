import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReceipt } from '@/lib/db/receipts';
import { listAnswers, setConfirmedAnswers } from '@/lib/db/answers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AnswerValue = z.union([z.string(), z.array(z.string()), z.null()]);
const Body = z.object({ answers: z.record(z.string(), AnswerValue) });

/** Persist the user's edits from the review UI. This never touches the survey. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  if (receipt.status === 'submitted') {
    return NextResponse.json(
      { error: 'ALREADY_SUBMITTED', message: 'This receipt has already been submitted.' },
      { status: 409 },
    );
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Expected { answers }.' },
      { status: 400 },
    );
  }

  setConfirmedAnswers(id, parsed.data.answers);
  return NextResponse.json({ questions: listAnswers(id) });
}
