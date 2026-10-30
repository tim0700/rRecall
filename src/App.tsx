import { Component, useEffect, useState, type ReactNode } from 'react';
import * as api from './core/api';
import { Home, CoursePage, NewLecture } from './ui/Courses';
import { Setup, SettingsPage } from './ui/Settings';
import { LecturePage } from './ui/Lecture';
import { Tutor } from './ui/Tutor';
import Tutorial from './tutorial/Tutorial';
import { hasKey, useTask } from './ui/shared';
import './App.css';

class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="card" role="alert">
        <h1>화면을 열지 못했어요</h1>
        <p>기록은 브라우저에 그대로 있어요. 홈으로 돌아가 다시 열어 주세요.</p>
        <a href="#/">홈으로 돌아가기</a>
      </section>
    ) : (
      this.props.children
    );
  }
}
function Route({ path, changed }: { path: string; changed: () => void }) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length) return <Home />;
  if (parts[0] === 'setup') return <Setup onKeyChange={changed} />;
  if (parts[0] === 'settings') return <SettingsPage onKeyChange={changed} />;
  if (parts[0] === 'tutorial') return <Tutorial />;
  if (parts[0] === 'course' && parts[1])
    return parts[2] === 'new' ? <NewLecture courseId={parts[1]} /> : <CoursePage id={parts[1]} />;
  if (parts[0] === 'lecture' && parts[1])
    return (
      <LecturePage
        id={parts[1]}
        requestedLevel={
          parts[3] === '1' ? 1 : parts[3] === '2' ? 2 : parts[3] === '3' ? 3 : undefined
        }
        tab={
          ['note', 'skeleton', 'chat', 'recall', 'weak-points'].includes(parts[2])
            ? parts[2]
            : 'note'
        }
      />
    );
  if (parts[0] === 'tutor' && parts[1]) return <Tutor id={parts[1]} />;
  return (
    <>
      <h1>찾을 수 없는 화면이에요</h1>
      <a href="#/">홈으로 돌아가기</a>
    </>
  );
}
export default function App() {
  const [path, setPath] = useState(window.location.hash.slice(1) || '/');
  const [keyVersion, setKeyVersion] = useState(0);
  const [credits, setCredits] = useState<api.CreditInfo>();
  const task = useTask();
  const tutorial = path.startsWith('/tutorial');
  useEffect(() => {
    const update = () => {
      setPath(window.location.hash.slice(1) || '/');
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  // Tutorial never sends even a credit request.
  const connected = hasKey();
  useEffect(() => {
    if (!tutorial && connected)
      void task.run(async () => {
        setCredits(await api.getCredits());
      });
  }, [tutorial, connected, keyVersion]);
  function changed() {
    setKeyVersion((v) => v + 1);
    setCredits(undefined);
  }
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        본문으로 이동
      </a>
      <header className="app-header">
        <a className="brand" href="#/">
          rRecall<span>기록에서 기억까지</span>
        </a>
        <div className="header-actions">
          {tutorial ? (
            <span className="badge">키 없이 체험 중</span>
          ) : (
            <>
              <span className="credit">
                {connected
                  ? credits
                    ? `${credits.totalRemaining.toLocaleString()} 크레딧`
                    : '잔액 확인'
                  : '키 연결 전'}
              </span>
              {connected && (
                <button
                  className="small"
                  disabled={task.busy}
                  aria-label="남은 크레딧 새로고침"
                  onClick={() =>
                    void task.run(async () => {
                      setCredits(await api.getCredits());
                    })
                  }
                >
                  ↻
                </button>
              )}
            </>
          )}
          <a href="#/settings">설정</a>
        </div>
      </header>
      {!tutorial && <div className="header-status">{task.status}</div>}
      <main id="main" tabIndex={-1}>
        <ScreenBoundary key={path}>
          <Route path={path} changed={changed} />
        </ScreenBoundary>
      </main>
      <footer>
        rRecall · 기억은 직접, 정리는 함께
        <br />
        <small>학습 기록은 이 브라우저에 저장돼요. 중요한 기록은 설정에서 백업하세요.</small>
      </footer>
    </>
  );
}
