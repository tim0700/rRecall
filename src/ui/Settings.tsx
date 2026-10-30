import { useState } from 'react';
import * as api from '../core/api';
import type { Role, Settings } from '../core/types';
import * as store from '../store';
import { Guide, presetList, useTask } from './shared';

const shot = (file: string) => `${import.meta.env.BASE_URL}guide/${file}`;

export function KeyWarning() {
  return (
    <section className="key-warning" aria-label="키 보관 주의">
      <h3>키는 비밀번호처럼 다뤄 주세요</h3>
      <ul>
        <li>키가 있으면 누구나 내 계정의 크레딧으로 AI를 쓸 수 있어요.</li>
        <li>
          친구에게 보내거나 단톡방·커뮤니티·GitHub에 올리지 마세요. 키가 보이는 화면을 캡처해
          공유하지도 마세요.
        </li>
        <li>rRecall 말고 처음 보는 사이트나 앱에는 붙여 넣지 마세요.</li>
        <li>
          rRecall은 키를 이 브라우저에만 저장하고 ChatKHU 말고 다른 곳으로 보내지 않아요. 백업
          파일에도 키는 들어가지 않아요.
        </li>
        <li>
          노출된 것 같다면 API Gateway의 API 키 관리에서 그 키를 바로 삭제하고 새 키를 만드세요.
        </li>
      </ul>
    </section>
  );
}

