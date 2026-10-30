import { useEffect, useState } from 'react';
import * as api from '../core/api';
import type { GapKind, Lecture, Recall, SkeletonLevel, WeakPoint } from '../core/types';
import * as store from '../store';
import {
  Guide,
  NoteView,
  ReadingView,
  SkeletonView,
  LevelSwitcher,
  useSkeletonLevel,
  useTask,
  readDraft,
  writeDraft,
} from './shared';
import { Chat } from './Chat';
import { WeakList } from './Courses';
import { Calibration } from './Calibration';

const GAP_LABELS: Record<GapKind, string> = {
  term: '용어를 못 떠올림',
  concept: '뜻을 잘 모름',
  section: '묶음이 통째로 빠짐',
  'self-flagged': '스스로 모른다고 표시',
  corrected: '틀렸다가 고침',
};

export function Confirmation({
  lecture,
  recall,
  onSave,
}: {
  lecture: Lecture;
  recall: Recall;
  onSave: (lecture: Lecture) => void;
}) {
  const [reading, setReading] = useState(recall.reading!);
  const [gaps, setGaps] = useState(reading.gaps);
  const [selected, setSelected] = useState<string[]>(
    recall.confirmedGapIds ?? api.preselectedGapIds(reading.gaps),
  );
  const [editingGap, setEditingGap] = useState<string | null>(null);
  const task = useTask();
  const confirmed = Boolean(recall.confirmedAt);
  return (
    <>
      <Guide
        what="읽은 결과를 확인하고 실제 약점만 골라 주세요."
        why="사진을 잘못 읽은 부분이 약점으로 저장되지 않도록 직접 확인해요."
        tip="스스로 모른다고 표시한 곳은 미리 선택했어요. 질문하기에서 나온 후보는 직접 골라 주세요."
      />
      <ReadingView reading={reading} onChange={confirmed ? undefined : setReading} />
      <h2>확인할 약점</h2>
      {gaps.length === 0 && <p>이번 범위에서 찾은 약점이 없어요.</p>}
      {(['paper', 'asked'] as const).map((source) => (
        <section key={source}>
          {gaps.some((g) => (g.source ?? 'paper') === source) && (
            <h3>{source === 'asked' ? '질문하기에서 물어본 개념' : '백지복습에서 확인한 약점'}</h3>
          )}
          {gaps
            .filter((g) => (g.source ?? 'paper') === source)
            .map((g) => (
              <div className="card gap-card" key={g.id}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(g.id)}
                    disabled={confirmed}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, g.id]
                          : selected.filter((id) => id !== g.id),
                      )
                    }
                  />
                  <span>
                    <strong>{g.concept || '개념 이름을 적어 주세요'}</strong>{' '}
                    <small className="badge">
                      {source === 'asked' ? '질문하기' : '백지'} · {GAP_LABELS[api.gapKind(g.kind)]}
                    </small>
                  </span>
                </label>
                {g.uncertain && (
                  <p className="muted">
                    정확히 읽었는지 확실하지 않아요. 사진과 노트를 보고 직접 골라 주세요.
                  </p>
                )}
                <p>{g.why}</p>
                {g.noteSection && <small>노트 위치 · {g.noteSection}</small>}
                {!confirmed &&
                  (editingGap === g.id || !g.concept.trim() ? (
                    <div className="gap-edit">
                      <label>
                        약점 종류
                        <select
                          value={api.gapKind(g.kind)}
                          onChange={(e) =>
                            setGaps(
                              gaps.map((x) =>
                                x.id === g.id ? { ...x, kind: e.target.value as GapKind } : x,
                              ),
                            )
                          }
                        >
                          {Object.entries(GAP_LABELS).map(([kind, label]) => (
                            <option key={kind} value={kind}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        개념 이름
                        <input
                          value={g.concept}
                          onChange={(e) =>
                            setGaps(
                              gaps.map((x) =>
                                x.id === g.id ? { ...x, concept: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <button type="button" onClick={() => setEditingGap(null)}>
                        수정 완료
                      </button>
                    </div>
                  ) : (
                    <span className="row-actions">
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setEditingGap(g.id)}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          setGaps(gaps.filter((item) => item.id !== g.id));
                          setSelected(selected.filter((id) => id !== g.id));
                        }}
                      >
                        삭제
                      </button>
                    </span>
                  ))}
              </div>
            ))}
        </section>
      ))}
      {confirmed ? (
        <p className="notice">확인한 약점을 저장했어요. 강의의 약점 화면에서 복습할 수 있어요.</p>
      ) : (
        <button
          className="primary"
          disabled={task.busy || gaps.some((g) => selected.includes(g.id) && !g.concept.trim())}
          onClick={() =>
            void task.run(async () => {
              const course = await store.get('courses', lecture.courseId);
              if (!course) throw new Error('Missing course');
              const edited = {
                ...reading,
                gaps: gaps.map((g) => ({ ...g, concept: g.concept.trim() })),
              };
              const points = api.weakPointsFromConfirmedGaps(
                course,
                lecture,
                edited,
                selected,
                new Date(),
              );
              const updated: Lecture = {
                ...lecture,
                recalls: lecture.recalls.map((r) =>
                  r.id === recall.id
                    ? { ...r, reading: edited, confirmedGapIds: selected, confirmedAt: store.now() }
                    : r,
                ),
              };
              await store.save({ lectures: [updated], weakPoints: points });
              onSave(updated);
            })
          }
        >
          약점으로 저장{selected.length ? ` (${selected.length}개)` : ' (선택 없음)'}
        </button>
      )}
      {task.status}
      <a className="button" href={`#/course/${lecture.courseId}`}>
        과목의 약점 보기
      </a>
    </>
  );
}
export function RecallPanel({
  lecture,
  onSave,
  requestedLevel,
}: {
  lecture: Lecture;
  onSave: (lecture: Lecture) => void;
  requestedLevel?: SkeletonLevel;
}) {
  const [level, setLevel] = useSkeletonLevel(lecture.id, lecture.date, requestedLevel);
  const [photos, setPhotos] = useState<File[]>([]);
  const [typed, setTypedState] = useState(() => readDraft(`${lecture.id}.recall`, ''));
  const [mode, setModeState] = useState<'photo' | 'text'>(() =>
    readDraft(`${lecture.id}.recall`, '') ? 'text' : 'photo',
  );
  const setTyped = (value: string) => {
    setTypedState(value);
    writeDraft(`${lecture.id}.recall`, value || undefined);
  };
  const setMode = setModeState;
  const definitionDrafts = Object.entries(
    readDraft<Record<string, string>>(`${lecture.id}.l2`, {}),
  ).filter(([, text]) => text.trim());
  const task = useTask();
  const latest = lecture.recalls.at(-1);
  const [newRecall, setNewRecall] = useState(
    Boolean(requestedLevel) || !latest?.reading || Boolean(typed),
  );
  if (!newRecall && latest?.reading)
    return (
      <>
        <p className="muted">복습 단계 {latest.level ?? 1}</p>
        <Confirmation key={latest.id} lecture={lecture} recall={latest} onSave={onSave} />
        <Chat lecture={lecture} purpose="after-reading" />
        <button
          onClick={() => {
            setNewRecall(true);
            window.scrollTo(0, 0);
          }}
        >
          백지복습 새로 하기
        </button>
      </>
    );
  return (
    <>
      <Guide
        what="기억나는 내용은 검정 펜으로 적고, 빨간 펜으로 첨삭한 뒤 촬영하세요."
        why="처음 기억한 내용과 노트를 보고 보완한 내용을 나눠 약점을 찾아요."
        tip="밝은 곳에서 종이를 평평하게 놓고 위에서 반듯하게 찍어 주세요."
      />
      <LevelSwitcher level={level} onChange={setLevel} date={lecture.date} />
      <ol>
        <li>노트를 덮고 뼈대만 보면서 종이에 검정 펜으로 기억나는 내용을 적으세요.</li>
        <li>노트를 펼쳐 빠진 내용을 빨간 펜으로 첨삭하세요.</li>
        <li>글씨가 선명하게 보이도록 촬영하세요.</li>
      </ol>
      <div className="actions">
        <button aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>
          종이 사진
        </button>
        <button aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
          글로 입력
        </button>
      </div>
      {mode === 'photo' ? (
        <>
          {/* capture forces the camera on phones and ignores multiple, so gallery and camera are separate. */}
          <label>
            백지복습 사진 고르기
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setPhotos((current) => [...current, ...picked]);
                e.target.value = '';
              }}
            />
          </label>
          <label>
            사진 촬영
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                setPhotos((current) => [...current, ...picked]);
                e.target.value = '';
              }}
            />
          </label>
          <ul className="file-summary">
            {photos.map((f, i) => (
              <li key={i}>
                {f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB{' '}
                <button
                  className="small"
                  onClick={() => setPhotos((current) => current.filter((_, j) => j !== i))}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
          {photos.reduce((s, f) => s + f.size, 0) > 18 * 1024 * 1024 && (
            <p className="notice">
              사진 합계가 18 MB를 넘었어요. 용량을 줄이면 전송 실패를 막을 수 있어요.
            </p>
          )}
        </>
      ) : (
        <label>
          기억한 내용과 첨삭한 내용
          <textarea
            rows={8}
            placeholder={
              '[스스로 떠올림]\n기억나는 내용을 적으세요.\n\n[노트 보고 고침]\n보완한 내용을 적으세요.'
            }
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      )}
      {level === 2 && definitionDrafts.length > 0 && (
        <button
          onClick={() => {
            const lines = definitionDrafts.map(([term, text]) => `${term} — ${text.trim()}`);
            setTyped(
              (typed.trim() ? [typed.trim(), ...lines] : ['[스스로 떠올림]', ...lines]).join('\n'),
            );
            setMode('text');
            // Imported once; the button disappears so the lines are not appended twice.
            writeDraft(`${lecture.id}.l2`, undefined);
          }}
        >
          뼈대에 쓴 뜻 {definitionDrafts.length}개 가져오기
        </button>
      )}
      <p className="muted">
        {mode === 'photo'
          ? photos.length
            ? `사진 ${photos.length}장을 읽을 준비가 됐어요.`
            : '사진을 선택하면 읽기를 시작할 수 있어요.'
          : typed.trim()
            ? '입력한 내용을 읽을 준비가 됐어요.'
            : '기억한 내용과 첨삭한 내용을 입력해 주세요.'}
      </p>
      <button
        className="primary"
        disabled={
          task.busy ||
          !lecture.note ||
          !lecture.skeleton ||
          (mode === 'photo' ? !photos.length : !typed.trim())
        }
        onClick={() =>
          void task.run(async (signal) => {
            const files = mode === 'photo' ? photos.map(store.storedFile) : [];
            const askedTopics = (await store.all('chats'))
              .filter((thread) => thread.lectureId === lecture.id)
              .map((thread) =>
                [thread.title, thread.messages.find((message) => message.role === 'user')?.text]
                  .filter(Boolean)
                  .join(' — '),
              )
              .filter(Boolean);
            const result = await api.readRecall({
              askedTopics,
              photos: files,
              level,
              typedText: mode === 'text' ? typed.trim() : undefined,
              note: lecture.note!,
              skeleton: lecture.skeleton!,
              settings: store.readSettings(),
              signal,
            });
            await task.usage(result.usage);
            const recall: Recall = {
              id: store.newId(),
              date: store.now(),
              level,
              photoFileIds: files.map((f) => f.id),
              typedText: mode === 'text' ? typed.trim() : undefined,
              reading: result.value,
            };
            const next = { ...lecture, recalls: [...lecture.recalls, recall] };
            await store.save({ lectures: [next], files });
            onSave(next);
            setNewRecall(false);
            setPhotos([]);
            setTyped('');
            writeDraft(`${lecture.id}.l2`, undefined);
          })
        }
      >
        백지복습 읽기
      </button>
      {(!lecture.note || !lecture.skeleton) && (
        <p className="notice">먼저 노트와 뼈대를 완성해 주세요.</p>
      )}
      {task.status}
    </>
  );
}
export function LecturePage({
  id,
  tab,
  requestedLevel,
}: {
  id: string;
  tab: string;
  requestedLevel?: SkeletonLevel;
}) {
  const [lecture, setLecture] = useState<Lecture>();
  const [courseName, setCourseName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const task = useTask();
  useEffect(() => {
    void task.run(async () => {
      const found = await store.get('lectures', id);
      setLecture(found);
      if (found) setCourseName((await store.get('courses', found.courseId))?.name ?? '');
      setLoaded(true);
    });
  }, [id]);
  const printBase = lecture ? `${courseName ? `[${courseName}] ` : ''}${lecture.title}` : '';
  const tabLabels: Record<string, string> = {
    note: '노트',
    chat: '질문하기',
    recall: '백지복습',
    'weak-points': '약점',
  };
  usePrintTitle(lecture && tab !== 'skeleton' ? `${printBase} - ${tabLabels[tab] ?? '강의'}` : '');
  if (!lecture)
    return (
      <>
        <h1>{loaded ? '강의를 찾을 수 없어요' : '강의를 불러오는 중…'}</h1>
        {task.status}
        <a href="#/">내 과목으로</a>
      </>
    );
  return (
    <>
      <a href={`#/course/${lecture.courseId}`}>← 과목으로</a>
      <h1>{lecture.title}</h1>
      <nav className="tabs" aria-label="강의 화면">
        {[
          ['note', '노트'],
          ['skeleton', '뼈대'],
          ['chat', '질문하기'],
          ['recall', '백지복습'],
          ['weak-points', '약점'],
        ].map(([route, label]) => (
          <a
            key={route}
            className={tab === route ? 'active' : ''}
            aria-current={tab === route ? 'page' : undefined}
            href={`#/lecture/${id}/${route}`}
          >
            {label}
          </a>
        ))}
      </nav>
      {tab === 'note' && (
        <>
          <Guide
            what="큰 질문부터 읽고 핵심 개념을 살펴보세요."
            why="내용이 어떻게 연결되는지 알아야 내 말로 떠올릴 수 있어요."
            tip="근거 보기를 눌러 대본과 비교하세요. AI가 정리한 노트에는 틀린 내용이 있을 수 있어요."
          />
          {lecture.note ? (
            <NoteView note={lecture.note} />
          ) : (
            <div className="notice">
              <p>아직 노트가 없어요. 과목에서 대본과 자료를 넣어 정리를 시작해 주세요.</p>
              <a href={`#/course/${lecture.courseId}/new`}>새 강의 정리하기 →</a>
            </div>
          )}
        </>
      )}
      {tab === 'skeleton' && (
        <>
          <Guide
            what="뼈대를 보며 강의 내용을 떠올려 보세요."
            why="정답을 바로 읽지 않고 기억에서 꺼내는 연습이에요."
            tip="강의 날짜에 따라 복습 단계를 추천해요. 나에게 맞는 단계로 바꿔도 좋아요."
          />
          {lecture.skeleton ? (
            <>
              <LectureSkeleton
                lecture={lecture}
                requestedLevel={requestedLevel}
                printBase={printBase}
              />
            </>
          ) : (
            <>
              <p>아직 뼈대가 없어요.</p>
              <button
                disabled={task.busy || !lecture.note}
                onClick={() =>
                  void task.run(async (signal) => {
                    const points = (await store.all('weakPoints')).filter(
                      (w) =>
                        w.courseId === lecture.courseId &&
                        w.lectureId !== lecture.id &&
                        !w.resolvedAt,
                    );
                    const result = await api.makeSkeleton({
                      note: lecture.note!,
                      transcript: lecture.transcript,
                      openWeakPoints: [...new Set(points.map((w) => w.concept))],
                      settings: store.readSettings(),
                      signal,
                    });
                    await task.usage(result.usage);
                    const next = { ...lecture, skeleton: result.value };
                    await store.put('lectures', next);
                    setLecture(next);
                  })
                }
              >
                뼈대 만들기
              </button>
            </>
          )}
        </>
      )}
      {tab === 'weak-points' && <LectureWeakPoints lecture={lecture} />}
      {tab === 'chat' && <Chat lecture={lecture} purpose="before-recall" />}
      {tab === 'recall' && (
        <RecallPanel lecture={lecture} onSave={setLecture} requestedLevel={requestedLevel} />
      )}
      {tab === 'note' && <Calibration lecture={lecture} />}
      {task.status}
    </>
  );
}

/** While printing, use a descriptive document title: browsers take the PDF file name from it. */
function usePrintTitle(title: string) {
  useEffect(() => {
    if (!title) return;
    const fileName = title.replace(/[\\/:*?"<>|]+/g, '-');
    let saved = document.title;
    const before = () => {
      saved = document.title;
      document.title = fileName;
    };
    const after = () => {
      document.title = saved;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [title]);
}

function LectureSkeleton({
  lecture,
  requestedLevel,
  printBase,
}: {
  lecture: Lecture;
  requestedLevel?: SkeletonLevel;
  printBase: string;
}) {
  const [level, setLevel] = useSkeletonLevel(lecture.id, lecture.date, requestedLevel);
  usePrintTitle(`${printBase} - 복습 단계 ${level}`);
  return (
    <>
      <div className="actions">
        <button onClick={() => window.print()}>뼈대 인쇄하기</button>
        <a className="button primary" href={`#/lecture/${lecture.id}/recall/${level}`}>
          백지복습 시작하기
        </a>
      </div>
      <LevelSwitcher level={level} onChange={setLevel} date={lecture.date} />
      <SkeletonView
        skeleton={lecture.skeleton!}
        note={lecture.note}
        level={level}
        draftKey={lecture.id}
      />
    </>
  );
}
function LectureWeakPoints({ lecture }: { lecture: Lecture }) {
  const [points, setPoints] = useState<WeakPoint[]>([]);
  const task = useTask();
  useEffect(() => {
    void task.run(async () =>
      setPoints((await store.all('weakPoints')).filter((point) => point.lectureId === lecture.id)),
    );
  }, [lecture.id]);
  return (
    <section>
      <h2>남은 약점</h2>
      <WeakList points={points.filter((point) => !point.resolvedAt)} />
      <details>
        <summary>해결한 약점 ({points.filter((point) => point.resolvedAt).length})</summary>
        <WeakList points={points.filter((point) => point.resolvedAt)} />
      </details>
      {task.status}
    </section>
  );
}
