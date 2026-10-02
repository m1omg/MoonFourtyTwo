/** localStorage with try/catch and an in-memory fallback (private mode, blocked storage). */
const mem = new Map<string, string>();

export function readJSON<T>(key: string): T | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    raw = mem.get(key) ?? null;
  }
  if (raw == null) raw = mem.get(key) ?? null;
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  mem.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    /* storage unavailable: memory only */
  }
}

export function remove(key: string): void {
  mem.delete(key);
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
