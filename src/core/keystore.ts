const KEY = 'rrecall.key';
let volatileKey: string | null = null;
function storage(kind: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    return globalThis[kind];
  } catch {
    return undefined;
  }
}
function read(kind: 'localStorage' | 'sessionStorage'): string | null {
  try {
    return storage(kind)?.getItem(KEY) || null;
  } catch {
    return null;
  }
}
export function getKey(): string | null {
  return volatileKey ?? read('sessionStorage') ?? read('localStorage');
}
export function clearKey(): void {
  volatileKey = null;
  for (const kind of ['localStorage', 'sessionStorage'] as const) {
    try {
      storage(kind)?.removeItem(KEY);
    } catch {
      /* Storage can be disabled. */
    }
  }
}
export function setKey(key: string, remember: boolean): void {
  clearKey();
  volatileKey = key.trim() || null;
  if (!volatileKey) return;
  try {
    storage(remember ? 'localStorage' : 'sessionStorage')?.setItem(KEY, volatileKey);
  } catch {
    /* Retain the key in memory when browser storage is unavailable. */
  }
}
