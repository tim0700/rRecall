import type { CreditInfo } from './api';
import { checkAbort, failure, GatewayError } from './errors';
import type { GatewayErrorKind } from './errors';
import { getKey } from './keystore';

export const BASE_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function statusKind(status: number): GatewayErrorKind {
  return (
    (
      {
        401: 'auth',
        402: 'credit',
        403: 'forbidden',
        404: 'not-found',
        413: 'too-large',
        429: 'rate',
      } as Record<number, GatewayErrorKind>
    )[status] ?? (status >= 500 ? 'server' : 'bad-response')
  );
}
export function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const numeric = Number(value);
  const seconds = Number.isFinite(numeric) ? numeric : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.min(30, Math.max(0, seconds)) : undefined;
}
async function pause(ms: number, signal?: AbortSignal): Promise<void> {
  checkAbort(signal);
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('요청을 취소했어요.', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export async function requestJSON(
  path: string,
  options: {
    key?: string;
    provider?: 'gemini' | 'claude';
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<unknown> {
  const key = (options.key ?? getKey())?.trim();
  if (!key) throw failure('no-key');
  const headers: Record<string, string> =
    options.provider === 'claude'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${key}` };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  for (let attempt = 0; ; attempt++) {
    checkAbort(options.signal);
    try {
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}${path}`, {
          method: options.body === undefined ? 'GET' : 'POST',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: options.signal,
        });
      } catch {
        checkAbort(options.signal);
        throw failure('network'); // Never propagate fetch messages or gateway bodies: they may echo credentials.
      }
      if (!response.ok)
        throw failure(
          statusKind(response.status),
          response.status,
          retryAfter(response.headers.get('Retry-After')),
        );
      try {
        return await response.json();
      } catch {
        checkAbort(options.signal);
        throw failure('bad-response');
      }
    } catch (error) {
      checkAbort(options.signal);
      if (
        !(error instanceof GatewayError) ||
        !['rate', 'server', 'network'].includes(error.kind) ||
        attempt >= 2
      )
        throw error;
      await pause((error.retryAfterSec ?? 2 ** attempt) * 1000, options.signal);
    }
  }
}
/** One additional call for malformed successful responses only, never for HTTP failures. */
export async function validatedCall<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      if (
        attempt >= 1 ||
        !(e instanceof GatewayError) ||
        e.kind !== 'bad-response' ||
        e.status !== undefined
      )
        throw e;
    }
  }
}
export async function checkKey(key: string): Promise<CreditInfo> {
  return validatedCall(async () => {
    const data = await requestJSON('/credits/', { key });
    if (!isObject(data) || !isObject(data.monthly_allocated) || !isObject(data.total))
      throw failure('bad-response');
    const monthly = data.monthly_allocated;
    if (
      !isNumber(monthly.quota) ||
      !isNumber(monthly.remaining) ||
      !isNumber(data.total.remaining) ||
      (monthly.renewal_date !== undefined &&
        monthly.renewal_date !== null &&
        typeof monthly.renewal_date !== 'string')
    )
      throw failure('bad-response');
    return {
      monthlyQuota: monthly.quota,
      monthlyRemaining: monthly.remaining,
      totalRemaining: data.total.remaining,
      ...(typeof monthly.renewal_date === 'string' ? { renewalDate: monthly.renewal_date } : {}),
    };
  });
}
export async function getCredits(): Promise<CreditInfo> {
  return checkKey(getKey() ?? '');
}
export async function availableModels(): Promise<string[]> {
  return validatedCall(async () => {
    const data = await requestJSON('/models/');
    if (
      !isObject(data) ||
      !Array.isArray(data.data) ||
      !data.data.every((m) => isObject(m) && typeof m.id === 'string')
    )
      throw failure('bad-response');
    return data.data.map((m) => (m as { id: string }).id);
  });
}
