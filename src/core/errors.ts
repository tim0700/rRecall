export type GatewayErrorKind =
  | 'no-key'
  | 'auth'
  | 'credit'
  | 'forbidden'
  | 'not-found'
  | 'too-large'
  | 'rate'
  | 'server'
  | 'network'
  | 'bad-response';

export class GatewayError extends Error {
  kind: GatewayErrorKind;
  status?: number;
  retryAfterSec?: number;
  constructor(kind: GatewayErrorKind, message: string, status?: number, retryAfterSec?: number) {
    super(message);
    this.name = 'GatewayError';
    this.kind = kind;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

const messages: Record<GatewayErrorKind, string> = {
  'no-key': 'ChatKHU API 키를 먼저 입력해 주세요.',
  auth: 'API 키를 확인해 주세요. 키가 만료되었거나 올바르지 않아요.',
  credit: '이번 달 크레딧을 다 썼어요. ChatKHU에서 잔액과 갱신일을 확인해 주세요.',
  forbidden:
    '이 모델을 사용할 수 없어요. 다른 모델을 선택하거나 ChatKHU의 이용 권한을 확인해 주세요.',
  'not-found': '요청한 모델이나 기능을 찾을 수 없어요. 모델 설정을 확인해 주세요.',
  'too-large': '파일이 너무 커요. 페이지나 사진 수를 줄여 다시 시도해 주세요.',
  rate: '요청이 잠시 몰렸어요. 조금 기다린 뒤 다시 시도해 주세요.',
  server: 'ChatKHU 서버가 잠시 응답하지 않아요. 잠시 후 다시 시도해 주세요.',
  network: '연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.',
  'bad-response': '응답 형식을 확인하지 못했어요. 다시 시도해 주세요.',
};
export function explainError(e: unknown): string {
  if (e instanceof GatewayError) return messages[e.kind] ?? messages['bad-response'];
  if (e instanceof Error && e.name === 'AbortError') return '요청을 취소했어요.';
  return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
export function failure(
  kind: GatewayErrorKind,
  status?: number,
  retryAfterSec?: number,
): GatewayError {
  return new GatewayError(kind, messages[kind], status, retryAfterSec);
}
export function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('요청을 취소했어요.', 'AbortError');
}
