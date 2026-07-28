'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QuestionList from './QuestionList';
import ConfirmSubmitDialog from './ConfirmSubmitDialog';
import type { AnswerValue, Receipt, StagedQuestion } from '@/lib/types';

type StoredQuestion = StagedQuestion & { confirmed: AnswerValue };

function isBlank(v: AnswerValue) {
  return v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

export default function ReviewPanel({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [questions, setQuestions] = useState<StoredQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/receipts/${receiptId}`);
    if (!res.ok) {
      setError('Receipt not found.');
      return;
    }
    const json = await res.json();
    setReceipt(json.receipt);
    setQuestions(json.questions);
    setAnswers(
      Object.fromEntries(
        (json.questions as StoredQuestion[]).map((q) => [
          q.questionId,
          q.confirmed ?? q.suggested ?? null,
        ]),
      ),
    );
  }, [receiptId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Held-session countdown.
  useEffect(() => {
    const stored = sessionStorage.getItem(`survey-snap:expires:${receiptId}`);
    if (stored) setExpiresAt(Number(stored));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [receiptId]);

  const unanswered = useMemo(
    () => questions.filter((q) => q.required && isBlank(answers[q.questionId] ?? null)),
    [questions, answers],
  );
  const answeredCount = useMemo(
    () => questions.filter((q) => !isBlank(answers[q.questionId] ?? null)).length,
    [questions, answers],
  );

  function edit(questionId: string, value: AnswerValue) {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void persist(next), 600);
      return next;
    });
  }

  async function persist(next: Record<string, AnswerValue>) {
    setSaving(true);
    try {
      await fetch(`/api/receipts/${receiptId}/answers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: next }),
      });
    } catch {
      /* the user can retry by editing again */
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await persist(answers);
      const sessionId = sessionStorage.getItem(`survey-snap:session:${receiptId}`);
      const res = await fetch('/api/survey/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          receiptId,
          stagingSessionId: sessionId,
          confirm: true, // set only here, only after the checkbox
          answers,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error);
      router.push(`/receipt/${receiptId}/result`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setDialogOpen(false);
    }
  }

  if (error && !receipt) return <p className="err">{error}</p>;
  if (!receipt) return <p className="muted">Loading…</p>;

  if (receipt.status === 'submitted') {
    return (
      <div className="card">
        <p style={{ marginTop: 0 }}>
          <span className="pill submitted">submitted</span>
        </p>
        <Link className="btn block" href={`/receipt/${receiptId}/result`}>
          View validation code →
        </Link>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="card">
        <p style={{ marginTop: 0 }}>Nothing staged yet for this receipt.</p>
        <Link className="btn block" href={`/receipt/${receiptId}`}>
          ← Back to the receipt
        </Link>
      </div>
    );
  }

  const secondsLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;

  return (
    <div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Review your answers</h2>
        <p className="muted">
          Nothing has been sent to McDonald&apos;s yet. Edit anything below, then confirm.
        </p>
        {secondsLeft !== null && (
          <p className="muted">
            {secondsLeft > 0 ? (
              <>
                Held survey session stays warm for{' '}
                <strong className="mono">
                  {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </strong>
                . Submitting within that window avoids re-entering the code.
              </>
            ) : (
              <>The held session has expired — submitting will re-enter the code and re-run.</>
            )}
          </p>
        )}
      </div>

      {unanswered.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <p style={{ marginTop: 0, fontWeight: 600 }}>
            {unanswered.length === 1
              ? '1 question needs your answer'
              : `${unanswered.length} questions need your answer`}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {unanswered.map((q) => (
              <li key={q.questionId} style={{ marginBottom: 4 }}>
                <a href={`#q-${q.questionId}`}>{q.prompt}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <QuestionList questions={questions} answers={answers} onChange={edit} />

      {error && <p className="err">{error}</p>}

      <div className="card" style={{ position: 'sticky', bottom: 12 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          {answeredCount} of {questions.length} answered{saving ? ' · saving…' : ''}
        </p>
        <button
          className="btn block"
          disabled={unanswered.length > 0 || busy}
          onClick={() => setDialogOpen(true)}
        >
          Confirm &amp; Submit…
        </button>
        {unanswered.length > 0 && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Answer the highlighted questions first.
          </p>
        )}
      </div>

      {dialogOpen && (
        <ConfirmSubmitDialog
          surveyCode={receipt.surveyCode}
          storeNumber={receipt.storeNumber}
          answerCount={answeredCount}
          unansweredCount={questions.length - answeredCount}
          busy={busy}
          onCancel={() => setDialogOpen(false)}
          onConfirm={submit}
        />
      )}
    </div>
  );
}
