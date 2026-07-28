import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { UPLOAD_DIR } from '@/lib/db';
import { createReceipt, listReceipts } from '@/lib/db/receipts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/receipts — history, newest first. */
export async function GET() {
  const receipts = listReceipts().map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    imageUrl: `/api/receipts/${r.id}/image`,
    surveyCode: r.surveyCode,
    maskedCode: r.surveyCode ? `…${r.surveyCode.slice(-4)}` : null,
    storeNumber: r.storeNumber,
    visitDate: r.visitDate,
    visitTime: r.visitTime,
    totalAmount: r.totalAmount,
    status: r.status,
    validationCode: r.validationCode,
    submittedAt: r.submittedAt,
  }));
  return NextResponse.json({ receipts });
}

/** POST /api/receipts — multipart upload of a receipt photo. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'Expected multipart/form-data with an "image" field.' },
      { status: 400 },
    );
  }

  const file = form.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: 'BAD_REQUEST', message: 'No image supplied.' },
      { status: 400 },
    );
  }

  const receiptId = randomUUID();
  const relPath = path.posix.join('data', 'uploads', `${receiptId}.jpg`);
  const absPath = path.join(UPLOAD_DIR, `${receiptId}.jpg`);

  const input = Buffer.from(await file.arrayBuffer());
  try {
    await sharp(input)
      .rotate() // honour EXIF orientation
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(absPath);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'BAD_IMAGE',
        message: `Could not decode that image: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 400 },
    );
  }

  try {
    createReceipt(receiptId, relPath);
  } catch (err) {
    await fs.rm(absPath, { force: true });
    throw err;
  }

  return NextResponse.json(
    { receiptId, imageUrl: `/api/receipts/${receiptId}/image` },
    { status: 201 },
  );
}
