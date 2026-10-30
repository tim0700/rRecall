import { useEffect, useRef, useState } from 'react';
import * as api from '../core/api';
import type { CallUsage, Note, Reading, Skeleton, SkeletonLevel } from '../core/types';
import * as store from '../store';

export function errorText(e: unknown) {
  try {
    return api.explainError(e);
  } catch {
    return '처리를 마치지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}
export function Guide({ what, why, tip }: { what: string; why: string; tip: string }) {
  return (
    <aside className="guide">
      <strong>{what}</strong>
      <p>{why}</p>
      <small>도움말 · {tip}</small>
    </aside>
  );
}
export function Markdown({ text }: { text: string }) {
  try {
    return (
      <div className="markdown" dangerouslySetInnerHTML={{ __html: api.renderMarkdown(text) }} />
    );
  } catch {
    return <div className="markdown plain">{text}</div>;
  }
}
// Keep unmatched legacy sections visible without inventing a chunk assignment.
function groups<T extends { chunk?: string }>(items: T[], note?: Note, includeEmptyChunks = false) {
  const names = [
    ...new Set([
      ...(note?.bigPicture.chunks.map((c) => c.title) ?? []),
      ...items.map((item) => item.chunk).filter((name): name is string => !!name),
    ]),
  ];
  return [
    ...names.map((title) => ({ title, items: items.filter((item) => item.chunk === title) })),
    { title: '', items: items.filter((item) => !item.chunk) },
  ].filter(
    (group) =>
      group.items.length ||
      (includeEmptyChunks &&
        group.title &&
        note?.bigPicture.chunks.some((chunk) => chunk.title === group.title)),
  );
}
export function NoteView({ note }: { note: Note }) {
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const points = note.sections.flatMap((section) => section.points);
  const handwriting = note.sections.flatMap((section) => section.myHandwriting ?? []);
  function evidenceText(evidence: string[]) {
    return evidence.length ? evidence : ['연결된 대본 인용문이 없어요.'];
  }
  return (
    <article className="note-document">
      <section className="big-picture">
        <p className="eyebrow">강의의 큰 그림</p>
        <Markdown text={`## ${note.bigPicture.question}`} />
        {note.bigPicture.chunks.map((chunk, i) => (
          <div key={i}>
            <Markdown text={`### ${chunk.title}\n${chunk.gist}`} />
            {i < note.bigPicture.chunks.length - 1 && chunk.toNext?.trim() && (
              <div className="chunk-connector">
                <Markdown text={chunk.toNext} />
              </div>
            )}
          </div>
        ))}
      </section>
      {groups(note.sections, note).map((group, g) => (
        <section key={g}>
          {group.title && <h2 className="chunk-title">{group.title}</h2>}
          {group.items.map((section, i) => (
            <section className="note-section" key={i}>
              <h3>{section.title}</h3>
              {section.points.map((point, j) => {
                const number = points.indexOf(point) + 1;
                return (
                  <div className="note-point" key={j}>
                    <Markdown text={point.text} />
                    <span className="note-evidence-marker">
                      <sup>
                        <a
                          id={`point-${number}`}
                          href={`#evidence-${number}`}
                          className="note-evidence-link"
                          aria-expanded={openEvidence === number}
                          aria-controls={`point-evidence-${number}`}
                          onClick={(event) => {
                            event.preventDefault();
                            setOpenEvidence((current) => (current === number ? null : number));
                          }}
                          aria-label={`근거 ${number} ${
                            openEvidence === number ? '숨기기' : '보기'
                          }`}
                        >
                          {number}
                        </a>
                      </sup>
                      <span className="evidence-popover" role="tooltip">
                        {evidenceText(point.evidence).map((quote, quoteIndex) => (
                          <span className="evidence-quote" key={quoteIndex}>
                            {quote}
                          </span>
                        ))}
                      </span>
                    </span>
                    {point.fromHandwriting && (
                      <span role="img" aria-label="내 필기에서 온 내용" title="내 필기에서 온 내용">
                        ✎
                      </span>
                    )}
                    {point.verified === false && <span className="badge">근거 확인 안 됨</span>}
                    {openEvidence === number && (
                      <div className="evidence-inline" id={`point-evidence-${number}`}>
                        {evidenceText(point.evidence).map((quote, quoteIndex) => (
                          <blockquote key={quoteIndex}>{quote}</blockquote>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </section>
      ))}
      <section className="note-references">
        <h2>근거와 원문</h2>
        <ol>
          {points.map((point, i) => (
            <li key={i} id={`evidence-${i + 1}`} tabIndex={-1}>
              {point.evidence.length ? (
                point.evidence.map((quote, j) => <blockquote key={j}>{quote}</blockquote>)
              ) : (
                <p className="muted">연결된 대본 인용문이 없어요.</p>
              )}
            </li>
          ))}
        </ol>
        {handwriting.length > 0 && <h3>내 필기 원문</h3>}
        {handwriting.map((h, i) => (
          <div key={i}>
            <strong>{h.where}</strong>
            <p>{h.text}</p>
            <p className="muted">{h.meaning}</p>
          </div>
        ))}
      </section>
    </article>
  );
}
export function recommendedLevel(date?: string): SkeletonLevel {
  return date && Date.now() - new Date(date).getTime() > 2 * 86400000 ? 2 : 1;
}
export function useSkeletonLevel(id: string, date: string, requestedLevel?: SkeletonLevel) {
  const [level, setLevel] = useState<SkeletonLevel>(() => {
    if (requestedLevel) return requestedLevel;
    try {
      const saved = Number(sessionStorage.getItem(`rrecall.level.${id}`));
      if (saved === 1 || saved === 2 || saved === 3) return saved;
    } catch {
      /* Storage may be disabled. */
    }
    return recommendedLevel(date);
  });
  useEffect(() => {
    if (requestedLevel) setLevel(requestedLevel);
  }, [id, requestedLevel]);
  return [
    level,
    (next: SkeletonLevel) => {
      setLevel(next);
      try {
        sessionStorage.setItem(`rrecall.level.${id}`, String(next));
      } catch {
        /* Keep the in-memory choice. */
      }
    },
  ] as const;
}
export function LevelSwitcher({
  level,
  onChange,
  date,
}: {
  level: SkeletonLevel;
  onChange: (level: SkeletonLevel) => void;
  date?: string;
}) {
  const choices = [
    [1, '단어·빈칸', '빈칸을 채우고, 각 용어 옆에 뜻을 내 말로 한 줄씩 써 보세요.'],
    [2, '핵심 개념', '핵심 용어의 뜻을 내 말로 써 보세요.'],
    [3, '목차만', '목차만 보고 강의 전체를 떠올려 보세요.'],
  ] as const;
  return (
    <fieldset className="level-switcher">
      <legend>복습 단계</legend>
      {choices.map(([value, label, hint]) => (
        <label className="level-choice" key={value}>
          <span>
            <input
              type="radio"
              name="skeleton-level"
              checked={level === value}
              onChange={() => onChange(value)}
            />{' '}
            {value} {label}{' '}
            {value === recommendedLevel(date) && <span className="badge">추천</span>}
          </span>
          <small>{hint}</small>
        </label>
      ))}
    </fieldset>
  );
}
export function SkeletonView({
  skeleton,
  note,
  level = 1,
}: {
  skeleton: Skeleton;
  note?: Note;
  level?: SkeletonLevel;
}) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [visibleHintBanks, setVisibleHintBanks] = useState<Set<number>>(new Set());
  useEffect(() => {
    setRevealed(new Set());
    setVisibleHintBanks(new Set());
  }, [level, skeleton, note]);
  const bundles: Skeleton['bundles'] =
    level === 3 && note
      ? note.sections.map((section) => ({
          title: section.title,
          chunk: section.chunk,
          wordBank: [],
          blanks: [],
        }))
      : skeleton.bundles;
  const transitions =
    note?.bigPicture.chunks.slice(0, -1).filter((chunk) => chunk.toNext?.trim()) ?? [];
  const keys =
    level === 3
      ? [
          ...bundles.flatMap((bundle, i) =>
            note?.sections.some((section) => section.title === bundle.title)
              ? [`section:${i}`]
              : [],
          ),
          ...transitions.map((chunk) => `chain:${chunk.title}`),
        ]
      : bundles.flatMap((b, i) => (level === 1 ? b.blanks : b.wordBank).map((_, j) => `${i}:${j}`));
  function answer(key: string, text: string) {
    return (
      <div className="answer-control">
        <button
          type="button"
          className="small"
          aria-expanded={revealed.has(key)}
          onClick={() =>
            setRevealed((old) => {
              const next = new Set(old);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            })
          }
        >
          {revealed.has(key) ? '정답 숨기기' : '정답 보기'}
        </button>
        {revealed.has(key) && (
          <div className="skeleton-answer">
            <Markdown text={text} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="skeleton-document">
      <p className="muted">
        복습 단계 {level} · {level === 1 ? '단어·빈칸' : level === 2 ? '핵심 개념' : '목차만'}
        <span className="print-only">
          {' · '}
          {level === 1
            ? '빈칸을 채우고, 각 용어 옆에 뜻을 내 말로 한 줄씩 써 보세요.'
            : level === 2
              ? '핵심 용어의 뜻을 내 말로 써 보세요.'
              : '목차만 보고 강의 전체를 떠올려 보세요.'}
        </span>
      </p>
      {keys.length > 0 && (
        <button
          className="answer-control"
          onClick={() => setRevealed(revealed.size === keys.length ? new Set() : new Set(keys))}
        >
          {revealed.size === keys.length && keys.length ? '정답 모두 숨기기' : '정답 모두 보기'}
        </button>
      )}
      {groups(bundles, note, level === 3).map((group, g) => (
        <section key={g}>
          {group.title && <h2 className="chunk-title">{group.title}</h2>}
          {group.items.map((b) => {
            const i = bundles.indexOf(b);
            const fallback =
              note?.sections
                .find((section) => section.title === b.title)
                ?.points.map((point) => point.text)
                .join('\n\n') || '대응하는 노트 설명이 없어요. 노트를 직접 확인해 주세요.';
            return (
              <section className="card" key={i}>
                <h3>{b.title}</h3>
                {level === 3 && keys.includes(`section:${i}`) && answer(`section:${i}`, fallback)}
                {level === 1 && b.wordBank.length > 0 && (
                  <button
                    type="button"
                    className="small skeleton-hint-toggle"
                    aria-expanded={visibleHintBanks.has(i)}
                    aria-controls={`skeleton-hint-bank-${i}`}
                    onClick={() =>
                      setVisibleHintBanks((current) => {
                        const next = new Set(current);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  >
                    {visibleHintBanks.has(i) ? '힌트: 단어 모음 숨기기' : '힌트: 단어 모음 보기'}
                  </button>
                )}
                {level === 1 && visibleHintBanks.has(i) && (
                  <ul
                    className="word-bank skeleton-hint-bank"
                    id={`skeleton-hint-bank-${i}`}
                    aria-label="힌트 단어 모음"
                  >
                    {api.skeletonHintBank(skeleton, i).map((word, j) => (
                      <li key={`${word}-${j}`}>{word}</li>
                    ))}
                  </ul>
                )}
                {level === 2 && (
                  <ul className="word-bank" aria-label="단어 모음">
                    {b.wordBank.map((word, j) => (
                      <li key={j}>{word}</li>
                    ))}
                  </ul>
                )}
                {level === 1 && (
                  <ol
                    start={
                      1 +
                      skeleton.bundles
                        .slice(0, i)
                        .reduce((total, bundle) => total + bundle.blanks.length, 0)
                    }
                  >
                    {b.blanks.map((blank, j) => (
                      <li className="blank" key={j}>
                        {blank.sentence}
                        {answer(`${i}:${j}`, blank.answer)}
                      </li>
                    ))}
                  </ol>
                )}
                {level === 2 &&
                  b.wordBank.map((term, j) => (
                    <div className="definition" key={j}>
                      <strong>{term}</strong>
                      <textarea
                        aria-label={`${term}의 뜻 쓰기`}
                        placeholder="내 말로 뜻을 써 보세요"
                        rows={3}
                      />
                      {answer(
                        `${i}:${j}`,
                        b.definitions?.find((d) => d.term === term)?.definition ?? fallback,
                      )}
                    </div>
                  ))}
              </section>
            );
          })}
          {level === 3 && transitions.some((chunk) => chunk.title === group.title) && (
            <div className="chunk-connector">
              <span className="muted">다음 묶음으로 넘어가는 이유</span>
              {answer(
                `chain:${group.title}`,
                transitions.find((chunk) => chunk.title === group.title)!.toNext!,
              )}
            </div>
          )}
        </section>
      ))}
      {level === 1 && skeleton.examples.length > 0 && (
        <section className="card">
          <h3>떠올려 볼 예시</h3>
          {skeleton.examples.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </section>
      )}
      {level !== 3 && skeleton.weakFromCourse.length > 0 && (
        <p>이번 강의와 이어지는 지난 약점 · {skeleton.weakFromCourse.join(', ')}</p>
      )}
      {level !== 3 && skeleton.leakWarnings.length > 0 && (
        <details className="muted">
          <summary>뼈대 확인 안내</summary>
          {skeleton.leakWarnings.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </details>
      )}
    </div>
  );
}
export function ReadingView({
  reading,
  onChange,
}: {
  reading: Reading;
  onChange?: (reading: Reading) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      {reading.meaningLinesMissing && (
        <p className="notice">이번엔 용어만 썼어요. 다음엔 뜻도 한 줄 써 보세요.</p>
      )}
      <div className="columns">
        {(['recalled', 'corrected'] as const).map((kind) => (
          <section className="card" key={kind}>
            <h3>
              {kind === 'recalled' ? '기억한 것' : '첨삭한 것'}{' '}
              <small className="muted">{reading[kind].length}개</small>
            </h3>
            {reading[kind].length ? (
              <ul className="reading-items">
                {reading[kind].map((item, i) => {
                  const key = `${kind}-${i}`;
                  const update = (patch: Partial<typeof item>) =>
                    onChange?.({
                      ...reading,
                      [kind]: reading[kind].map((value, j) =>
                        j === i ? { ...value, ...patch } : value,
                      ),
                    });
                  return (
                    <li key={i}>
                      {onChange && editing === key ? (
                        <>
                          <label>
                            내용
                            <textarea
                              value={item.text}
                              onChange={(e) => update({ text: e.target.value })}
                            />
                          </label>
                          <label>
                            개념
                            <input
                              value={item.concept ?? ''}
                              onChange={(e) => update({ concept: e.target.value })}
                            />
                          </label>
                          <button type="button" onClick={() => setEditing(null)}>
                            수정 완료
                          </button>
                        </>
                      ) : (
                        <div className="reading-row">
                          <p>
                            {item.text}
                            {item.uncertain && <span className="badge">읽기 불확실</span>}
                          </p>
                          {onChange && (
                            <span className="row-actions">
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setEditing(key)}
                              >
                                수정
                              </button>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => {
                                  setEditing(null);
                                  onChange({
                                    ...reading,
                                    [kind]: reading[kind].filter((_, j) => j !== i),
                                  });
                                }}
                              >
                                삭제
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted">찾은 내용이 없어요.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [seconds, setSeconds] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [busy]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setSeconds(0);
    const ctrl = new AbortController();
    controller.current = ctrl;
    try {
      await action(ctrl.signal);
    } catch (e) {
      setError(
        ctrl.signal.aborted
          ? '작업을 중단했어요. 이미 처리된 요청에는 크레딧이 사용될 수 있어요.'
          : errorText(e),
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function usage(rows: CallUsage[]) {
    const estimates = rows
      .map((u) => u.estimatedCredits)
      .filter((n): n is number => n !== undefined);
    setMessage(
      estimates.length
        ? `이번 작업 약 ${estimates.reduce((a, b) => a + b, 0).toFixed(1)} 크레딧${estimates.length < rows.length ? ' (일부 추정)' : ''}`
        : '이번 작업의 사용량 추정치를 받지 못했어요.',
    );
    await store.save({ usage: rows });
  }
  const status = (
    <>
      {busy && (
        <div className="notice task-progress" aria-busy="true">
          <div>
            <strong role="status">처리하고 있어요</strong>
            <small>경과 시간 {seconds}초 · 잠시만 기다려 주세요.</small>
          </div>
          <button type="button" onClick={() => controller.current?.abort()}>
            중단
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
  return { busy, error, run, usage, status, setMessage };
}
export function presetList() {
  try {
    return api.listPresets();
  } catch {
    return [];
  }
}
export function hasKey() {
  try {
    return Boolean(api.getKey());
  } catch {
    return false;
  }
}
export function dueList(points: Parameters<typeof api.dueWeakPoints>[0]) {
  try {
    return api.dueWeakPoints(points, new Date());
  } catch {
    return [];
  }
}
export function go(path: string) {
  window.location.hash = path;
}
