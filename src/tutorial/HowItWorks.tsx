// Plain-language guide to the learning loop. Intervals mirror src/core/schedule.ts
// (lectureReviewTasks, dueWeakPoints); update both together.

export function StudyLoop() {
  return (
    <>
      <section className="card">
        <h2>한 강의가 지나가는 길</h2>
        <ol className="tutorial-loop">
          <li>
            <strong>정리</strong> 강의 대본과 내 필기로 노트를 만들어요. 큰 질문 → 핵심 흐름 → 세부
            내용 순서예요.
          </li>
          <li>
            <strong>질문하기</strong> 이해가 안 되는 곳만 노트 안에서 짧게 물어봐요.
          </li>
          <li>
            <strong>백지복습</strong> 노트를 덮고 뼈대만 보며 종이에 써요. 검정 펜은 혼자 떠올린 것,
            빨간 펜은 노트를 보고 고친 것이에요.
          </li>
          <li>
            <strong>약점 고르기</strong> AI가 종이를 읽은 결과에서 진짜 빈틈만 내가 골라요.
          </li>
          <li>
            <strong>약점 복습</strong> 고른 약점은 날짜를 띄워 문제로 다시 풀어요.
          </li>
        </ol>
      </section>
      <section className="card">
        <h2>왜 이런 구조인가요?</h2>
        <dl className="tutorial-principles">
          <dt>보는 것과 쓰는 것은 달라요</dt>
          <dd>
            노트를 다시 읽으면 익숙해서 “아, 이거 알지” 하고 넘어가기 쉬워요. 빈 종이에 직접 쓰려면
            기억에서 꺼내 내 문장으로 만들어야 해서, 실제로 아는 것과 안다고 착각한 것이 드러나요.
            이렇게 내가 무엇을 알고 모르는지 스스로 점검하는 힘을 메타인지라고 해요.
          </dd>
          <dt>큰 그림부터 잡아요</dt>
          <dd>
            세부 내용부터 외우면 조각이 흩어지기 쉬워요. 강의의 큰 질문과 흐름을 먼저 잡으면 세부
            내용이 걸릴 자리가 생겨요. 노트도, 3단계 백지복습도 이 순서를 따라요.
          </dd>
          <dt>조금씩 어렵게 해요</dt>
          <dd>
            1단계는 빈칸과 뜻 한 줄, 2단계는 핵심 개념의 뜻 쓰기, 3단계는 목차만 보고 강의 전체
            떠올리기예요. 단서를 줄여 갈수록 혼자 떠올리는 힘을 확인할 수 있어요.
          </dd>
          <dt>날짜를 띄워 다시 떠올려요</dt>
          <dd>
            하루에 몰아서 반복하기보다 조금 잊어 갈 때 다시 떠올려야 오래 남아요. 그래서 같은 날 푼
            답은 진도에 세지 않고, 다음 날부터 간격을 늘려 가며 다시 물어봐요.
          </dd>
        </dl>
      </section>
    </>
  );
}

export function ReviewSchedule() {
  return (
    <section className="card">
      <h2>복습은 언제 하나요?</h2>
      <p className="muted">날짜가 되면 홈의 “오늘 할 복습”에 나타나요.</p>
      <h3>강의 백지복습</h3>
      <table className="tutorial-schedule">
        <tbody>
          <tr>
            <th scope="row">강의 당일</th>
            <td>1단계 · 빈칸 채우고 용어마다 뜻 한 줄</td>
          </tr>
          <tr>
            <th scope="row">3일 뒤</th>
            <td>2단계 · 핵심 개념의 뜻을 내 말로</td>
          </tr>
          <tr>
            <th scope="row">그 뒤 14일마다</th>
            <td>2단계 다시</td>
          </tr>
          <tr>
            <th scope="row">시험 전 등 원할 때</th>
            <td>3단계 · 목차만 보고 강의 전체 떠올리기</td>
          </tr>
        </tbody>
      </table>
      <h3>약점 문제</h3>
      <table className="tutorial-schedule">
        <tbody>
          <tr>
            <th scope="row">약점을 고른 날</th>
            <td>풀어 봐도 되지만 진도에는 세지 않아요. 방금 본 내용이라서요.</td>
          </tr>
          <tr>
            <th scope="row">다음 날</th>
            <td>1단계 문제 · 내 말로 설명하기</td>
          </tr>
          <tr>
            <th scope="row">맞히면 3일 뒤</th>
            <td>2단계 문제 · 적용하거나 다른 개념과 연결하기</td>
          </tr>
          <tr>
            <th scope="row">틀리면</th>
            <td>다음 날 다시 확인해요. 전에 맞힌 날은 그대로 남아요.</td>
          </tr>
          <tr>
            <th scope="row">해결 후 21일 뒤</th>
            <td>장기 확인 · 오래 기억하는지 한 번 더 확인해요.</td>
          </tr>
        </tbody>
      </table>
      <p className="notice">
        해결 기준: 서로 다른 날에 힌트 없이 두 번 맞히고, 나중 문제가 2단계 문제일 때예요. “다시 써
        보기”와 “한 걸음 더”는 언제든 연습할 수 있지만 진도에는 세지 않아요.
      </p>
    </section>
  );
}

export function WhyWriteByHand() {
  return (
    <section className="card">
      <h2>왜 직접 손으로 쓰나요?</h2>
      <ul>
        <li>
          <strong>떠올리는 순간이 공부예요.</strong> 보면서 확인하는 것과 달리, 빈 종이에 쓰려면
          스스로 기억을 꺼내야 해요. 막히는 곳이 바로 다음에 복습할 곳이에요.
        </li>
        <li>
          <strong>용어와 뜻은 따로 확인해요.</strong> 용어를 쓸 수 있어도 뜻은 모를 수 있어요.
          1단계에서 뜻을 한 줄씩 쓰면, 뜻이 빠지거나 틀린 용어를 하나씩 약점으로 잡아 줘요. 용어만
          쓰면 뜻은 판단하지 않고 안내만 보여 줘요.
        </li>
        <li>
          <strong>검정과 빨강을 나눠요.</strong> 혼자 떠올린 것과 노트를 보고 고친 것을 나눠야 실제
          기억 상태가 보여요. 빨간 펜으로 채운 내용은 다음 복습 대상이 돼요.
        </li>
        <li>
          <strong>모르면 ?를 남겨요.</strong> 헷갈리는 곳에 물음표를 쓰면 “스스로 모른다고 표시”한
          약점으로 먼저 골라 둬요.
        </li>
      </ul>
    </section>
  );
}

export function FirstWeek() {
  return (
    <section className="card">
      <h2>처음 일주일은 이렇게 해 보세요</h2>
      <ol>
        <li>강의 당일: 노트를 읽고, 1단계 백지복습을 한 뒤 약점을 골라요.</li>
        <li>다음 날: 홈의 “오늘 할 복습”에서 약점 문제를 풀어요.</li>
        <li>3일 뒤: 2단계 백지복습을 하고, 2단계 약점 문제를 풀어요.</li>
        <li>새 강의가 생기면 같은 흐름을 반복해요. 지난 약점은 관련 있을 때 뼈대에 함께 나와요.</li>
      </ol>
    </section>
  );
}
