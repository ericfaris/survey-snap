'use client';

import QuestionEditor from './QuestionEditor';
import type { AnswerValue, StagedQuestion } from '@/lib/types';

export default function QuestionList({
  questions,
  answers,
  onChange,
}: {
  questions: StagedQuestion[];
  answers: Record<string, AnswerValue>;
  onChange: (questionId: string, value: AnswerValue) => void;
}) {
  const pages = [...new Set(questions.map((q) => q.pageIndex))].sort((a, b) => a - b);

  return (
    <div>
      {pages.map((pageIndex) => (
        <section key={pageIndex}>
          <h3 style={{ fontSize: 13, color: 'var(--muted)', margin: '22px 0 0' }}>
            Survey page {pageIndex + 1}
          </h3>
          {questions
            .filter((q) => q.pageIndex === pageIndex)
            .map((q) => (
              <QuestionEditor
                key={q.questionId}
                question={q}
                value={answers[q.questionId] ?? null}
                onChange={(v) => onChange(q.questionId, v)}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
