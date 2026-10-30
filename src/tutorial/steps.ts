export interface TutorialStep {
  id:
    | 'overview'
    | 'key'
    | 'stt'
    | 'import'
    | 'note'
    | 'skeleton'
    | 'chat'
    | 'recall'
    | 'confirmation'
    | 'weak-points'
    | 'question'
    | 'review'
    | 'final';
  title: string;
  shortTitle: string;
  what: string;
  why: string;
  tip: string;
  content: boolean;
}

export const tutorialSteps: TutorialStep[] = [
  {
    id: 'overview',
    title: 'rRecall은 이렇게 공부해요',
    shortTitle: '공부 방식',
    what: '강의를 읽고 끝내는 대신, 보지 않고 꺼내 보고 빈틈만 골라 날짜를 띄워 다시 만나요.',
    why: '다시 읽기만 하면 익숙해서 아는 것처럼 느껴지기 쉬워요. 직접 꺼내 봐야 아는 것과 모르는 것이 갈려요.',
    tip: '전체 흐름을 먼저 보고, 다음 단계부터 하나씩 체험해 보세요.',
    content: false,
  },
  {
    id: 'key',
    title: 'ChatKHU 키 준비하기',
    shortTitle: '키 안내',
    what: '실제로 시작할 때 필요한 ChatKHU 키를 어디서 만드는지 살펴봐요.',
    why: 'rRecall이 강의 자료를 정리할 때 내 ChatKHU 계정의 처리 기능을 사용하기 때문이에요.',
    tip: '키는 만든 직후에만 볼 수 있어요. 비밀번호처럼 나만 알고 있어야 해요.',
    content: false,
  },
  {
    id: 'stt',
    title: '강의 내용을 글로 준비하기',
    shortTitle: 'STT 안내',
    what: '휴대폰의 음성 기록 앱이나 강의에서 제공한 자막으로 글 파일을 준비해요.',
    why: '강의 내용이 글로 있어야 중요한 설명과 근거를 빠짐없이 찾을 수 있어요.',
    tip: 'Clova Note 같은 앱에서 txt로 내보내면 편해요. srt와 vtt 자막도 사용할 수 있어요.',
    content: false,
  },
  {
    id: 'import',
    title: '강의 가져오기',
    shortTitle: '가져오기',
    what: '글 파일과 강의 자료를 넣고, 처음 몇 문장이 제대로 읽혔는지 확인해요.',
    why: '입력 내용을 먼저 확인하면 잘못된 파일로 노트를 만드는 실수를 줄일 수 있어요.',
    tip: '직접 적은 메모가 있는 PDF나 사진을 함께 넣으면 내 필기도 노트에 반영할 수 있어요.',
    content: true,
  },
  {
    id: 'note',
    title: '큰 그림부터 노트 보기',
    shortTitle: '노트',
    what: '강의의 큰 질문과 핵심 흐름을 먼저 보고, 세부 내용을 차례로 읽어요.',
    why: '큰 그림을 먼저 잡으면 세부 내용을 서로 연결해서 기억하기 쉬워져요.',
    tip: '문장 아래의 근거를 눌러 강의에서 실제로 한 설명과 맞는지 확인해 보세요.',
    content: true,
  },
  {
    id: 'skeleton',
    title: '백지복습 뼈대 확인하기',
    shortTitle: '뼈대',
    what: '정답은 보지 않고 단어 묶음과 빈칸 문장으로 무엇을 떠올릴지 확인해요.',
    why: '읽는 대신 직접 꺼내 보는 과정에서 내가 아는 부분과 모르는 부분이 드러나요.',
    tip: '아직 답을 채우지 마세요. 이 화면은 종이에 기억을 써 내려갈 순서만 잡아 줘요.',
    content: true,
  },
  {
    id: 'chat',
    title: '복습 전에 질문하기',
    shortTitle: '질문하기',
    what: '처음 보는 개념이 있으면 강의 노트 안에서 짧게 설명을 받아요.',
    why: '최소한의 이해가 있어야 무작정 외우지 않고 스스로 떠올릴 수 있어요.',
    tip: '답을 대신 써 달라고 하기보다 “왜 그런가요?”처럼 이해를 돕는 질문을 해 보세요.',
    content: true,
  },
  {
    id: 'recall',
    title: '종이에 백지복습하기',
    shortTitle: '백지복습',
    what: '검정 펜으로 기억나는 내용을 쓰고, 1단계에서는 각 용어 옆에 뜻을 내 말로 한 줄씩 적어요. 노트를 본 뒤 보충한 내용은 빨간 펜으로 구분해요.',
    why: '보는 것과 쓰는 것은 달라요. 직접 써야 실제로 아는 것과 안다고 착각한 것이 드러나고, 검정·빨강을 나누면 혼자 떠올린 만큼이 보여요.',
    tip: '촬영할 때 종이를 위에서 밝게 찍어 주세요. 종이 대신 화면에 글로 입력할 수도 있어요.',
    content: true,
  },
  {
    id: 'confirmation',
    title: '읽은 결과 확인하기',
    shortTitle: '결과 확인',
    what: '기억한 내용, 빨간 펜으로 고친 내용, 빠진 내용을 확인하고 직접 약점을 골라요.',
    why: '사진을 잘못 읽은 부분이 그대로 약점이 되지 않도록 마지막 판단은 내가 해요.',
    tip: '확실하지 않다고 표시된 항목은 기본으로 선택되지 않아요. 사진과 노트를 다시 보고 결정하세요.',
    content: true,
  },
  {
    id: 'weak-points',
    title: '약점으로 모으기',
    shortTitle: '약점',
    what: '확인한 빈틈을 과목의 약점 목록에 모아 두어요.',
    why: '복습할 내용을 따로 찾지 않아도 잊기 쉬운 시점에 다시 문제로 만날 수 있어요.',
    tip: '등록한 다음 날부터 서로 다른 날 힌트 없이 맞히고, 나중 답이 적용·연결 문제이면 해결돼요.',
    content: true,
  },
  {
    id: 'question',
    title: '약점 문제 풀고 채점하기',
    shortTitle: '문제와 채점',
    what: '약점 종류에 맞는 문제에 답하고, 필요하면 힌트를 받아 한 번 더 시도해요.',
    why: '첫 복습은 내 말로 설명하고, 다음 복습은 적용하거나 연결하면서 이해가 깊어졌는지 확인해요.',
    tip: '첫 답이 틀려도 정답은 바로 보이지 않아요. 힌트를 보고 내 답을 한 번 고쳐 보세요.',
    content: true,
  },
  {
    id: 'review',
    title: '오늘의 복습 확인하기',
    shortTitle: '복습 목록',
    what: '오늘 푼 기록과 다음에 다시 볼 약점을 확인해요.',
    why: '하루에 몰아서 반복하지 않고 날짜를 띄워 다시 떠올려야 오래 기억할 수 있어요.',
    tip: '등록한 날의 오늘 연습은 진도에 세지 않아요. 서로 다른 날 두 번 맞히고, 마지막에 2단계 문제를 맞히면 해결돼요.',
    content: true,
  },
  {
    id: 'final',
    title: '내 강의로 시작하기',
    shortTitle: '시작',
    what: '이제 내 ChatKHU 키와 내 강의 자료로 같은 흐름을 시작해요.',
    why: '내가 실제로 듣는 강의를 복습할 때 rRecall의 약점 기록이 쌓여요.',
    tip: '처음에는 강의 하나만 넣고 전체 과정을 끝까지 경험해 보세요.',
    content: false,
  },
];
