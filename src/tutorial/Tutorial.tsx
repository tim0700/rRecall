import { useEffect, useState } from 'react';
import { isQuickReview, preselectedGapIds, reviewProgress } from '../core/api';
import { ReviewFeedback } from '../ui/ReviewFeedback';
import { KeyGuide } from '../ui/Settings';
import type {
  Attempt,
  Grade,
  Question,
  Reading,
  ReadingGap,
  SkeletonLevel,
  StoredFile,
} from '../core/types';
import {
  Guide,
  NoteView,
  ReadingView,
  SkeletonView,
  LevelSwitcher,
  recommendedLevel,
} from '../ui/shared';
import { loadTutorialBundle, type TutorialBundleData } from './loader';
import { tutorialSteps } from './steps';
import { FirstWeek, ReviewSchedule, StudyLoop, WhyWriteByHand } from './HowItWorks';
import './Tutorial.css';

const exampleLearnerAnswer = '이산화탄소와 물을 이용합니다.';
const noPhotoIds: string[] = [];

const exampleGrade: Grade = {
  correct: true,
  feedback: '핵심을 잘 설명했어요. 광합성의 두 재료인 이산화탄소와 물이 모두 들어갔어요.',
  missing: [],
};

const questionKindLabels: Record<Question['kind'], string> = {
  term: '용어 떠올리기',
  explain: '내 말로 설명하기',
  apply: '적용해 보기',
  connect: '연결 짓기',
  blank: '빈칸',
  short: '짧은 답',
};

function isNewAttemptShape(attempt: Attempt) {
  return (
    attempt.attemptNumber !== undefined ||
    attempt.hinted !== undefined ||
    attempt.gaveUp !== undefined ||
    attempt.quick !== undefined ||
    attempt.grade.hint !== undefined ||
    attempt.grade.followUp !== undefined
  );
}

interface TutorialWeakPoint {
  sourceGapId: string;
  concept: string;
  detail: string;
  createdAt: string;
}

function ExperienceLabel() {
  return <p className="notice">체험: 미리 만든 결과예요</p>;
}

