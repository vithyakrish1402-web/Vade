import { beforeEach } from 'vitest';

class LocalStorageMock {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  const mock = new LocalStorageMock();
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    writable: true,
  });
}

beforeEach(() => {
  globalThis.localStorage.clear();
});
