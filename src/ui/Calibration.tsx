import { useEffect, useState } from 'react';
import * as api from '../core/api';
import type { Lecture, WeakPoint } from '../core/types';
import * as store from '../store';
import { useTask } from './shared';

const MISSED_LABELS: Record<string, string> = {
  term: '용어를 못 떠올림',
  concept: '뜻이 없거나 틀림',
  section: '묶음이 빠짐',
  corrected: '빨간 펜으로 첨삭함',
};

function Items({ items }: { items: string[] }) {
  return items.length ? (
    <ul>
      {items.map((text, i) => (
        <li key={i}>{text}</li>
      ))}
    </ul>
  ) : (
    <p className="muted">아직 없어요.</p>
  );
}

export function Calibration({ lecture }: { lecture: Lecture }) {
  const [points, setPoints] = useState<WeakPoint[]>([]);
  const task = useTask();
  useEffect(() => {
    void task.run(async () =>
      setPoints((await store.all('weakPoints')).filter((point) => point.lectureId === lecture.id)),
    );
  }, [lecture]);
  const recalls = lecture.recalls
    .filter((recall) => recall.reading)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const calibration = api.recallCalibration(lecture, points);
  return (
    <section className="calibration-panel">
      <h2>내 백지복습 기록</h2>
      {!recalls.length && (
        <p className="muted">백지복습을 하면 기억한 것과 놓친 것을 함께 볼 수 있어요.</p>
      )}
      {recalls.map((recall) => {
        const reading = recall.reading!;
        // Chat questions alone are not observed recall failures.
        const gaps = reading.gaps.filter((gap) => gap.source !== 'asked');
        return (
          <details key={recall.id}>
            <summary>
              {new Date(recall.date).toLocaleDateString('ko-KR')} · {recall.level ?? 1}단계
              {!recall.confirmedAt && ' · 확인 전'}
            </summary>
            <div className="calibration-columns">
              <section>
                <h3>기억한 것</h3>
                <Items
                  items={reading.recalled.map(
                    (item) => `${item.text}${item.uncertain ? ' (읽기 확인 필요)' : ''}`,
                  )}
                />
              </section>
              <section>
                <h3>빠지거나 틀린 것</h3>
                <Items
                  items={gaps
                    .filter((gap) => gap.kind !== 'self-flagged')
                    .map(
                      (gap) =>
                        `${gap.concept} · ${MISSED_LABELS[api.gapKind(gap.kind)] ?? '빠짐'}${gap.uncertain ? ' (읽기 확인 필요)' : ''}`,
                    )}
                />
              </section>
              <section>
                <h3>스스로 모른다고 한 것</h3>
                <Items
                  items={gaps
                    .filter((gap) => gap.kind === 'self-flagged')
                    .map((gap) => gap.concept)}
                />
              </section>
            </div>
          </details>
        );
      })}
      {points.some((point) => point.reviews.length) && (
        <div className="calibration-outcomes">
          <h3>생각보다 알고 있었어요</h3>
          <Items items={calibration.underestimated} />
          <h3>안다고 생각했지만 놓쳤어요</h3>
          <Items items={calibration.overestimated} />
          <p className="muted">
            같은 이름으로 기록된 개념을 비교해요. 같은 날 연습했거나 힌트를 보고 맞힌 경우는 이미
            알고 있던 것으로 세지 않아요.
          </p>
        </div>
      )}
      {task.status}
    </section>
  );
}
