// Background script: fetches poe.ninja prices and pobb.in builds for the page
// (content scripts can't call other sites directly).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = (globalThis as any).browser ?? (globalThis as any).chrome;

// ---- Automatic bookmark backup ---------------------------------------------------------
// One file, overwritten each time: Downloads/Better Trading 2/backup.txt. The download is
// then removed from the browser's download list (the file itself stays).
const BACKUP_FILENAME = 'Better Trading 2/backup.txt';

const saveBackup = async (text: string): Promise<boolean> => {
  if (!api.downloads?.download) return false;

  // Firefox's background page can make a blob address; Chrome's service worker can't, so it
  // gets the text as a data: address instead.
  const canBlob = typeof URL.createObjectURL === 'function';
  const url = canBlob
    ? URL.createObjectURL(new Blob([text], {type: 'text/plain'}))
    : `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

  try {
    const id: number = await api.downloads.download({url, filename: BACKUP_FILENAME, conflictAction: 'overwrite', saveAs: false});
    const forget = (delta: {id: number; state?: {current?: string}}) => {
      if (delta.id !== id || !delta.state?.current || delta.state.current === 'in_progress') return;
      api.downloads.onChanged.removeListener(forget);
      if (canBlob) URL.revokeObjectURL(url);
      void api.downloads.erase({id});
    };
    api.downloads.onChanged.addListener(forget);
    return true;
  } catch (_error) {
    if (canBlob) URL.revokeObjectURL(url);
    return false;
  }
};

api.runtime.onMessage.addListener(
  (request: {query?: string; resource?: string; id?: string; text?: string}, _sender: unknown, sendResponse: (payload: unknown) => void) => {
    if (request.query === 'backup-file') {
      if (typeof request.text !== 'string') return undefined;
      saveBackup(request.text).then(sendResponse, () => sendResponse(false));
      return true;
    }

    // "Add build": the Path of Building code behind a pobb.in link.
    if (request.query === 'pobb-in') {
      if (typeof request.id !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(request.id)) return undefined;
      fetch(`https://pobb.in/${request.id}/raw`)
        .then((response) => (response.ok ? response.text() : null))
        .then((code) => sendResponse(code ? code.trim() : null))
        .catch(() => sendResponse(null));
      return true;
    }

    if (request.query !== 'poe-ninja' || typeof request.resource !== 'string') return undefined;
    // Only poe.ninja's PoE 1 economy data (currency rates).
    if (!request.resource.startsWith('/poe1/api/economy/')) return undefined;

    fetch(`https://poe.ninja${request.resource}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => sendResponse(payload))
      .catch(() => sendResponse(null));

    return true; // keep the channel open for the async response
  }
);
