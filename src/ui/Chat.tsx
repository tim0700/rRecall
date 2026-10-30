import { useEffect, useState } from 'react';
import * as api from '../core/api';
import type { ChatThread, Lecture, StoredFile } from '../core/types';
import * as store from '../store';
import { Markdown, useTask } from './shared';

// Compatible with older bundles; keep the legacy id so imports remain idempotent.
function titleOf(thread: ChatThread) {
  return (
    thread.title ||
    firstQuestionTitle(thread.messages.find((m) => m.role === 'user')?.text || '사진 질문')
  );
}
function firstQuestionTitle(question: string) {
  return api.sessionTitle(question);
}
function firstQuestionOf(thread: ChatThread) {
  return thread.messages.find((message) => message.role === 'user')?.text || '사진 질문';
}
function Thumbnail({ file }: { file: StoredFile }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file.blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="chat-thumbnail" src={url} alt={file.name} />
    </a>
  ) : null;
}
export function Chat({ lecture, purpose }: { lecture: Lecture; purpose: ChatThread['purpose'] }) {
  function fresh(): ChatThread {
    return {
      id: store.newId(),
      courseId: lecture.courseId,
      lectureId: lecture.id,
      purpose,
      messages: [],
      createdAt: store.now(),
    };
  }
  const [sessions, setSessions] = useState<ChatThread[]>([]);
  const [thread, setThread] = useState<ChatThread>(fresh);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [attachments, setAttachments] = useState<StoredFile[]>([]);
  const [text, setText] = useState('');
  const [ready, setReady] = useState(false);
  const task = useTask();
  useEffect(() => {
    void task.run(async () => {
      const existing = (await store.all('chats')).filter(
        (t) => t.lectureId === lecture.id && t.purpose === purpose,
      );
      const migrated = existing.map((t) => ({
        ...t,
        title: titleOf(t),
        createdAt: t.createdAt ?? t.messages[0]?.at ?? lecture.date,
      }));
      if (existing.some((t) => !t.title || !t.createdAt)) await store.save({ chats: migrated });
      setSessions(migrated);
      const ids = new Set(migrated.flatMap((t) => t.messages.flatMap((m) => m.imageFileIds ?? [])));
      const attached = await Promise.all([...ids].map((id) => store.get('files', id)));
      setFiles(attached.filter((file): file is StoredFile => !!file));
      setReady(true);
    });
  }, [lecture.id, purpose]);
  function open(session: ChatThread) {
    setThread(session);
    setText('');
    setAttachments([]);
  }
  return (
    <section>
      <div className="actions">
        <h2>{thread.title ?? '새 질문'}</h2>
        {thread.messages.length > 0 && (
          <button disabled={!ready || task.busy} onClick={() => open(fresh())}>
            새 질문
          </button>
        )}
      </div>
      {sessions.length > 0 && (
        <details className="session-list">
          <summary>지난 질문 ({sessions.length})</summary>
          <ul className="link-list">
            {[...sessions]
              .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
              .map((session) => (
                <li key={session.id}>
                  <button
                    disabled={task.busy}
                    aria-pressed={thread.id === session.id}
                    onClick={() => open(session)}
                  >
                    <span className="session-topic">{titleOf(session)}</span>
                    <span className="session-question muted" title={firstQuestionOf(session)}>
                      {firstQuestionOf(session)}
                    </span>
                  </button>
                  <small>
                    {new Date(session.createdAt ?? lecture.date).toLocaleDateString('ko-KR')}
                  </small>
                </li>
              ))}
          </ul>
        </details>
      )}
      {ready && !thread.messages.length && (
        <p className="muted">
          궁금한 개념이나 막힌 부분을 적어 보세요. 사진도 함께 보낼 수 있어요.
        </p>
      )}
      <div className="chat-log" aria-live="polite">
        {thread.messages.map((message, i) => (
          <div className={`chat ${message.role}`} key={i}>
            <strong>{message.role === 'user' ? '나' : '복습 도우미'}</strong>
            <Markdown text={message.text} />
            <div className="chat-attachments">
              {(message.imageFileIds ?? []).map((id) => {
                const file = files.find((f) => f.id === id);
                return file ? (
                  <Thumbnail file={file} key={id} />
                ) : (
                  <small key={id}>사진을 찾을 수 없어요.</small>
                );
              })}
            </div>
            {message.role === 'assistant' && message.estimatedCredits !== undefined && (
              <small className="muted">
                약 {message.estimatedCredits.toFixed(2)} 크레딧 · 추정
              </small>
            )}
          </div>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!lecture.note || (!text.trim() && !attachments.length)) return;
          void task.run(async (signal) => {
            const question = text.trim() || '첨부한 사진을 설명해 주세요.';
            const settings = store.readSettings();
            const result = await api.tutorReply({
              thread,
              note: lecture.note!,
              userText: question,
              images: attachments,
              pastTopics: sessions.filter((t) => t.id !== thread.id).map(titleOf),
              settings,
              signal,
            });
            const topicResult =
              thread.messages.length === 0
                ? await api.sessionTopic(question, result.value, settings)
                : undefined;
            const estimates = result.usage.map((u) => u.estimatedCredits);
            const credits =
              estimates.length && estimates.every((n) => n !== undefined)
                ? estimates.reduce((sum, n) => sum + n!, 0)
                : undefined;
            const next: ChatThread = {
              ...thread,
              title: topicResult?.value || thread.title || firstQuestionTitle(question),
              messages: [
                ...thread.messages,
                {
                  role: 'user',
                  text: question,
                  at: store.now(),
                  imageFileIds: attachments.map((f) => f.id),
                },
                {
                  role: 'assistant',
                  text: result.value,
                  at: store.now(),
                  estimatedCredits: credits,
                },
              ],
            };
            await store.save({
              chats: [next],
              files: attachments,
              usage: [...result.usage, ...(topicResult?.usage ?? [])],
            });
            setSessions((old) => [...old.filter((t) => t.id !== next.id), next]);
            setFiles((old) => [...old, ...attachments]);
            setThread(next);
            setText('');
            setAttachments([]);
          });
        }}
      >
        <label>
          질문
          <textarea
            disabled={task.busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
        </label>
        <div className="chat-attachments">
          {attachments.map((file) => (
            <div key={file.id}>
              <Thumbnail file={file} />
              <button
                type="button"
                className="small"
                disabled={task.busy}
                aria-label={`${file.name} 첨부 취소`}
                onClick={() => setAttachments((old) => old.filter((f) => f.id !== file.id))}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
        <div className="actions">
          <label className="button attachment-button">
            사진 첨부
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={task.busy}
              onChange={(e) => {
                setAttachments((old) => [
                  ...old,
                  ...Array.from(e.target.files ?? [])
                    .filter((f) => f.type.startsWith('image/'))
                    .map(store.storedFile),
                ]);
                e.target.value = '';
              }}
            />
          </label>
          <label className="button attachment-button">
            사진 촬영
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={task.busy}
              onChange={(e) => {
                setAttachments((old) => [
                  ...old,
                  ...Array.from(e.target.files ?? [])
                    .filter((f) => f.type.startsWith('image/'))
                    .map(store.storedFile),
                ]);
                e.target.value = '';
              }}
            />
          </label>
          <button
            className="primary"
            disabled={!ready || task.busy || (!text.trim() && !attachments.length) || !lecture.note}
          >
            {task.busy && ready ? (
              <>
                <span className="button-spinner" aria-hidden="true" /> 답변 기다리는 중
              </>
            ) : (
              '질문 보내기'
            )}
          </button>
        </div>
      </form>
      {task.error && (
        <p className="error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
