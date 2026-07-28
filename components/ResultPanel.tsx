'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Receipt, SurveyRun } from '@/lib/types';

export default function ResultPanel({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [run, setRun] = useState<SurveyRun | null>(null);
  const [copied, setCopied] = useState(false);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/receipts/${receiptId}`);
      if (!res.ok) return;
      const json = await res.json();
      setReceipt(json.receipt);
      setRun(json.latestRun);
    })();
  }, [receiptId]);

  if (!receipt) return <p className="muted">Loading…</p>;

  const code = receipt.validationCode;

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard needs a secure context; the code is selectable anyway */
    }
  }

  return (
    <div className="stack">
      <div className="card" style={{ textAlign: 'center' }}>
        {code ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Validation code — write this on your receipt
            </p>
            <p
              className="mono"
              style={{
                fontSize: 40,
                fontWeight: 700,
                letterSpacing: '0.06em',
                margin: '10px 0',
                color: 'var(--accent)',
                userSelect: 'all',
                wordBreak: 'break-all',
              }}
            >
              {code}
            </p>
            <button className="btn" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </>
        ) : (
          <>
            <p className="err" style={{ marginTop: 0 }}>
              The survey was submitted, but survey-snap could not read the validation code
              automatically.
            </p>
            <p className="muted">Read it from the page text or screenshot below.</p>
          </>
        )}
        {receipt.submittedAt && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Submitted {new Date(receipt.submittedAt).toLocaleString()}
          </p>
        )}
      </div>

      {run?.finalPageText && (
        <div className="card">
          <button className="btn secondary block" onClick={() => setShowText((s) => !s)}>
            {showText ? 'Hide' : 'Show'} the final page text
          </button>
          {showText && (
            <pre
              className="mono"
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                background: 'var(--panel-2)',
                padding: 10,
                borderRadius: 8,
                maxHeight: 320,
                overflow: 'auto',
              }}
            >
              {run.finalPageText}
            </pre>
          )}
        </div>
      )}

      {run && (
        <div className="card">
          <p className="muted" style={{ marginTop: 0 }}>
            Screenshot of the final page (fallback)
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/runs/${run.id}/final.png`}
            alt="Final survey page"
            style={{ width: '100%', borderRadius: 8, display: 'block' }}
          />
        </div>
      )}

      <Link className="btn secondary block" href="/">
        ← Back to history
      </Link>
    </div>
  );
}
