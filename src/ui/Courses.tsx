import { useEffect, useState } from 'react';
import * as api from '../core/api';
import type { Course, Lecture, WeakPoint } from '../core/types';
import * as store from '../store';
import { dueList, errorText, go, Guide, hasKey, presetList, useTask } from './shared';

function weakStatus(w: WeakPoint, due: boolean) {
  if (due) return w.resolvedAt ? '장기 확인 · 오늘 복습' : '오늘 복습';
  const next = api.nextReviewAt(w);
  if (!next) return '해결';
  const days = Math.round(
    (new Date(next).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );
  const when =
    days <= 0
      ? `오늘 ${next.getHours()}시 이후`
      : days === 1
        ? '내일'
        : `${next.getMonth() + 1}월 ${next.getDate()}일`;
  return w.resolvedAt ? `해결 · ${when} 장기 확인` : `${when} 복습`;
}
export function WeakList({ points }: { points: WeakPoint[] }) {
  const due = new Set(dueList(points).map((w) => w.id));
  return points.length ? (
    <ul className="link-list">
      {points.map((w) => (
        <li key={w.id}>
          <a href={`#/tutor/${w.id}`}>{w.concept}</a>
          <span className="badge">{weakStatus(w, due.has(w.id))}</span>
          <small aria-label={`해결 진행 ${api.reviewProgress(w).correctDays} / 2`}>
            {'●'.repeat(api.reviewProgress(w).correctDays)}
            {'○'.repeat(2 - api.reviewProgress(w).correctDays)}
          </small>
        </li>
      ))}
    </ul>
  ) : (
    <p className="muted">아직 복습할 약점이 없어요.</p>
  );
}
export function Home() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [points, setPoints] = useState<WeakPoint[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [name, setName] = useState('');
  const task = useTask();
  useEffect(() => {
    void task.run(async () => {
      setCourses(await store.all('courses'));
      setPoints(await store.all('weakPoints'));
      setLectures(await store.all('lectures'));
    });
  }, []);
  const now = new Date();
  const lectureTasks = api.lectureReviewTasks(
    lectures.filter((lecture) => lecture.note && lecture.skeleton),
    now,
  );
  const duePoints = api.dueWeakPoints(points, now);
  return (
    <>
      <div className="home-hero">
        <p className="eyebrow">기록에서 기억까지</p>
        <h1>
          {hasKey() && courses.length
            ? '오늘은 무엇을 떠올려 볼까요?'
            : '강의를 정리하고, 기억으로 남겨요.'}
        </h1>
        {(!hasKey() || !courses.length) && (
          <p>강의를 정리한 뒤, 보지 않고 떠올려 보세요. 놓친 내용을 다음 복습으로 이어가요.</p>
        )}
        {!hasKey() && (
          <div className="actions">
            <a className="button primary" href="#/setup">
              ChatKHU 키 연결하기
            </a>
          </div>
        )}
        <a className="tutorial-entry" href="#/tutorial">
          키 없이 튜토리얼 둘러보기 →
        </a>
      </div>
      {courses.length > 0 && (
        <section>
          <h2>오늘 할 복습</h2>
          {lectureTasks.length > 0 && (
            <ul className="link-list">
              {lectureTasks.map((task) => {
                const lecture = lectures.find((item) => item.id === task.lectureId)!;
                const days = Math.max(
                  0,
                  Math.floor((now.getTime() - Date.parse(lecture.date)) / 86400000),
                );
                return (
                  <li key={task.lectureId}>
                    <a href={`#/lecture/${task.lectureId}/skeleton/${task.level}`}>
                      {lecture.title} — {task.level}단계 꺼내기
                    </a>
                    <small>
                      강의 후 {days}일 · {task.reason}
                    </small>
                  </li>
                );
              })}
            </ul>
          )}
          {duePoints.length > 0 && <WeakList points={duePoints} />}
          {!lectureTasks.length && !duePoints.length && (
            <div className="notice">
              <strong>오늘 예정된 복습이 없어요.</strong>
              <p>아래 내 과목에서 강의를 이어서 공부해 보세요.</p>
            </div>
          )}
        </section>
      )}
      <section>
        <h2>내 과목</h2>
        {courses.length ? (
          <ul className="link-list">
            {courses.map((c) => (
              <li key={c.id}>
                <a href={`#/course/${c.id}`}>{c.name}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p>첫 과목을 추가해 주세요.</p>
        )}
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              const course = { id: store.newId(), name: name.trim(), createdAt: store.now() };
              await store.put('courses', course);
              setCourses([...courses, course]);
              setName('');
              go(`/course/${course.id}`);
            });
          }}
        >
          <label>
            과목 이름
            <input
              value={name}
              maxLength={100}
              placeholder="예: 자료구조"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className={hasKey() && !courses.length ? 'primary' : undefined}
            disabled={task.busy || !name.trim()}
          >
            과목 추가
          </button>
          <p className="muted">
            {name.trim()
              ? '추가한 과목에 강의를 모을 수 있어요.'
              : '과목 이름을 입력하면 추가할 수 있어요.'}
          </p>
        </form>
      </section>
      {task.status}
    </>
  );
}
export function CoursePage({ id }: { id: string }) {
  const [course, setCourse] = useState<Course>();
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [points, setPoints] = useState<WeakPoint[]>([]);
  const task = useTask();
  const [loaded, setLoaded] = useState(false);
  const [description, setDescription] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string>();
  useEffect(() => {
    void task.run(async () => {
      const found = await store.get('courses', id);
      setCourse(found);
      setDescription(found?.description ?? '');
      setLectures((await store.all('lectures')).filter((l) => l.courseId === id));
      setPoints((await store.all('weakPoints')).filter((w) => w.courseId === id));
      setLoaded(true);
    });
  }, [id]);
  return (
    <>
      <a href="#/">← 내 과목</a>
      <h1>{course?.name ?? (loaded ? '과목을 찾을 수 없어요' : '불러오는 중…')}</h1>
      {course && (
        <>
          <form
            className="card memo-form"
            onSubmit={(event) => {
              event.preventDefault();
              void task.run(async () => {
                const next = { ...course, description: description.trim() };
                await store.put('courses', next);
                setCourse(next);
                task.setMessage('과목 메모를 저장했어요.');
              });
            }}
          >
            <label>
              과목 메모
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="어떤 내용을 배우는 과목인지 자유롭게 적어 보세요."
              />
            </label>
            <div className="form-actions">
              <button disabled={task.busy || description.trim() === (course.description ?? '')}>
                메모 저장
              </button>
            </div>
          </form>
          <div className="section-head">
            <h2>강의 목록</h2>
            <a className="button primary" href={`#/course/${id}/new`}>
              새 강의
            </a>
          </div>
          {lectures.length ? (
            <ul className="link-list">
              {lectures.map((l) =>
                confirmDelete === l.id ? (
                  <li key={l.id} className="confirm-row">
                    <p>
                      <strong>{l.title}</strong>을(를) 지울까요? 노트·뼈대·백지·질문 기록과 이
                      강의의 약점이 함께 지워지고, 되돌릴 수 없어요.
                    </p>
                    <div className="form-actions">
                      <button type="button" onClick={() => setConfirmDelete(undefined)}>
                        취소
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={task.busy}
                        onClick={() =>
                          void task.run(async () => {
                            await store.deleteLecture(l.id);
                            setLectures((all) => all.filter((x) => x.id !== l.id));
                            setPoints((all) => all.filter((w) => w.lectureId !== l.id));
                            setConfirmDelete(undefined);
                            task.setMessage(`${l.title} 강의를 지웠어요.`);
                          })
                        }
                      >
                        삭제
                      </button>
                    </div>
                  </li>
                ) : (
                  <li key={l.id}>
                    <a href={`#/lecture/${l.id}/note`}>{l.title}</a>
                    <small>{new Date(l.date).toLocaleDateString('ko-KR')}</small>
                    <a href={`#/lecture/${l.id}/weak-points`}>
                      열린 약점{' '}
                      {
                        points.filter((point) => point.lectureId === l.id && !point.resolvedAt)
                          .length
                      }
                      개
                    </a>
                    {dueList(points).some((point) => point.lectureId === l.id) && (
                      <span className="badge">오늘 복습</span>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      aria-label={`${l.title} 강의 삭제`}
                      onClick={() => setConfirmDelete(l.id)}
                    >
                      삭제
                    </button>
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p>아직 강의가 없어요. 대본과 자료를 넣어 시작하세요.</p>
          )}
        </>
      )}
      {task.status}
    </>
  );
}
export function TranscriptGuide() {
  return (
    <Guide
      what="강의에서 한 말을 글로 준비해 주세요."
      why="대본과 자료를 함께 읽어 내용의 근거를 확인해요."
      tip="휴대폰 음성 기록 앱(예: 클로바노트)으로 녹음한 뒤 텍스트로 내보내거나, 강의에서 제공한 대본을 이용하세요. 녹음·자료 사용 권한도 확인해 주세요."
    />
  );
}
export function NewLecture({ courseId }: { courseId: string }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('transcript.txt');
  const [selectedFileName, setSelectedFileName] = useState('');
  const [parsed, setParsed] = useState<api.TranscriptImport>();
  const [materials, setMaterials] = useState<File[]>([]);
  const [phase, setPhase] = useState('');
  const [draft, setDraft] = useState<Lecture>();
  const [complete, setComplete] = useState(false);
  const [parseError, setParseError] = useState('');
  const task = useTask();
  const preset = presetList().find((p) => p.id === store.readSettings().preset);
  const size = materials.reduce((sum, f) => sum + f.size, 0);
  function preview() {
    try {
      const result = api.parseTranscript(fileName, text);
      setParsed(result);
      setParseError(result.segments.length ? '' : '대본에서 읽을 수 있는 문장을 찾지 못했어요.');
    } catch (e) {
      setParsed(undefined);
      setParseError(errorText(e));
    }
  }
  async function run(signal: AbortSignal) {
    const course = await store.get('courses', courseId);
    if (!course || !parsed?.segments.length) throw new Error('Invalid course or transcript');
    const settings = store.readSettings();
    let lecture = draft;
    if (!lecture?.note) {
      const files = materials.map(store.storedFile);
      setPhase('노트를 정리하고 있어요. 보통 약 1분이 걸려요.');
      const result = await api.digestNote({
        lectureTitle: title.trim(),
        transcript: parsed.segments,
        materials: files,
        settings,
        signal,
      });
      await task.usage(result.usage);
      lecture = {
        id: store.newId(),
        courseId,
        title: title.trim(),
        date: store.now(),
        transcript: parsed.segments,
        transcriptSource: parsed.source,
        materialFileIds: files.map((f) => f.id),
        recalls: [],
        note: result.value,
      };
      await store.save({ lectures: [lecture], files });
      setDraft(lecture);
    }
    signal.throwIfAborted();
    setPhase('백지복습 뼈대를 만들고 있어요.');
    const points = (await store.all('weakPoints')).filter(
      (w) => w.courseId === courseId && w.lectureId !== lecture?.id && !w.resolvedAt,
    );
    const result = await api.makeSkeleton({
      note: lecture.note!,
      transcript: lecture.transcript,
      openWeakPoints: [...new Set(points.map((w) => w.concept))],
      settings,
      signal,
    });
    await task.usage(result.usage);
    lecture = { ...lecture, skeleton: result.value };
    await store.put('lectures', lecture);
    setDraft(lecture);
    setComplete(true);
    setPhase('노트와 뼈대를 저장했어요.');
  }
  return (
    <>
      <a href={`#/course/${courseId}`}>← 과목으로</a>
      <h1>새 강의</h1>
      <nav className="stepper" aria-label="강의 준비 단계">
        {['대본', '강의자료', '정리'].map((s, i) => (
          <span
            className={step === i ? 'active' : ''}
            aria-current={step === i ? 'step' : undefined}
            key={s}
          >
            {i + 1}. {s}
          </span>
        ))}
      </nav>
      {step === 0 && (
        <>
          <TranscriptGuide />
          <label>
            강의 제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 4주차 · 핵심 개념"
            />
          </label>
          <label>
            대본 파일 (.txt, .srt, .vtt)
            <input
              type="file"
              accept=".txt,.srt,.vtt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void task.run(async () => {
                    setFileName(file.name);
                    setSelectedFileName(file.name);
                    setText(await file.text());
                    setParsed(undefined);
                  });
              }}
            />
          </label>
          {selectedFileName && <p className="file-summary">선택한 대본 · {selectedFileName}</p>}
          <label>
            또는 대본 붙여넣기
            <textarea
              rows={8}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(undefined);
              }}
            />
          </label>
          <button disabled={!text.trim()} onClick={preview}>
            대본 확인하기
          </button>
          {parseError && (
            <p role="alert" className="error">
              {parseError}
            </p>
          )}
          {parsed && (
            <section className="card">
              <h2>대본 미리보기</h2>
              {parsed.segments.slice(0, 5).map((s, i) => (
                <p key={i}>{s.text}</p>
              ))}
              {parsed.warnings.map((w, i) => (
                <p className="notice" key={i}>
                  {w}
                </p>
              ))}
              <p>
                {parsed.segments.length}개 문단 · {parsed.source}
              </p>
            </section>
          )}
          <div className="actions wizard-actions">
            <p className="muted">
              {!title.trim()
                ? '강의 제목을 입력해 주세요.'
                : !parsed?.segments.length
                  ? '대본을 넣고 ‘대본 확인하기’를 눌러 주세요.'
                  : '대본을 확인했어요. 강의자료를 넣어 볼까요?'}
            </p>
            <button
              className="primary"
              disabled={!title.trim() || !parsed?.segments.length || task.busy}
              onClick={() => setStep(1)}
            >
              강의자료 넣기 →
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <Guide
            what="강의 자료와 내 필기를 함께 넣어 주세요."
            why="말로 설명한 내용과 자료 속 내용을 연결해 정리해요."
            tip="PDF를 권장해요. 필기가 있는 사진도 여러 장 넣을 수 있어요."
          />
          <label>
            자료 선택
            <input
              type="file"
              accept="application/pdf,image/*"
              multiple
              onChange={(e) => setMaterials(Array.from(e.target.files ?? []))}
            />
          </label>
          <ul className="file-summary">
            {materials.map((f, i) => (
              <li key={i}>
                {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB
              </li>
            ))}
          </ul>
          <p className="muted">
            {materials.length
              ? `${materials.length}개 파일 · 총 ${(size / 1024 / 1024).toFixed(1)} MB`
              : '선택한 자료가 없어요. 자료 없이 대본만으로도 정리할 수 있어요.'}
          </p>
          {size > 18 * 1024 * 1024 && (
            <p className="notice">
              18 MB를 넘었어요. 전송할 때 용량이 늘어날 수 있으니 PDF를 압축하거나 필요한 페이지만
              넣어 주세요.
            </p>
          )}
          <div className="actions wizard-actions">
            <button onClick={() => setStep(0)}>← 대본</button>
            <button className="primary" onClick={() => setStep(2)}>
              정리 준비 →
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <Guide
            what="예상 사용량을 확인하고 정리를 시작하세요."
            why="대본과 자료로 노트, 빈칸 복습 뼈대를 차례로 만들어요."
            tip="노트가 완성되면 먼저 저장해요. 뼈대 만들기에 실패해도 노트는 남아요."
          />
          <section className="card">
            <h2>{title}</h2>
            <p>
              {preset
                ? `강의 정리와 백지복습 읽기까지 약 ${preset.creditsPerLecture} 크레딧`
                : '현재 예상 사용량을 불러올 수 없어요.'}
            </p>
            <p className="muted">
              2026-10-29 ChatKHU 사용량·단가 기반 추정. 자료 분량과 모델 설정에 따라 달라져요.
            </p>
            <p className="muted">
              대본 {parsed?.segments.length ?? 0}개 문단 · 강의자료 {materials.length}개
            </p>
            {phase && <p role="status">{phase}</p>}
            {task.busy && task.status}
            {!complete && (
              <div className="actions wizard-actions">
                <button disabled={task.busy || !!draft} onClick={() => setStep(1)}>
                  ← 자료
                </button>
                <button
                  className="primary"
                  disabled={task.busy || !hasKey()}
                  onClick={() => void task.run(run)}
                >
                  {task.busy
                    ? '만들고 있어요…'
                    : draft
                      ? '뼈대 만들기 다시 시도'
                      : '노트와 뼈대 만들기'}
                </button>
              </div>
            )}
            {!hasKey() && <a href="#/setup">먼저 ChatKHU 키를 연결해 주세요.</a>}
            {draft && !task.busy && (
              <a className="button" href={`#/lecture/${draft.id}/note`}>
                {complete ? '완성된 강의 열기' : '저장된 노트 열기'}
              </a>
            )}
          </section>
        </>
      )}
      {!(step === 2 && task.busy) && task.status}
    </>
  );
}
