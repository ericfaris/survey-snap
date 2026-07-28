import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ROOT } from '@/lib/db';
import { getReceipt, updateReceipt } from '@/lib/db/receipts';
import { ocrReceipt } from '@/lib/ocr';

export const runtime = 'nodejs';
export const maxDuration = 120;

const Body = z.object({ receiptId: z.string().min(1) });

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

  let image: Buffer;
  try {
    image = await fs.readFile(path.resolve(ROOT, receipt.imagePath));
  } catch {
    return NextResponse.json(
      { error: 'IMAGE_MISSING', message: 'The receipt photo is no longer on disk.' },
      { status: 404 },
    );
  }

  let result;
  try {
    result = await ocrReceipt(image);
  } catch (err) {
    return NextResponse.json(
      { error: 'OCR_FAILED', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // Persist the raw text and any metadata the receipt does not already have.
  // Never overwrite a value the user has already corrected. The survey code is
  // deliberately NOT auto-saved — the user must see and accept it first.
  updateReceipt(receipt.id, {
    ocrRawText: result.rawText,
    storeNumber: receipt.storeNumber ?? result.metadata.storeNumber,
    registerNumber: receipt.registerNumber ?? result.metadata.registerNumber,
    visitDate: receipt.visitDate ?? result.metadata.visitDate,
    visitTime: receipt.visitTime ?? result.metadata.visitTime,
    orderNumber: receipt.orderNumber ?? result.metadata.orderNumber,
    totalAmount: receipt.totalAmount ?? result.metadata.totalAmount,
    items: receipt.items.length ? receipt.items : result.metadata.items,
  });

  return NextResponse.json(result);
}
