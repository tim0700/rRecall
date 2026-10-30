import { useEffect, useState } from 'react';
import * as api from '../core/api';
import type { Attempt, Lecture, Question, WeakPoint } from '../core/types';
import * as store from '../store';
import { Chat } from './Chat';
import { dueList, Guide, useTask } from './shared';
import { QUESTION_KIND_LABELS, ReviewFeedback } from './ReviewFeedback';

// The hinted retry belongs to the day of the first answer; the next day starts with a fresh question.
const pendingRetry = (attempt?: Attempt) =>
  !!attempt &&
  new Date(attempt.at).toDateString() === new Date().toDateString() &&
  !attempt.practice &&
  attempt.attemptNumber === 1 &&
  !attempt.grade.correct &&
  !attempt.gaveUp;

const quickPracticeTitle =
  '약점이 생긴 날 푼 답은 단기 기억일 수 있어서 진도에 세지 않아요. 내일부터 푼 답이 진도에 반영돼요.';

const followUpQuestionId = (attemptId: string) => `follow-up:${attemptId}`;

export function Tutor({ id }: { id: string }) {
  const [point, setPoint] = useState<WeakPoint>();
  const [lecture, setLecture] = useState<Lecture>();
  const [question, setQuestion] = useState<Question>();
  const [answer, setAnswer] = useState('');
  const [practicing, setPracticing] = useState(false);
  const [followUpAnswer, setFollowUpAnswer] = useState('');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pastQuestions, setPastQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const task = useTask();
  useEffect(() => {
    void task.run(async () => {
      setLoaded(false);
      setAnswer('');
      setPracticing(false);
      setFollowUpAnswer('');
      setQuestion(undefined);
      setLecture(undefined);
      setAttempts([]);
      const w = await store.get('weakPoints', id);
      setPoint(w);
      if (w) {
        setLecture(await store.get('lectures', w.lectureId));
        const questions = (await store.all('questions')).filter((q) => q.weakPointId === id);
        const history = (await store.all('attempts'))
          .filter((a) => a.weakPointId === id)
          .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
        setPastQuestions(questions);
        setAttempts(history);
        // Resume the one allowed retry after reload; a new question must not reset it.
        const countedHistory = history.filter((attempt) => !attempt.practice);
        const last = countedHistory.at(-1);
        const pending = pendingRetry(last)
          ? questions.find((q) => q.id === last?.questionId)
          : undefined;
        const existing =
          pending ??
          questions.find(
            (q) =>
              q.answer.trim().length > 0 &&
              (q.step ?? 1) === api.reviewProgress(w).step &&
              !history.some((a) => a.questionId === q.id) &&
              !w.reviews.some((r) => r.questionId === q.id),
          );
        const completed =
          last && !pendingRetry(last) ? questions.find((q) => q.id === last.questionId) : undefined;
        setQuestion(pending ?? existing ?? completed);
        if (pending) setAnswer(last!.answer);
      }
      setLoaded(true);
    });
  }, [id]);
  if (!point || !lecture)
    return (
      <>
        <h1>{loaded ? '복습할 약점을 찾을 수 없어요' : '복습 준비 중…'}</h1>
        {task.status}
        <a href="#/">홈으로</a>
      </>
    );

  const currentAttempts = attempts.filter((a) => a.questionId === question?.id);
  const countedAttempts = currentAttempts.filter((attempt) => !attempt.practice);
  const lastCountedAttempt = countedAttempts.at(-1);
  const lastAttempt = currentAttempts.at(-1);
  const retry = pendingRetry(lastCountedAttempt);
  const complete = !!lastCountedAttempt && !retry;
  const completionAttempt = complete ? lastCountedAttempt : undefined;
  const followUpPrompt = completionAttempt?.grade.followUp?.trim();
  const followUpQuestion =
    completionAttempt && followUpPrompt
      ? (pastQuestions.find((item) => item.id === followUpQuestionId(completionAttempt.id)) ?? {
          id: followUpQuestionId(completionAttempt.id),
          weakPointId: point.id,
          kind: 'short' as const,
          step: question?.step ?? 1,
          prompt: followUpPrompt,
          answer: '',
          evidence: '',
        })
      : undefined;
  const followUpAttempts = followUpQuestion
    ? attempts.filter((attempt) => attempt.questionId === followUpQuestion.id)
    : [];
  const lastFollowUpAttempt = followUpAttempts.at(-1);
  const progress = api.reviewProgress(point);
  const quick = api.isQuickReview(point, new Date());
  const hiddenTerm =
    question && !complete && (question.kind === 'term' || question.kind === 'blank');

  const feedback = question && lastAttempt && (
    <ReviewFeedback
      question={question}
      answer={lastAttempt.answer}
      grade={{ ...lastAttempt.grade, followUp: undefined }}
      reveal={complete}
    />
  );
  return (
    <>
      <a href={`#/lecture/${point.lectureId}/weak-points`}>← 강의의 약점으로</a>
      <h1>
        {hiddenTerm ? '약점 복습' : point.concept}{' '}
        <span
          className="review-dots"
          role="img"
          aria-label={`해결 진도 ${progress.correctDays} / 2`}
        >
          {'●'.repeat(progress.correctDays)}
          {'○'.repeat(2 - progress.correctDays)}
        </span>
      </h1>
      {point.resolvedAt && dueList([point]).length > 0 && (
        <small className="badge">장기 확인</small>
      )}
      {quick && (
        <small className="badge" title={quickPracticeTitle}>
          오늘 연습 · 진도에 안 셈
        </small>
      )}
      <Guide
        what="노트를 덮고 문제에 답해 보세요."
        why="약점이 생긴 다음 날부터, 서로 다른 날에 힌트 없이 맞히고 나중 문제가 적용·연결 문제이면 해결돼요."
        tip="처음 틀렸을 때는 힌트를 보고 한 번 더 답할 수 있어요. 힌트를 보고 맞힌 답은 기록만 남기고 단계를 올리지 않아요."
      />
      {(!question || complete) && <p>{point.detail}</p>}
      <button
        className={question ? undefined : 'primary'}
        disabled={task.busy || !lecture.note || retry}
        onClick={() =>
          void task.run(async (signal) => {
            const result = await api.makeQuestions({
              weakPoints: [point],
              note: lecture.note!,
              count: 1,
              previousQuestions: pastQuestions,
              attempts,
              settings: store.readSettings(),
              signal,
            });
            await task.usage(result.usage);
            await store.save({ questions: result.value });
            if (result.value.length) {
              setQuestion(result.value[0]);
              setPastQuestions((current) => [...current, ...result.value]);
              setAnswer('');
              setPracticing(false);
              setFollowUpAnswer('');
            } else
              task.setMessage(
                '새 문제의 근거와 정답 노출 여부를 확인하지 못했어요. 다시 시도해 주세요.',
              );
          })
        }
      >
        {question ? '새 문제 만들기' : '복습 문제 만들기'}
      </button>
      {question && (
        <section className="card">
          <h2>
            복습 문제{' '}
            <small className="badge">
              {QUESTION_KIND_LABELS[question.kind]} · {question.step ?? 1}단계
            </small>
          </h2>
          <p className="plain">{question.prompt}</p>
          {retry && feedback}
          {(!complete || practicing) && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (task.busy || !answer.trim()) return;
                const practice = complete;
                void task.run(async (signal) => {
                  const result = await api.gradeAnswer({
                    question,
                    answer: answer.trim(),
                    note: lecture.note!,
                    previousAttempts: currentAttempts,
                    settings: store.readSettings(),
                    signal,
                  });
                  await task.usage(result.usage);
                  const at = new Date();
                  const attempt: Attempt = {
                    id: store.newId(),
                    questionId: question.id,
                    weakPointId: point.id,
                    answer: answer.trim(),
                    grade: result.value,
                    at: at.toISOString(),
                    ...(practice
                      ? { practice: true }
                      : {
                          attemptNumber: retry ? (2 as const) : (1 as const),
                          hinted: retry,
                          quick: api.isQuickReview(point, at),
                        }),
                  };
                  const next = api.applyReview(point, result.value.correct, at, question.id, {
                    step: question.step ?? 1,
                    hinted: retry,
                    practice,
                  });
                  const nextFollowUp =
                    !practice && result.value.followUp?.trim()
                      ? {
                          id: followUpQuestionId(attempt.id),
                          weakPointId: point.id,
                          kind: 'short' as const,
                          step: question.step ?? 1,
                          prompt: result.value.followUp.trim(),
                          answer: '',
                          evidence: '',
                        }
                      : undefined;
                  await store.save({
                    weakPoints: [next],
                    attempts: [attempt],
                    ...(nextFollowUp ? { questions: [nextFollowUp] } : {}),
                  });
                  setAttempts((current) => [...current, attempt]);
                  if (nextFollowUp) setPastQuestions((current) => [...current, nextFollowUp]);
                  setPoint(next);
                  if (practice) setPracticing(false);
                });
              }}
            >
              <label>
                {practicing ? '다시 써 본 내 답' : retry ? '힌트를 보고 다시 쓴 내 답' : '내 답'}
                <textarea
                  rows={4}
                  value={answer}
                  disabled={task.busy}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
              <button className="primary" disabled={task.busy || !answer.trim() || !lecture.note}>
                {retry ? '한 번 더 답하기' : '피드백 받기'}
              </button>
            </form>
          )}
          {!retry && feedback}
          {retry && (
            <button
              disabled={task.busy}
              onClick={() =>
                void task.run(async () => {
                  const updated = { ...lastCountedAttempt!, gaveUp: true };
                  await store.save({ attempts: [updated] });
                  setAttempts((current) => current.map((a) => (a.id === updated.id ? updated : a)));
                })
              }
            >
              이번에는 설명 보기
            </button>
          )}
          {complete && !practicing && (
            <button
              disabled={task.busy}
              onClick={() => {
                setAnswer('');
                setPracticing(true);
              }}
            >
              다시 써 보기
            </button>
          )}
          {followUpQuestion && (
            <section className="notice">
              <h3>한 걸음 더</h3>
              <p className="plain">{followUpQuestion.prompt}</p>
              <small>연습 답안이에요. 해결 진도에는 반영하지 않아요.</small>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (task.busy || !followUpAnswer.trim()) return;
                  void task.run(async (signal) => {
                    const result = await api.gradeAnswer({
                      question: followUpQuestion,
                      answer: followUpAnswer.trim(),
                      note: lecture.note!,
                      previousAttempts: followUpAttempts,
                      settings: store.readSettings(),
                      signal,
                    });
                    await task.usage(result.usage);
                    const at = new Date();
                    const attempt: Attempt = {
                      id: store.newId(),
                      questionId: followUpQuestion.id,
                      weakPointId: point.id,
                      answer: followUpAnswer.trim(),
                      grade: result.value,
                      at: at.toISOString(),
                      practice: true,
                    };
                    const next = api.applyReview(
                      point,
                      result.value.correct,
                      at,
                      followUpQuestion.id,
                      { step: followUpQuestion.step ?? 1, practice: true },
                    );
                    await store.save({
                      questions: [followUpQuestion],
                      weakPoints: [next],
                      attempts: [attempt],
                    });
                    setAttempts((current) => [...current, attempt]);
                    if (!pastQuestions.some((item) => item.id === followUpQuestion.id))
                      setPastQuestions((current) => [...current, followUpQuestion]);
                    setPoint(next);
                  });
                }}
              >
                <label>
                  내 답
                  <textarea
                    rows={3}
                    value={followUpAnswer}
                    disabled={task.busy}
                    onChange={(e) => setFollowUpAnswer(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={task.busy || !followUpAnswer.trim() || !lecture.note}
                >
                  피드백 받기
                </button>
              </form>
              {lastFollowUpAttempt && (
                <ReviewFeedback
                  question={followUpQuestion}
                  answer={lastFollowUpAttempt.answer}
                  grade={{ ...lastFollowUpAttempt.grade, followUp: undefined }}
                  reveal={false}
                />
              )}
            </section>
          )}
        </section>
      )}
      {task.status}
      <section className="card answer-history">
        <h2>최근 답안 기록</h2>
        {attempts.length === 0 && (
          <p className="muted">아직 저장된 답안이 없어요. 위의 문제에 답해 보세요.</p>
        )}
        {[...attempts]
          .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
          .slice(0, 5)
          .map((attempt) => {
            const past = pastQuestions.find((q) => q.id === attempt.questionId);
            const waiting =
              pendingRetry(attempt) &&
              !attempts.some((a) => a.questionId === attempt.questionId && a.attemptNumber === 2);
            return (
              <details key={attempt.id}>
                <summary>
                  {new Date(attempt.at).toLocaleString('ko-KR')} ·{' '}
                  {attempt.practice ? (
                    attempt.questionId.startsWith('follow-up:') ? (
                      '한 걸음 더 · 진도에 안 셈 · '
                    ) : (
                      '다시 써 봄 · 진도에 안 셈 · '
                    )
                  ) : attempt.quick || api.isQuickReview(point, new Date(attempt.at)) ? (
                    <span title={quickPracticeTitle}>
                      {new Date(attempt.at).toDateString() === new Date().toDateString()
                        ? '오늘 연습'
                        : '당일 연습'}{' '}
                      · 진도에 안 셈 ·{' '}
                    </span>
                  ) : (
                    ''
                  )}
                  {attempt.hinted ? '힌트 후 재도전 · ' : ''}
                  {attempt.gaveUp ? '설명 확인' : attempt.grade.correct ? '맞힘' : '다시 보기'}
                </summary>
                <p className="plain">{past?.prompt ?? '복습 문제'}</p>
                <p className="plain">내 답: {attempt.answer}</p>
                <p>{attempt.grade.feedback}</p>
                {waiting ? (
                  <p>힌트 · {attempt.grade.hint}</p>
                ) : (
                  !attempt.practice &&
                  !attempt.grade.correct &&
                  attempt.grade.missing.length > 0 && (
                    <p>보완할 부분 · {attempt.grade.missing.join(' · ')}</p>
                  )
                )}
                {!attempt.practice && attempt.grade.correct && attempt.grade.followUp && (
                  <p>선택 문제 · {attempt.grade.followUp}</p>
                )}
              </details>
            );
          })}
      </section>
      <h2>이 약점 더 알아보기</h2>
      <Chat lecture={lecture} purpose="after-reading" />
    </>
  );
}
