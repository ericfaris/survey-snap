import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UPLOAD_DIR } from '@/lib/db';

export const runtime = 'nodejs';

/** Screenshot of the terminal page — the manual-read fallback for the code. */
export async function GET(_request: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  if (!/^[a-f0-9-]{36}$/i.test(runId)) {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, `${runId}-final.png`));
    return new NextResponse(new Uint8Array(buf), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}
