// Background script: fetches poe.ninja prices for the page (pages can't call poe.ninja directly).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = (globalThis as any).browser ?? (globalThis as any).chrome;

api.runtime.onMessage.addListener(
  (request: {query?: string; resource?: string}, _sender: unknown, sendResponse: (payload: unknown) => void) => {
    if (request.query !== 'poe-ninja' || typeof request.resource !== 'string') return undefined;
    if (!request.resource.startsWith('/data/')) return undefined;

    fetch(`https://poe.ninja/api${request.resource}`)
      .then((response) => response.json())
      .then((payload) => sendResponse(payload))
      .catch(() => sendResponse(null));

    return true; // keep the channel open for the async response
  }
);
