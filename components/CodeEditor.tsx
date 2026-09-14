'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeCandidate } from '@/lib/types';

const LENGTHS = [5, 5, 5, 5, 5, 1];

function toSegments(code: string): string[] {
  const digits = code.replace(/\D/g, '').slice(0, 26);
  const out: string[] = [];
  let i = 0;
  for (const len of LENGTHS) {
    out.push(digits.slice(i, i + len));
    i += len;
  }
  return out;
}

export interface CodeEditorProps {
  value: string | null;
  candidates?: CodeCandidate[];
  onChange: (code: string) => void;
}

/**
 * Six segmented inputs mirroring mcdvoice.com's own 5-5-5-5-5-1 layout.
 * OCR will be wrong sometimes — this editor is a first-class feature, not a
 * fallback, so it supports auto-advance, paste of a whole code, backspace to the
 * previous box, and picking a different OCR candidate.
 */
export default function CodeEditor({ value, candidates = [], onChange }: CodeEditorProps) {
  const [segments, setSegments] = useState<string[]>(() => toSegments(value ?? ''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  /**
   * The parent only holds the concatenated code, so re-deriving segments from it
   * would redistribute the digits whenever a box is partially cleared (emptying
   * box 2 would shift boxes 3-6 left). Remember what we last emitted and only
   * re-sync when the value genuinely changed underneath us.
   */
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setSegments(toSegments(value ?? ''));
  }, [value]);

  const joined = useMemo(() => segments.join(''), [segments]);
  const complete = joined.length === 26;

  function emit(next: string[]) {
    setSegments(next);
    const code = next.join('');
    lastEmitted.current = code;
    onChange(code);
  }

  function setSegment(index: number, raw: string) {
    const digits = raw.replace(/\D/g, '');

    // A paste of the whole code (or a long fragment) refills from here onwards.
    if (digits.length > LENGTHS[index]) {
      const next = [...segments];
      let rest = digits;
      for (let i = index; i < LENGTHS.length && rest.length; i++) {
        next[i] = rest.slice(0, LENGTHS[i]);
        rest = rest.slice(LENGTHS[i]);
      }
      emit(next);
      const last = Math.min(LENGTHS.length - 1, index + 1);
      refs.current[last]?.focus();
      return;
    }

    const next = [...segments];
    next[index] = digits;
    emit(next);
    if (digits.length === LENGTHS[index] && index < LENGTHS.length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  /**
   * Each box carries maxLength, so the browser truncates a pasted 26-digit code
   * to 5 characters before React ever sees it. Intercept the paste itself and
   * distribute the digits across the boxes.
   */
  function onPaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (pasted.length <= LENGTHS[index]) return; // let the browser handle it
    e.preventDefault();
    const next = [...segments];
    let rest = pasted;
    for (let i = index; i < LENGTHS.length && rest.length; i++) {
      next[i] = rest.slice(0, LENGTHS[i]);
      rest = rest.slice(LENGTHS[i]);
    }
    emit(next);
    refs.current[LENGTHS.length - 1]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && segments[index] === '' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
  }

  return (
    <div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {LENGTHS.map((len, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="mono code-box"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label={
              i === 5
                ? 'Digit 26 of the survey code'
                : `Digits ${i * 5 + 1}-${i * 5 + 5} of the survey code`
            }
            maxLength={len}
            value={segments[i] ?? ''}
            onChange={(e) => setSegment(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            style={{
              width: len === 1 ? 48 : 78,
              textAlign: 'center',
              padding: '11px 4px',
              letterSpacing: '0.08em',
              borderColor: complete ? 'var(--green)' : 'var(--line)',
            }}
          />
        ))}
      </div>

      <p className="muted" style={{ marginBottom: 0 }}>
        {joined.length}/26 digits{complete ? ' ✓' : ''}
      </p>

      {candidates.length > 1 && (
        <div style={{ marginTop: 10 }}>
          <label className="field" htmlFor="code-candidates">
            Other OCR readings
          </label>
          <select
            id="code-candidates"
            className="mono"
            value={candidates.some((c) => c.code === joined) ? joined : ''}
            onChange={(e) => e.target.value && emit(toSegments(e.target.value))}
          >
            <option value="">Pick a candidate…</option>
            {candidates.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.source}, score {c.score})
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
