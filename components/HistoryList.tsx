'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface ReceiptSummary {
  id: string;
  createdAt: string;
  imageUrl: string;
  maskedCode: string | null;
  storeNumber: string | null;
  visitDate: string | null;
  visitTime: string | null;
  totalAmount: number | null;
  status: 'new' | 'staged' | 'submitted' | 'error';
  validationCode: string | null;
  submittedAt: string | null;
}

const NEXT_STEP: Record<ReceiptSummary['status'], (id: string) => string> = {
  new: (id) => `/receipt/${id}`,
  staged: (id) => `/receipt/${id}/review`,
  submitted: (id) => `/receipt/${id}/result`,
  error: (id) => `/receipt/${id}`,
};

export default function HistoryList() {
  const [receipts, setReceipts] = useState<ReceiptSummary[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/receipts');
        const json = await res.json();
        setReceipts(json.receipts ?? []);
      } catch {
        setReceipts([]);
      }
    })();
  }, []);

  if (receipts === null) return <p className="muted">Loading history…</p>;

  if (!receipts.length) {
    return <p className="muted">No receipts yet. Snap one above to get started.</p>;
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, color: 'var(--muted)', margin: '24px 0 4px' }}>History</h2>
      {receipts.map((r) => (
        <Link key={r.id} href={NEXT_STEP[r.status](r.id)} style={{ color: 'inherit' }}>
          <div className="card row" style={{ gap: 12, alignItems: 'stretch' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.imageUrl}
              alt=""
              style={{
                width: 62,
                height: 62,
                objectFit: 'cover',
                objectPosition: 'top',
                borderRadius: 8,
                flexShrink: 0,
                background: 'var(--panel-2)',
              }}
            />
            <div className="grow">
              <div className="row" style={{ gap: 8 }}>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {r.storeNumber ? `Store #${r.storeNumber}` : 'Unknown store'}
                </span>
                <span className={`pill ${r.status}`}>{r.status}</span>
              </div>

              <p className="muted" style={{ margin: '4px 0 0' }}>
                {r.visitDate ?? new Date(r.createdAt).toLocaleDateString()}
                {r.visitTime ? ` · ${r.visitTime}` : ''}
                {r.totalAmount != null ? ` · $${r.totalAmount.toFixed(2)}` : ''}
              </p>

              <p className="muted mono" style={{ margin: '2px 0 0', fontSize: 12 }}>
                {r.maskedCode ? `code ${r.maskedCode}` : 'no code yet'}
              </p>

              {r.status === 'submitted' && (
                <p style={{ margin: '6px 0 0', fontSize: 14 }}>
                  Validation code{' '}
                  <strong className="mono" style={{ color: 'var(--accent)' }}>
                    {r.validationCode ?? '(not captured — open to read it)'}
                  </strong>
                </p>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
