/**
 * Safe local storage wrappers with in-memory fallback.
 * Prevents SecurityError or quota exceeded exceptions in restricted environments
 * (e.g. private browsing, third-party iframes, or disabled browser storage).
 */

const memoryStore = new Map<string, string>();

export function safeStorageGet(key: string, fallback: string = ''): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const val = window.localStorage.getItem(key);
      return val !== null ? val : fallback;
    }
  } catch {
    // In-memory fallback on security/storage exceptions
  }
  return memoryStore.has(key) ? (memoryStore.get(key) ?? fallback) : fallback;
}

export function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // In-memory fallback
  }
  memoryStore.set(key, value);
}

export function safeStorageRemove(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch {
    // In-memory fallback
  }
  memoryStore.delete(key);
}