function Attribution({ text, simulatedDates }: { text?: string; simulatedDates?: boolean }) {
  return (
    <div className="tutorial-attribution muted">
      {simulatedDates && <span className="badge">가정한 날짜</span>}
      <span>{text ?? '튜토리얼용 합성 예시'}</span>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(date);
}

function PhotoPreview({ ids, files }: { ids: string[]; files: StoredFile[] }) {
  const [urls, setUrls] = useState<{ id: string; name: string; url: string }[]>([]);

  useEffect(() => {
    const next = ids.flatMap((id) => {
      const file = files.find(
        (candidate) => candidate.id === id && candidate.mime.startsWith('image/'),
      );
      return file ? [{ id, name: file.name, url: URL.createObjectURL(file.blob) }] : [];
    });
    setUrls(next);
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [files, ids]);

  if (urls.length === 0) {
    return (
      <div className="tutorial-photo-placeholder" role="img" aria-label="백지복습 사진 준비 중">
        <span>사진 예시 준비 중</span>
        <small>실제 사용에서는 종이 사진이 여기에 보여요.</small>
      </div>
    );
  }

  return (
    <div className="tutorial-photo-grid">
      {urls.map((item) => (
        <img key={item.id} src={item.url} alt={item.name} />
      ))}
    </div>
  );
}

export default function Tutorial() {
  const [data, setData] = useState<TutorialBundleData | null>(null);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<SkeletonLevel>(1);
  const [editedReading, setEditedReading] = useState<Reading>();
  const [stepIndex, setStepIndex] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [questionShown, setQuestionShown] = useState(false);
  const [savedWeakPoints, setSavedWeakPoints] = useState<TutorialWeakPoint[] | null>(null);
  const [confirmedGaps, setConfirmedGaps] = useState<Set<string>>(() => new Set());
  const [gapConcepts, setGapConcepts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    loadTutorialBundle()
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setLevel(recommendedLevel(loaded.bundle.lectures[0]?.date));
        const gaps = loaded.bundle.lectures[0]?.recalls[0]?.reading?.gaps ?? [];
        setConfirmedGaps(new Set(preselectedGapIds(gaps)));
        setGapConcepts(Object.fromEntries(gaps.map((gap) => [gap.id, gap.concept])));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : '튜토리얼 예시를 불러오지 못했어요.');
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="tutorial-shell">
        <section className="card">
          <h1>튜토리얼을 열 수 없어요</h1>
          <p>{error}</p>
          <div className="actions">
            <a className="button" href="#/">
              홈으로
            </a>
          </div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="tutorial-shell">
        <p className="notice" role="status">
          튜토리얼을 준비하고 있어요. 잠시만 기다려 주세요.
        </p>
      </div>
    );
  }

  const { bundle, files } = data;
  const step = tutorialSteps[stepIndex];
  const course = bundle.courses[0];
  const lecture = bundle.lectures[0];
  const recall = lecture.recalls[0];
  const reading = editedReading ?? recall?.reading;
  const chat = bundle.chats.find((item) => item.purpose === 'before-recall');
  const lectureAttempts = (bundle.attempts ?? []).filter(
    (attempt) =>
      bundle.questions.some(
        (q) => q.id === attempt.questionId && q.weakPointId === attempt.weakPointId,
      ) &&
      bundle.weakPoints.some((w) => w.id === attempt.weakPointId && w.lectureId === lecture.id),
  );
  const storedAttempt = [...lectureAttempts]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .at(0);
  const weakPoint =
    bundle.weakPoints.find((w) => w.id === storedAttempt?.weakPointId) ?? bundle.weakPoints[0];
  const question =
    bundle.questions.find((q) => q.id === storedAttempt?.questionId) ??
    bundle.questions.find((item) => item.weakPointId === weakPoint?.id) ??
    bundle.questions[0];
  const storedReplayAttempts = question
    ? lectureAttempts
        .filter((attempt) => attempt.questionId === question.id)
        .sort(
          (a, b) =>
            Date.parse(a.at) - Date.parse(b.at) || (a.attemptNumber ?? 1) - (b.attemptNumber ?? 1),
        )
    : [];
  const replayAttempts: Attempt[] =
    storedReplayAttempts.length > 0
      ? storedReplayAttempts
      : question?.id === 'tutorial-question'
        ? [
            {
              id: 'tutorial-example-attempt',
              questionId: question.id,
              weakPointId: question.weakPointId,
              answer: exampleLearnerAnswer,
              grade: exampleGrade,
              at: lecture.date,
            },
          ]
        : [];
  const latestReplayAttempt = replayAttempts.at(-1);
  const hasSavedRetry =
    replayAttempts.some((attempt) => attempt.attemptNumber === 2) ||
    (latestReplayAttempt !== undefined &&
      isNewAttemptShape(latestReplayAttempt) &&
      replayAttempts.length > 1);
  const canRevealWrongAnswer =
    latestReplayAttempt !== undefined &&
    (!isNewAttemptShape(latestReplayAttempt) ||
      latestReplayAttempt.gaveUp === true ||
      hasSavedRetry);
  const acceptedGaps = reading?.gaps.filter((gap) => confirmedGaps.has(gap.id)) ?? [];
  const hasQuestionForAcceptedGap =
    savedWeakPoints?.some((item) => recall?.confirmedGapIds?.includes(item.sourceGapId)) ?? false;
  const isRevealed = revealed.has(step.id);

  const reveal = (id: string) => {
    setRevealed((current) => new Set(current).add(id));
  };

  const changeGap = (gap: ReadingGap) => {
    setConfirmedGaps((current) => {
      const next = new Set(current);
      if (next.has(gap.id)) next.delete(gap.id);
      else next.add(gap.id);
      return next;
    });
  };

  const renderStep = () => {
    switch (step.id) {
      case 'overview':
        return <StudyLoop />;
      case 'key':
        return (
          <section className="card tutorial-key-guide">
            <h2>실제로 시작할 때 따라 하세요</h2>
            <p>API 키는 rRecall이 내 ChatKHU 계정으로 AI를 쓰도록 연결하는 개인 열쇠예요.</p>
            <KeyGuide />
            <p className="muted">튜토리얼에서는 키를 입력하거나 사용하지 않아요.</p>
          </section>
        );
      case 'stt':
        return (
          <section className="card">
            <h2>녹음은 글 파일로 바꿔 주세요</h2>
            <p>
              휴대폰으로 강의를 녹음했다면 Clova Note 같은 음성 기록 앱에서 txt 파일로 내보낼 수
              있어요. 강의에서 자막이나 대본을 제공했다면 그 파일을 그대로 써도 돼요.
            </p>
            <ul>
              <li>사용 가능: txt, srt, vtt</li>
              <li>가져온 뒤 첫 문장을 꼭 확인하기</li>
            </ul>
          </section>
        );
      case 'import':
        return (
          <section className="card">
            <h2>{course.name}</h2>
            <h3>{lecture.title}</h3>
            <p>
              <span className="badge">{lecture.transcriptSource ?? '텍스트'}</span> 문장{' '}
              {lecture.transcript.length}개
            </p>
            <div className="tutorial-transcript-preview">
              {lecture.transcript.slice(0, 4).map((segment, index) => (
                <p key={`${segment.t ?? index}-${index}`}>{segment.text}</p>
              ))}
            </div>
            <p className="muted">
              이 예시는 실제 강의가 아닌, 튜토리얼을 위해 만든 짧은 내용이에요.
            </p>
          </section>
        );
      case 'note':
        return (
          <section className="card">
            {!isRevealed ? (
              <button type="button" onClick={() => reveal(step.id)}>
                노트 만들기 체험
              </button>
            ) : lecture.note ? (
              <>
                <ExperienceLabel />
                <NoteView note={lecture.note} />
              </>
            ) : (
              <p>예시 노트가 없어요.</p>
            )}
          </section>
        );
      case 'skeleton':
        return (
          <section className="card">
            {!isRevealed ? (
              <button type="button" onClick={() => reveal(step.id)}>
                복습 뼈대 만들기 체험
              </button>
            ) : lecture.skeleton ? (
              <>
                <ExperienceLabel />
                <LevelSwitcher level={level} onChange={setLevel} date={lecture.date} />
                <SkeletonView skeleton={lecture.skeleton} note={lecture.note} level={level} />
              </>
            ) : (
              <p>예시 뼈대가 없어요.</p>
            )}
          </section>
        );
      case 'chat': {
        const userMessage = chat?.messages.find((message) => message.role === 'user');
        const assistantMessage = chat?.messages.find((message) => message.role === 'assistant');
        return (
          <section className="card tutorial-chat">
            <p className="tutorial-message user">
              {userMessage?.text ?? '엽록소는 왜 필요한가요?'}
            </p>
            {!isRevealed ? (
              <button type="button" onClick={() => reveal(step.id)}>
                답변 받아보기 체험
              </button>
            ) : (
              <>
                <ExperienceLabel />
                <p className="tutorial-message assistant">
                  {assistantMessage?.text ?? '예시 답변을 준비하고 있어요.'}
                </p>
              </>
            )}
          </section>
        );
      }
      case 'recall':
        return (
          <>
            <WhyWriteByHand />
            <section className="card">
              <h2>검정 펜 → 빨간 펜 → 촬영</h2>
              <PhotoPreview ids={recall?.photoFileIds ?? noPhotoIds} files={files} />
              {recall?.typedText && (
                <div className="tutorial-typed-recall">
                  <strong>글로 입력한 예시</strong>
                  <p>{recall.typedText}</p>
                </div>
              )}
            </section>
          </>
        );
      case 'confirmation':
        return (
          <section className="card">
            {!isRevealed ? (
              <button type="button" onClick={() => reveal(step.id)}>
                백지복습 읽어보기 체험
              </button>
            ) : reading ? (
              <>
                <ExperienceLabel />
                <ReadingView reading={reading} onChange={setEditedReading} />
                <h3>빈칸 · 약점으로 저장할 내용</h3>
                <div className="tutorial-gap-list">
                  {reading.gaps.map((gap) => (
                    <div key={gap.id} className="tutorial-gap">
                      <input
                        type="checkbox"
                        id={`tutorial-gap-${gap.id}`}
                        checked={confirmedGaps.has(gap.id)}
                        onChange={() => changeGap(gap)}
                      />
                      <span>
                        <label className="gap-label" htmlFor={`tutorial-gap-${gap.id}`}>
                          {gap.concept} · 약점으로 남기기
                        </label>
                        <input
                          aria-label={`${gap.concept} 이름 수정`}
                          value={gapConcepts[gap.id] ?? gap.concept}
                          onChange={(event) =>
                            setGapConcepts((current) => ({
                              ...current,
                              [gap.id]: event.target.value,
                            }))
                          }
                        />
                        <small>
                          {gap.why}
                          {gap.uncertain ? ' · 사진 판독이 확실하지 않아요' : ''}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSavedWeakPoints(
                      acceptedGaps.map((gap) => ({
                        sourceGapId: gap.id,
                        concept: gapConcepts[gap.id] ?? gap.concept,
                        detail: gap.why,
                        createdAt: recall?.confirmedAt ?? recall?.date ?? lecture.date,
                      })),
                    )
                  }
                >
                  약점으로 저장 체험
                </button>
                {savedWeakPoints && (
                  <p className="notice">
                    선택한 약점 {savedWeakPoints.length}개를 튜토리얼 메모리에 담았어요.
                  </p>
                )}
                <p className="muted">
                  선택과 수정은 이 튜토리얼 안에서만 유지되며 내 저장소에는 들어가지 않아요.
                </p>
              </>
            ) : (
              <p>읽기 예시가 없어요.</p>
            )}
          </section>
        );
      case 'weak-points':
        return (
          <section className="card">
            <ExperienceLabel />
            <h2>열린 약점</h2>
            {(savedWeakPoints ?? []).map((item) => (
              <article key={item.sourceGapId} className="tutorial-weak-point">
                <h3>{item.concept}</h3>
                <p>{item.detail}</p>
                <p className="muted">등록: {formatDate(item.createdAt)} · 정답 기록 0/2일</p>
              </article>
            ))}
            {savedWeakPoints?.length === 0 && (
              <p className="muted">
                저장한 약점이 없어요. 이전 단계에서 저장할 내용을 골라 주세요.
              </p>
            )}
            {savedWeakPoints === null && (
              <p className="notice">
                이전 단계에서 “약점으로 저장 체험”을 눌러 흐름을 확인해 보세요.
              </p>
            )}
          </section>
        );
      case 'question':
        return (
          <section className="card">
            {!hasQuestionForAcceptedGap ? (
              <p className="muted">
                문제를 만들 약점이 없어요. 결과 확인 단계에서 예시 약점을 선택해 주세요.
              </p>
            ) : !questionShown ? (
              <button type="button" onClick={() => setQuestionShown(true)}>
                약점 문제 만들기 체험
              </button>
            ) : question ? (
              <>
                <ExperienceLabel />
                <p>
                  <span className="badge">{questionKindLabels[question.kind]}</span>{' '}
                  <span className="badge">{question.step === 2 ? '2단계' : '1단계'}</span>
                </p>
                <h2>{question.prompt}</h2>
                {replayAttempts.length > 0 && (
                  <div>
                    <h3>답안 기록</h3>
                    {replayAttempts.map((attempt, index) => (
                      <article key={attempt.id} className="tutorial-weak-point">
                        <p>
                          <span
                            className="badge"
                            title={
                              attempt.quick
                                ? '약점이 생긴 날 푼 답은 단기 기억일 수 있어서 진도에 세지 않아요. 내일부터 푼 답이 진도에 반영돼요.'
                                : undefined
                            }
                          >
                            {attempt.quick
                              ? '오늘 연습 · 진도에 안 셈'
                              : attempt.attemptNumber === 2
                                ? '재도전'
                                : replayAttempts.length > 1
                                  ? `${index + 1}차 답안`
                                  : '학습자 답안'}
                          </span>{' '}
                          {isRevealed && (attempt.grade.correct ? '맞았어요' : '한 번 더 살펴봐요')}
                        </p>
                        <p>{attempt.answer}</p>
                      </article>
                    ))}
                  </div>
                )}
                {!isRevealed ? (
                  <button type="button" onClick={() => reveal(step.id)}>
                    채점 결과 보기 체험
                  </button>
                ) : (
                  <div className="tutorial-grade notice feedback" role="status">
                    {latestReplayAttempt ? (
                      <>
                        <ReviewFeedback
                          question={question}
                          answer={latestReplayAttempt.answer}
                          grade={latestReplayAttempt.grade}
                          reveal={canRevealWrongAnswer}
                        />
                        {latestReplayAttempt.quick ? (
                          <p>오늘 연습 기록이라 해결 횟수에는 포함되지 않아요.</p>
                        ) : (
                          <p>
                            {weakPoint?.resolvedAt
                              ? '저장된 기록에서 해결로 표시된 약점이에요.'
                              : latestReplayAttempt.grade.correct
                                ? '다른 날 2단계 문제까지 맞히면 해결돼요.'
                                : canRevealWrongAnswer
                                  ? '노트의 설명과 비교하고 다음 복습에서 다시 도전해 보세요.'
                                  : '힌트를 참고해 한 번 더 답해 보세요.'}
                          </p>
                        )}
                      </>
                    ) : (
                      <p>이 예시 파일에는 저장된 답안과 채점 결과가 없어요.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p>예시 문제가 없어요.</p>
            )}
          </section>
        );
      case 'review':
        return (
          <>
            <section className="card">
              <h2>오늘 복습한 약점</h2>
              {(savedWeakPoints ?? []).map((item) => {
                const reviewed = recall?.confirmedGapIds?.includes(item.sourceGapId)
                  ? weakPoint
                  : undefined;
                const correctDays = reviewed ? reviewProgress(reviewed).correctDays : 0;
                return (
                  <article key={item.sourceGapId} className="tutorial-weak-point">
                    <h3>{item.concept}</h3>
                    {(reviewed?.reviews ?? []).map((review, index) => (
                      <p key={`${review.date}-${index}`}>
                        <span className="badge">{formatDate(review.date)}</span>{' '}
                        {(review.quick ||
                          (reviewed && isQuickReview(reviewed, new Date(review.date)))) && (
                          <span
                            className="badge"
                            title="약점이 생긴 날 푼 답은 단기 기억일 수 있어서 진도에 세지 않아요. 내일부터 푼 답이 진도에 반영돼요."
                          >
                            오늘 연습 · 진도에 안 셈
                          </span>
                        )}{' '}
                        {review.correct ? '맞힘' : '다시 보기'}
                      </p>
                    ))}
                    {!reviewed?.resolvedAt && (
                      <p className="notice">
                        {correctDays > 0
                          ? '다른 날 2단계 문제까지 맞히면 해결'
                          : '서로 다른 날 두 번, 마지막은 2단계를 맞히면 해결'}
                      </p>
                    )}
                  </article>
                );
              })}
              {savedWeakPoints?.length === 0 && <p className="muted">복습할 약점이 없어요.</p>}
              {savedWeakPoints === null && (
                <p className="muted">먼저 결과 확인 단계에서 약점을 저장해 주세요.</p>
              )}
            </section>
            <ReviewSchedule />
          </>
        );
      case 'final':
        return (
          <>
            <FirstWeek />
            <section className="card tutorial-final">
              <h2>기록에서 기억까지, 한 바퀴를 둘러봤어요</h2>
              <p>내 강의에서는 키 확인부터 시작해 강의 글과 자료를 넣으면 돼요.</p>
              <div className="actions">
                <a className="button primary" href="#/setup">
                  내 강의로 시작하기
                </a>
                <a className="button" href="#/">
                  홈으로
                </a>
              </div>
            </section>
          </>
        );
    }
  };

  return (
    <div className="tutorial-shell">
      <header className="tutorial-header">
        <div>
          <p className="muted">rRecall 튜토리얼</p>
          <h1>
            {stepIndex + 1}. {step.title}
          </h1>
        </div>
        <span className="badge">
          {stepIndex + 1} / {tutorialSteps.length}
        </span>
      </header>

      <div
        className="tutorial-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={tutorialSteps.length}
        aria-valuenow={stepIndex + 1}
        aria-label={`튜토리얼 ${stepIndex + 1}단계`}
      >
        <span style={{ width: `${((stepIndex + 1) / tutorialSteps.length) * 100}%` }} />
      </div>

      <Guide what={step.what} why={step.why} tip={step.tip} />
      {step.content && (
        <Attribution text={bundle.attribution} simulatedDates={bundle.simulatedDates} />
      )}
      {renderStep()}

      <nav className="actions tutorial-nav" aria-label="튜토리얼 이동">
        <button
          type="button"
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          disabled={stepIndex === 0}
        >
          이전
        </button>
        {stepIndex < tutorialSteps.length - 1 && (
          <button
            className="primary"
            type="button"
            onClick={() =>
              setStepIndex((current) => Math.min(tutorialSteps.length - 1, current + 1))
            }
          >
            다음: {tutorialSteps[stepIndex + 1].shortTitle}
          </button>
        )}
      </nav>
    </div>
  );
}
