import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from '@/lib/db';
import { getReceipt } from '@/lib/db/receipts';

export const runtime = 'nodejs';

/**
 * Serve a receipt photo. Images live under `data/` (gitignored, outside
 * `public/`) so they need an explicit route.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const receipt = getReceipt(id);
  if (!receipt) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });

  const abs = path.resolve(ROOT, receipt.imagePath);
  // Defence in depth: never serve anything outside data/.
  if (!abs.startsWith(path.resolve(ROOT, 'data') + path.sep)) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  try {
    const buf = await fs.readFile(abs);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': abs.endsWith('.png') ? 'image/png' : 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
}
