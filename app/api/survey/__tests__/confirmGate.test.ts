/**
 * Acceptance criterion 6: a survey is submitted ONLY after explicit, per-receipt
 * confirmation.
 *
 * `/api/survey/confirm` is the single code path in the app that can submit. This
 * pins its gate: without `confirm: true` in the body it must refuse, before it
 * looks at anything else.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _resetDbForTests } from '@/lib/db';
import { SubmitGuardError, submitFinalPage } from '@/lib/survey/mcdvoice';

let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-snap-confirm-'));
  _resetDbForTests(path.join(dir, 'test.db'));
  POST = (await import('../confirm/route')).POST;
});

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/survey/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('the confirm gate', () => {
  it('rejects a body with no confirm field', async () => {
    const res = await post({ receiptId: 'anything' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
  });

  it('rejects confirm: false', async () => {
    const res = await post({ receiptId: 'anything', confirm: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
  });

  it('rejects a truthy non-boolean like the string "true"', async () => {
    const res = await post({ receiptId: 'anything', confirm: 'true' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
  });

  it('rejects confirm: 1', async () => {
    const res = await post({ receiptId: 'anything', confirm: 1 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
  });

  it('rejects an empty body', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('CONFIRMATION_REQUIRED');
  });

  it('checks confirmation BEFORE anything else — an unknown receipt with confirm:true gets past the gate to a 404', async () => {
    const res = await post({ receiptId: 'no-such-receipt', confirm: true });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('NOT_FOUND');
  });
});

describe('submitFinalPage refuses without in-code confirmation', () => {
  it('throws when confirmed is false', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      submitFinalPage({} as any, false),
    ).rejects.toThrow(SubmitGuardError);
  });

  it('throws rather than clicking anything', async () => {
    let clicked = false;
    const page = {
      click: async () => {
        clicked = true;
      },
      evaluate: async () => false,
      locator: () => ({ count: async () => 1, first: () => ({ getAttribute: async () => 'Next' }) }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(submitFinalPage(page as any, false)).rejects.toThrow(/confirmation/i);
    expect(clicked).toBe(false);
  });
});
