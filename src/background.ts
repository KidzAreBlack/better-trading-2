// Background script: fetches poe.ninja prices and pobb.in builds for the page
// (content scripts can't call other sites directly).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = (globalThis as any).browser ?? (globalThis as any).chrome;

api.runtime.onMessage.addListener(
  (request: {query?: string; resource?: string; id?: string}, _sender: unknown, sendResponse: (payload: unknown) => void) => {
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
    if (!request.resource.startsWith('/data/')) return undefined;

    fetch(`https://poe.ninja/api${request.resource}`)
      .then((response) => response.json())
      .then((payload) => sendResponse(payload))
      .catch(() => sendResponse(null));

    return true; // keep the channel open for the async response
  }
);
