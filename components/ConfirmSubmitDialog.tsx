'use client';

import { useState } from 'react';

export interface ConfirmSubmitDialogProps {
  surveyCode: string | null;
  storeNumber: string | null;
  answerCount: number;
  unansweredCount: number;
  busy: boolean;
  onCancel: () => void;
  /** Only ever called after the checkbox is ticked. Issues the POST with confirm: true. */
  onConfirm: () => void;
}

/**
 * Step 2 of the two-step submit.
 *
 * The confirm POST is issued ONLY from here, ONLY after the checkbox is ticked.
 * This is the one place in the app whose action leads to a non-"Next" click on
 * mcdvoice.com. Do not add a way around it.
 */
export default function ConfirmSubmitDialog({
  surveyCode,
  storeNumber,
  answerCount,
  unansweredCount,
  busy,
  onCancel,
  onConfirm,
}: ConfirmSubmitDialogProps) {
  const [checked, setChecked] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm submission"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
        padding: 12,
      }}
      onClick={() => !busy && onCancel()}
    >
      <div
        className="card"
        style={{ maxWidth: 520, width: '100%', margin: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Submit to McDonald&apos;s?</h2>

        <dl style={{ margin: '14px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8 }}>
          <dt className="muted">Code</dt>
          <dd className="mono" style={{ margin: 0, wordBreak: 'break-all' }}>
            {surveyCode ?? '—'}
          </dd>
          <dt className="muted">Store</dt>
          <dd style={{ margin: 0 }}>{storeNumber ?? '—'}</dd>
          <dt className="muted">Answers</dt>
          <dd style={{ margin: 0 }}>
            {answerCount} answered
            {unansweredCount > 0 && `, ${unansweredCount} left blank`}
          </dd>
        </dl>

        <p className="muted">
          This sends your answers to McDonald&apos;s and uses up this receipt&apos;s survey code. It
          cannot be undone.
        </p>

        <label className="row" style={{ gap: 10, margin: '14px 0', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            style={{ width: 20, height: 20, flexShrink: 0 }}
          />
          <span>I have reviewed these answers and want to submit them to McDonald&apos;s</span>
        </label>

        <div className="stack">
          <button className="btn block" disabled={!checked || busy} onClick={onConfirm}>
            {busy ? 'Submitting…' : 'Confirm & Submit'}
          </button>
          <button className="btn secondary block" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
