'use client';

import type { AnswerValue, StagedQuestion } from '@/lib/types';

export interface QuestionEditorProps {
  question: StagedQuestion & { confirmed?: AnswerValue };
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

/**
 * Renders one staged question with the app's OWN controls. The live site is
 * never surfaced — no embedded browser, no screenshots as the primary UI.
 */
export default function QuestionEditor({ question, value, onChange }: QuestionEditorProps) {
  const unanswered =
    value === null || value === '' || (Array.isArray(value) && value.length === 0);

  return (
    <div
      className="card"
      style={{
        borderColor: question.needsUser && unanswered ? 'var(--accent)' : 'var(--line)',
        margin: '10px 0',
      }}
      id={`q-${question.questionId}`}
    >
      {question.groupPrompt && (
        <p className="muted" style={{ marginTop: 0, marginBottom: 6 }}>
          {question.groupPrompt}
        </p>
      )}

      <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <p style={{ margin: 0, flex: 1, fontWeight: 550 }}>{question.prompt}</p>
        {question.needsUser && unanswered && <span className="pill staged">needs your answer</span>}
      </div>

      {/* Single-select: radio grid or vertical list */}
      {(question.inputType === 'radio_grid' || question.inputType === 'radio_list') && (
        <div className="stack" style={{ marginTop: 10, gap: 6 }}>
          {question.options.map((o) => (
            <label key={o.value} className="row" style={{ gap: 9, cursor: 'pointer' }}>
              <input
                type="radio"
                name={question.questionId}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                style={{ width: 18, height: 18, flexShrink: 0 }}
              />
              <span>{o.label || <em className="muted">(no label)</em>}</span>
            </label>
          ))}
          {value !== null && (
            <button
              className="btn secondary"
              style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 13 }}
              onClick={() => onChange(null)}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Multi-select: a single checkbox that is its own question id */}
      {question.inputType === 'checkbox' && (
        <label className="row" style={{ gap: 9, marginTop: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Array.isArray(value) && value.length > 0}
            onChange={(e) => onChange(e.target.checked ? [question.options[0]?.value ?? '1'] : [])}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
          <span>Yes, I ordered this</span>
        </label>
      )}

      {/* Dropdown */}
      {question.inputType === 'select' && (
        <select
          style={{ marginTop: 10 }}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">— leave blank —</option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {/* Free text */}
      {question.inputType === 'text' && (
        <textarea
          style={{ marginTop: 10 }}
          rows={4}
          placeholder="Optional — leave blank if you'd rather not say"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )}

      {/* Unrecognised type — never guessed, shown honestly */}
      {question.inputType === 'unknown' && (
        <p className="muted" style={{ marginTop: 10 }}>
          survey-snap didn&apos;t recognise this question type, so it was left blank. It will be
          submitted unanswered.
        </p>
      )}

      <p className="muted mono" style={{ marginTop: 10, marginBottom: 0, fontSize: 11 }}>
        {question.questionId} · page {question.pageIndex + 1} · {question.inputType}
      </p>
    </div>
  );
}
