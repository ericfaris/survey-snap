import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReceipt, getReceiptByCode, updateReceipt } from '@/lib/db/receipts';
import { listAnswers } from '@/lib/db/answers';
import { latestRun } from '@/lib/db/runs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({
    receipt,
    questions: listAnswers(id),
    latestRun: latestRun(id),
  });
}

const Patch = z.object({
  surveyCode: z
    .string()
    .regex(/^\d{26}$/, 'The survey code must be exactly 26 digits.')
    .nullable()
    .optional(),
  storeNumber: z.string().max(5).nullable().optional(),
  registerNumber: z.string().max(2).nullable().optional(),
  visitDate: z.string().nullable().optional(),
  visitTime: z.string().nullable().optional(),
  orderNumber: z.string().max(4).nullable().optional(),
  totalAmount: z.number().nullable().optional(),
  items: z
    .array(z.object({ qty: z.number(), name: z.string(), price: z.number() }))
    .nullable()
    .optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const parsed = Patch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: parsed.error.issues[0]?.message ?? 'Invalid body.' },
      { status: 400 },
    );
  }

  // Duplicate protection: the same survey code must never be staged twice.
  if (parsed.data.surveyCode) {
    const existing = getReceiptByCode(parsed.data.surveyCode);
    if (existing && existing.id !== id) {
      return NextResponse.json(
        {
          error: 'DUPLICATE_CODE',
          message:
            existing.status === 'submitted'
              ? `You already submitted this receipt — validation code ${existing.validationCode ?? '(not captured)'}.`
              : 'Another receipt in your history already has this survey code.',
          receiptId: existing.id,
          status: existing.status,
          validationCode: existing.validationCode,
        },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({ receipt: updateReceipt(id, parsed.data) });
}
