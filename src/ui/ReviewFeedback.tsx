import type { Grade, Question } from '../core/types';

export const QUESTION_KIND_LABELS: Record<Question['kind'], string> = {
  term: '용어 떠올리기',
  explain: '내 말로 설명하기',
  apply: '적용해 보기',
  connect: '연결 짓기',
  blank: '용어 떠올리기',
  short: '내 말로 설명하기',
};

// Render text nodes, never model-generated HTML. Highlight only missing spans.
function Highlight({ text, missing }: { text: string; missing: string[] }) {
  const spans = missing.filter((part) => part.trim() && text.includes(part));
  if (!spans.length) return <>{text}</>;
  const pattern = spans
    .sort((a, b) => b.length - a.length)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return (
    <>
      {text
        .split(new RegExp(`(${pattern})`, 'g'))
        .map((part, i) => (spans.includes(part) ? <mark key={i}>{part}</mark> : part))}
    </>
  );
}

export function ReviewFeedback({
  question,
  answer,
  grade,
  reveal,
}: {
  question: Question;
  answer: string;
  grade: Grade;
  reveal: boolean;
}) {
  return (
    <aside className="notice feedback" role="status">
      <strong>
        {grade.correct
          ? '잘 떠올렸어요'
          : reveal
            ? '함께 비교해 보세요'
            : '한 번 더 떠올려 볼까요?'}
      </strong>
      <p>{grade.feedback}</p>
      {grade.correct ? (
        grade.followUp && (
          <div>
            <small>선택 · 한 단계 더 생각해 보기 (해결 판정에는 반영하지 않아요)</small>
            <p>{grade.followUp}</p>
          </div>
        )
      ) : reveal ? (
        <>
          <div className="columns answer-comparison">
            <div>
              <h3>내 답</h3>
              <p className="plain">{answer || '답을 남기지 않았어요.'}</p>
            </div>
            <div>
              <h3>노트에 근거한 설명</h3>
              <p className="plain">
                <Highlight text={question.answer} missing={grade.missing} />
              </p>
              <blockquote>
                <Highlight text={question.evidence} missing={grade.missing} />
              </blockquote>
            </div>
          </div>
          {grade.missing.length > 0 && (
            <p>
              보완할 부분 ·{' '}
              {grade.missing.map((part, i) => (
                <span key={i}>
                  {i > 0 && ' · '}
                  <mark>{part}</mark>
                </span>
              ))}
            </p>
          )}
        </>
      ) : (
        <p>힌트 · {grade.hint || '질문이 요구하는 핵심과 이유를 나누어 떠올려 보세요.'}</p>
      )}
    </aside>
  );
}
