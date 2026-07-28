'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CodeEditor from './CodeEditor';
import ReceiptMetadataForm, { draftFromReceipt, type MetadataDraft } from './ReceiptMetadataForm';
import type { CodeCandidate, Receipt } from '@/lib/types';

export default function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [draft, setDraft] = useState<MetadataDraft | null>(null);
  const [code, setCode] = useState('');
  const [candidates, setCandidates] = useState<CodeCandidate[]>([]);
  const [rawText, setRawText] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [zoom, setZoom] = useState(false);

  const [ocrBusy, setOcrBusy] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [stageBusy, setStageBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ receiptId: string; message: string } | null>(null);

  /**
   * @param merge when true, keep whatever the user has already typed and only
   *   fill in fields that are still blank. Used after a re-run of OCR so it can
   *   never clobber an in-flight correction. (The survey code in particular is
   *   deliberately never persisted by the OCR route, so a naive reload would
   *   wipe the suggestion the user is looking at.)
   */
  const load = useCallback(
    async (merge = false) => {
      const res = await fetch(`/api/receipts/${receiptId}`);
      if (!res.ok) {
        setError('Receipt not found.');
        return;
      }
      const json = await res.json();
      const r: Receipt = json.receipt;
      setReceipt(r);
      setRawText(r.ocrRawText);
      setCode((prev) => (merge && prev ? prev : (r.surveyCode ?? prev)));
      setDraft((prev) => {
        const fresh = draftFromReceipt(r);
        if (!merge || !prev) return fresh;
        return {
          storeNumber: prev.storeNumber || fresh.storeNumber,
          registerNumber: prev.registerNumber || fresh.registerNumber,
          visitDate: prev.visitDate || fresh.visitDate,
          visitTime: prev.visitTime || fresh.visitTime,
          orderNumber: prev.orderNumber || fresh.orderNumber,
          totalAmount: prev.totalAmount || fresh.totalAmount,
          items: prev.items.length ? prev.items : fresh.items,
        };
      });
    },
    [receiptId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Run OCR automatically the first time a receipt is opened.
  useEffect(() => {
    if (receipt && receipt.ocrRawText === null && !ocrBusy) void runOcr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt]);

  async function runOcr() {
    setOcrBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error);
      await load(true);
      setRawText(json.rawText);
      setCandidates(json.codeCandidates ?? []);
      // The OCR route never persists the code — the user must accept it first —
      // so seed it here, after the reload, and only if nothing is entered yet.
      setCode((prev) => (prev ? prev : (json.bestCode ?? '')));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOcrBusy(false);
    }
  }

  async function save(): Promise<boolean> {
    if (!draft) return false;
    setSaveState('saving');
    setError(null);
    setDuplicate(null);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          surveyCode: code.length === 26 ? code : null,
          storeNumber: draft.storeNumber || null,
          registerNumber: draft.registerNumber || null,
          visitDate: draft.visitDate || null,
          visitTime: draft.visitTime || null,
          orderNumber: draft.orderNumber || null,
          totalAmount: draft.totalAmount ? Number(draft.totalAmount) : null,
          items: draft.items,
        }),
      });
      const json = await res.json();
      if (res.status === 409) {
        setDuplicate({ receiptId: json.receiptId, message: json.message });
        setSaveState('idle');
        return false;
      }
      if (!res.ok) throw new Error(json.message || json.error);
      setReceipt(json.receipt as Receipt);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaveState('idle');
      return false;
    }
  }

  async function saveAndStage() {
    if (!(await save())) return;
    setStageBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/survey/stage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receiptId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error);
      // Hand the held-session id and its deadline to the review screen so it can
      // use the fast path and show a countdown.
      sessionStorage.setItem(`survey-snap:session:${receiptId}`, json.stagingSessionId);
      sessionStorage.setItem(
        `survey-snap:expires:${receiptId}`,
        String(new Date(json.expiresAt).getTime()),
      );
      router.push(`/receipt/${receiptId}/review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStageBusy(false);
    }
  }

  if (error && !receipt) return <p className="err">{error}</p>;
  if (!receipt || !draft) return <p className="muted">Loading…</p>;

  const codeReady = code.length === 26;

  return (
    <div className="stack">
      <div className="card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/receipts/${receiptId}/image`}
          alt="Receipt"
          onClick={() => setZoom((z) => !z)}
          style={{
            width: '100%',
            borderRadius: 10,
            display: 'block',
            cursor: 'zoom-in',
            maxHeight: zoom ? 'none' : 320,
            objectFit: zoom ? 'contain' : 'cover',
            objectPosition: 'top',
          }}
        />
        <p className="muted" style={{ marginBottom: 0 }}>
          Tap the photo to {zoom ? 'shrink' : 'expand'} it while you check the digits.
        </p>
      </div>

      <div className="card">
        <div className="row">
          <h2 style={{ margin: 0, flex: 1, fontSize: 17 }}>Survey code</h2>
          <button className="btn secondary" onClick={runOcr} disabled={ocrBusy}>
            {ocrBusy ? 'Reading…' : 'Re-run OCR'}
          </button>
        </div>
        <p className="muted">Check every digit against the photo — one wrong digit is rejected.</p>
        <CodeEditor value={code} candidates={candidates} onChange={setCode} />

        {rawText && (
          <div style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={() => setShowRaw((s) => !s)}>
              {showRaw ? 'Hide' : 'Show'} raw OCR text
            </button>
            {showRaw && (
              <pre
                className="mono"
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  background: 'var(--panel-2)',
                  padding: 10,
                  borderRadius: 8,
                  maxHeight: 260,
                  overflow: 'auto',
                }}
              >
                {rawText}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 17 }}>Receipt details</h2>
        <ReceiptMetadataForm draft={draft} onChange={setDraft} />
      </div>

      {duplicate && (
        <div className="card" style={{ borderColor: 'var(--red)' }}>
          <p className="err" style={{ marginTop: 0 }}>
            {duplicate.message}
          </p>
          <Link className="btn secondary" href={`/receipt/${duplicate.receiptId}`}>
            Open the existing receipt →
          </Link>
        </div>
      )}

      {error && <p className="err">{error}</p>}

      {receipt.status === 'submitted' ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            <span className="pill submitted">submitted</span>
          </p>
          <Link className="btn block" href={`/receipt/${receiptId}/result`}>
            View validation code →
          </Link>
        </div>
      ) : (
        <div className="stack">
          <button className="btn secondary block" onClick={save} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save changes'}
          </button>
          <button className="btn block" onClick={saveAndStage} disabled={!codeReady || stageBusy}>
            {stageBusy ? 'Staging answers… (30–90s)' : 'Stage survey answers →'}
          </button>
          {!codeReady && <p className="muted">Enter all 26 digits to continue.</p>}
          {receipt.status === 'staged' && (
            <Link className="btn secondary block" href={`/receipt/${receiptId}/review`}>
              Go to staged answers →
            </Link>
          )}
          <p className="muted">
            Staging walks the survey and drafts answers. Nothing is submitted to McDonald&apos;s
            until you confirm on the next screen.
          </p>
        </div>
      )}
    </div>
  );
}
