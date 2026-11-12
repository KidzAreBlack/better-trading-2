// Thin wrapper over the browser extension API so the same code runs in
// Chrome-family browsers (`chrome`) and Firefox (`browser`).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = (globalThis as any).browser ?? (globalThis as any).chrome;

export const assetUrl = (path: string): string => api.runtime.getURL(`assets/${path}`);

// Both browsers return promises from these calls. A failure usually means the
// extension was reloaded while this page stayed open, so fall back quietly.
export const sendMessage = async <T>(message: object): Promise<T | null> => {
  try {
    return ((await api.runtime.sendMessage(message)) as T) ?? null;
  } catch (_error) {
    return null;
  }
};

const storageCall = async <T>(method: 'get' | 'set' | 'remove', argument: unknown): Promise<T | undefined> => {
  try {
    return (await api.storage.local[method](argument)) as T;
  } catch (_error) {
    return undefined;
  }
};

interface Payload<T> {
  value: T;
  expiresAt: string | null;
}

const formatKey = (key: string, league: string | null = null) => (league ? `${key}--${league}` : key).toLowerCase();

// Same storage layout as the original Better Trading, so its backup files restore cleanly.
export const storage = {
  async get<T>(key: string, league: string | null = null): Promise<T | null> {
    const fullKey = formatKey(key, league);
    const result = await storageCall<Record<string, Payload<T>> | undefined>('get', [fullKey]);
    const payload = result?.[fullKey];
    if (!payload) return null;
    if (payload.expiresAt && Date.now() > new Date(payload.expiresAt).getTime()) return null;

    return payload.value;
  },

  async set<T>(key: string, value: T, league: string | null = null, expiresAt: Date | null = null): Promise<void> {
    await storageCall('set', {[formatKey(key, league)]: {value, expiresAt: expiresAt ? expiresAt.toUTCString() : null}});
  },

  async remove(key: string, league: string | null = null): Promise<void> {
    await storageCall('remove', formatKey(key, league));
  },
};

// Small per-browser values (settings, open folders). Stored on the page, not in the extension.
export const local = {
  get: (key: string): string | null => {
    try {
      return window.localStorage.getItem(`bt-${key}`);
    } catch (_error) {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(`bt-${key}`);
      else window.localStorage.setItem(`bt-${key}`, value);
    } catch (_error) {
      // Storage can be unavailable (private mode); the setting just won't be remembered.
    }
  },
};