export function KeyGuide() {
  return (
    <>
      <ol className="steps key-steps">
        <li>
          ChatKHU에 로그인한 뒤 왼쪽 아래 <strong>API Gateway</strong>를 눌러요. 다른 프로그램에서
          ChatKHU를 쓰게 해 주는 메뉴예요.
          <img
            className="guide-shot guide-shot-narrow"
            src={shot('key-1-gateway.png')}
            alt="ChatKHU 왼쪽 메뉴 맨 아래의 API Gateway"
            loading="lazy"
          />
        </li>
        <li>
          위쪽 탭에서 <strong>API 키</strong>를 눌러요.
          <img
            className="guide-shot"
            src={shot('key-2-tab.png')}
            alt="API Gateway 화면 위쪽의 API 키 탭"
            loading="lazy"
          />
        </li>
        <li>
          오른쪽의 <strong>+ API 키 생성</strong>을 눌러요.
          <img
            className="guide-shot"
            src={shot('key-3-create.png')}
            alt="API 키 관리 오른쪽의 API 키 생성 버튼"
            loading="lazy"
          />
        </li>
        <li>
          이름 칸에 <code>rRecall</code>처럼 알아보기 쉬운 이름을 적고 <strong>생성하기</strong>를
          눌러요. 설명은 비워도 돼요.
          <img
            className="guide-shot guide-shot-small"
            src={shot('key-4-name.png')}
            alt="API 키 생성 창의 이름, 설명 입력칸과 생성하기 버튼"
            loading="lazy"
          />
        </li>
        <li>
          맨 위 칸의 키를 <strong>복사</strong>해요. 이 창을 닫으면 키를 다시 볼 수 없어요. 아래쪽
          “설정 프롬프트”는 코딩 도구용이라 rRecall에는 필요 없어요.
          <img
            className="guide-shot guide-shot-small"
            src={shot('key-5-copy.png')}
            alt="생성된 API 키와 복사 버튼, 한 번만 표시된다는 경고"
            loading="lazy"
          />
        </li>
        <li>rRecall의 키 입력칸에 붙여 넣고 연결을 확인해요.</li>
      </ol>
      <p>크레딧(서비스 이용 잔액)은 키를 만든 계정에서 차감돼요.</p>
      <KeyWarning />
    </>
  );
}
export function Setup({ onKeyChange }: { onKeyChange: () => void }) {
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(store.readSettings().rememberKey);
  const [credit, setCredit] = useState<api.CreditInfo>();
  const task = useTask();
  const preset = presetList().find((p) => p.id === store.readSettings().preset);
  return (
    <>
      <h1>내 ChatKHU 연결하기</h1>
      <Guide
        what="ChatKHU에서 만든 키를 입력해 주세요."
        why="내 크레딧으로 강의를 정리하고 복습 피드백을 받을 수 있어요."
        tip="공용 컴퓨터라면 기억하기를 꺼 주세요."
      />
      <section className="card">
        <KeyGuide />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(async () => {
              const result = await api.checkKey(key.trim());
              api.setKey(key.trim(), remember);
              store.writeSettings({ ...store.readSettings(), rememberKey: remember });
              setKey('');
              setShow(false);
              setCredit(result);
              onKeyChange();
            });
          }}
        >
          <label>
            ChatKHU 키
            <input
              type={show ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <button type="button" aria-pressed={show} onClick={() => setShow(!show)}>
            {show ? '키 숨기기' : '입력한 키 보기'}
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            이 브라우저에 기억하기
          </label>
          <p className="muted">
            공용 컴퓨터에서는 키를 기억하지 마세요. 저장된 키는 이 브라우저를 쓰는 다른 사람도 쓸 수
            있어요.
          </p>
          <button className="primary" disabled={task.busy || !key.trim()}>
            키 확인하고 연결하기
          </button>
        </form>
        {task.status}
        {credit && (
          <div className="notice">
            <strong>{credit.totalRemaining.toLocaleString()} 크레딧 남음</strong>
            <p>
              {preset
                ? `이번 달 약 ${Math.floor(credit.totalRemaining / preset.creditsPerLecture)}강의 (현재 크레딧 기준 추정)`
                : '설정을 불러오면 강의 수 추정치를 표시해요.'}
            </p>
            <a className="button primary" href="#/">
              내 강의로 시작하기
            </a>
          </div>
        )}
      </section>
      <p className="muted">
        올린 파일은 강의를 정리할 때만 ChatKHU(운영: 마인드로직)로 보내고 다른 곳으로는 보내지
        않아요. 학습 기록은 이 브라우저에 저장돼요. 브라우저 데이터를 지우면 기록도 사라지니 미리
        백업해 주세요.
      </p>
      <button
        onClick={() =>
          void task.run(async () => {
            api.clearKey();
            setKey('');
            setCredit(undefined);
            onKeyChange();
            task.setMessage('이 기기의 키를 지웠어요.');
          })
        }
      >
        이 기기에서 키 지우기
      </button>
    </>
  );
}
const roleNames: Record<Role, string> = {
  digest: '노트 정리',
  skeleton: '복습 뼈대',
  reading: '백지복습 읽기',
  tutor: '질문과 피드백',
};
export function SettingsPage({ onKeyChange }: { onKeyChange: () => void }) {
  const [settings, setSettings] = useState<Settings>(store.readSettings);
  const task = useTask();
  const [pending, setPending] = useState<ReturnType<typeof api.decodeBundle>>();
  const [importError, setImportError] = useState('');
  const presets = presetList();
  function change(next: Settings) {
    void task.run(async () => {
      store.writeSettings(next);
      setSettings(next);
      task.setMessage('설정을 저장했어요.');
    });
  }
  return (
    <>
      <h1>설정과 백업</h1>
      <Guide
        what="내게 맞는 정리 방식을 골라 주세요."
        why="남은 크레딧과 원하는 정리 수준에 맞춰 선택할 수 있어요."
        tip="먼저 기본으로 시작하고, 필요한 경우에만 세부 설정을 바꾸세요."
      />
      <h2>정리 방식</h2>
      {presets.length === 0 && <p className="notice">정리 방식 목록을 아직 불러올 수 없어요.</p>}
      <div className="preset-grid">
        {presets.map((p) => (
          <button
            className={`card preset ${settings.preset === p.id ? 'selected' : ''}`}
            aria-pressed={settings.preset === p.id}
            key={p.id}
            onClick={() => change({ ...settings, preset: p.id, overrides: {} })}
          >
            <strong>{p.label}</strong>
            <p>{p.description}</p>
            <p>강의당 약 {p.creditsPerLecture} 크레딧</p>
          </button>
        ))}
      </div>
      <p className="muted">
        예상 크레딧은 실제 분량에 따라 달라지는 추정치예요. 2026-10-29 ChatKHU 사용량·단가를
        기준으로 계산했으며, 세부 모델을 바꾸면 달라질 수 있어요.
      </p>
      <details className="card">
        <summary>고급 설정 · 역할별 AI 선택</summary>
        {(Object.keys(roleNames) as Role[]).map((role) => {
          let candidates: ReturnType<typeof api.candidateModels> = [];
          try {
            candidates = api.candidateModels(role);
          } catch {
            /* Stub: no guessed model IDs. */
          }
          return (
            <label key={role}>
              {roleNames[role]}
              <select
                value={
                  settings.overrides[role]
                    ? `${settings.overrides[role]?.provider}:${settings.overrides[role]?.model}`
                    : ''
                }
                onChange={(e) => {
                  const next = { ...settings, overrides: { ...settings.overrides } };
                  const selected = candidates.find(
                    (m) => `${m.provider}:${m.model}` === e.target.value,
                  );
                  if (selected) next.overrides[role] = selected;
                  else delete next.overrides[role];
                  change(next);
                }}
              >
                <option value="">선택한 정리 방식 따르기</option>
                {candidates.map((c) => (
                  <option key={c.model} value={`${c.provider}:${c.model}`}>
                    {c.model}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </details>
      <label>
        노트와 피드백 언어
        <select
          value={settings.outputLanguage}
          onChange={(e) =>
            change({ ...settings, outputLanguage: e.target.value as Settings['outputLanguage'] })
          }
        >
          <option value="ko">한국어 (영어 용어 함께 표기)</option>
          <option value="en">영어</option>
        </select>
      </label>
      <section className="card">
        <h2>학습 기록 백업</h2>
        <p>
          다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 저장하세요. 백업에는 자료와 사진이
          포함되며 키는 포함되지 않아요.
        </p>
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(async () => {
              const { files, ...data } = await store.snapshot();
              const bundle = await api.encodeBundle(data, files, new Date());
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(bundle)], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = `rrecall-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              task.setMessage('백업 파일을 내려받았어요. 개인 자료가 있으니 안전하게 보관하세요.');
            })
          }
        >
          백업 내려받기
        </button>
        <label>
          백업 파일 가져오기 (.json)
          <input
            type="file"
            accept=".json,application/json"
            disabled={task.busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                void task.run(async () => {
                  setPending(undefined);
                  setImportError('');
                  try {
                    setPending(api.decodeBundle(JSON.parse(await file.text())));
                  } catch (err) {
                    // decodeBundle throws Korean messages; anything else means it is not our backup file.
                    const message = err instanceof Error ? err.message : '';
                    setImportError(
                      /[가-힣]/.test(message)
                        ? message
                        : 'rRecall 백업 파일이 아니에요. 설정에서 내려받은 .json 파일을 넣어 주세요.',
                    );
                  }
                });
              e.target.value = '';
            }}
          />
        </label>
        {importError && (
          <p role="alert" className="error">
            {importError}
          </p>
        )}
        {pending && (
          <aside className="notice">
            <p>
              과목 {pending.bundle.courses.length}개, 강의 {pending.bundle.lectures.length}개를
              가져와요. <strong>현재 학습 기록 전체를 이 백업으로 바꿔요.</strong> 먼저 현재 기록을
              백업해 주세요.
            </p>
            <div className="actions">
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await store.importBundle(pending.bundle, pending.files);
                    setPending(undefined);
                    task.setMessage('백업 파일의 학습 기록으로 바꿨어요.');
                  })
                }
              >
                기록 바꾸고 가져오기
              </button>
              <button onClick={() => setPending(undefined)}>취소</button>
            </div>
          </aside>
        )}
      </section>
      {task.status}
      <a className="button" href="#/setup">
        키 연결 관리
      </a>
      <button
        onClick={() =>
          void task.run(async () => {
            api.clearKey();
            onKeyChange();
            task.setMessage('이 기기의 키를 지웠어요.');
          })
        }
      >
        이 기기에서 키 지우기
      </button>
    </>
  );
}
