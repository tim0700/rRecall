import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  availableModels,
  checkKey,
  clearKey,
  explainError,
  GatewayError,
  getCredits,
  getKey,
  setKey,
} from './api';
import { requestJSON, retryAfter } from './gateway';

beforeEach(() => {
  clearKey();
  setKey('test-key-never-output', false);
});
afterEach(() => {
  clearKey();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([
  [401, 'auth'],
  [402, 'credit'],
  [403, 'forbidden'],
  [404, 'not-found'],
  [413, 'too-large'],
  [400, 'bad-response'],
] as const)('maps HTTP %i without retrying or exposing provider messages', async (status, kind) => {
  const fetcher = vi.fn().mockResolvedValue(new Response('test-key-never-output', { status }));
  vi.stubGlobal('fetch', fetcher);
  const error = await checkKey('test-key-never-output').catch((e) => e);
  expect(error).toBeInstanceOf(GatewayError);
  expect(error.kind).toBe(kind);
  expect(error.message).not.toContain('test-key-never-output');
  expect(explainError(error)).not.toContain('test-key-never-output');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  [429, 'rate'],
  [503, 'server'],
] as const)('retries HTTP %i at most twice', async (status, kind) => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response('', { status, headers: { 'Retry-After': '2' } })),
    );
  vi.stubGlobal('fetch', fetcher);
  const pending = requestJSON('/credits/').catch((e) => e);
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ kind });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('retries network failures without propagating their error text', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockRejectedValue(new Error('test-key-never-output'));
  vi.stubGlobal('fetch', fetcher);
  const pending = requestJSON('/credits/').catch((e) => e);
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ kind: 'network' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('honours Retry-After seconds and dates with a 30 second cap', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
  expect(retryAfter('5')).toBe(5);
  expect(retryAfter('900')).toBe(30);
  expect(retryAfter('Thu, 29 Oct 2026 00:00:10 GMT')).toBe(10);
  expect(retryAfter('n/a')).toBeUndefined();
});
it('cancels a retry wait without making another request', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response('', { status: 429 })));
  vi.stubGlobal('fetch', fetcher);
  const pending = requestJSON('/credits/', { signal: controller.signal }).catch((e) => e);
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('maps credits, models and a missing key; checkKey does not replace stored key', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        monthly_allocated: { quota: 4000, remaining: 100, renewal_date: '2026-11-01' },
        total: { remaining: 500 },
      }),
    )
    .mockResolvedValueOnce(Response.json({ data: [{ id: 'verified-id' }] }));
  vi.stubGlobal('fetch', fetcher);
  expect(await checkKey('another-test-key')).toEqual({
    monthlyQuota: 4000,
    monthlyRemaining: 100,
    totalRemaining: 500,
    renewalDate: '2026-11-01',
  });
  expect(getKey()).toBe('test-key-never-output');
  expect(await availableModels()).toEqual(['verified-id']);
  clearKey();
  await expect(getCredits()).rejects.toMatchObject({ kind: 'no-key' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retries malformed successful credit responses exactly once', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(() => Promise.resolve(Response.json({ monthly_allocated: {} })));
  vi.stubGlobal('fetch', fetcher);
  await expect(getCredits()).rejects.toMatchObject({ kind: 'bad-response' });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('moves remembered keys between stores and clears both; tolerates absent browser storage', () => {
  const memory = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
  };
  const local = memory();
  const session = memory();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  setKey('one', true);
  expect(local.getItem('rrecall.key')).toBe('one');
  setKey('two', false);
  expect(local.getItem('rrecall.key')).toBeNull();
  expect(session.getItem('rrecall.key')).toBe('two');
  clearKey();
  expect(getKey()).toBeNull();
  vi.stubGlobal('localStorage', undefined);
  vi.stubGlobal('sessionStorage', undefined);
  setKey('memory', false);
  expect(getKey()).toBe('memory');
  expect(explainError(new Error('secret'))).not.toContain('secret');
});
