// Background script: fetches poe.ninja prices and pobb.in builds for the page
// (content scripts can't call other sites directly).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = (globalThis as any).browser ?? (globalThis as any).chrome;

// ---- Automatic bookmark backup ---------------------------------------------------------
// One file per browser, overwritten each time: Downloads/Better Trading 2/<browser>_backup.txt
// (firefox_backup.txt, chrome_backup.txt...), so browsers sharing a Downloads folder don't
// overwrite each other's backup. The download is then removed from the browser's download list
// (the file itself stays).

// "firefox", "chrome", "edge", or another Chromium browser's own name when it gives one.
const browserName = async (): Promise<string> => {
  if (typeof api.runtime.getBrowserInfo === 'function') {
    try {
      return slug((await api.runtime.getBrowserInfo()).name) || 'firefox';
    } catch (_error) {
      return 'firefox';
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  if (nav.brave) return 'brave';
  const brands: string[] = (nav.userAgentData?.brands || []).map((brand: {brand: string}) => brand.brand);
  const own = brands.find((brand) => !/chromium|not.?a.?brand/i.test(brand));
  if (!own || own === 'Google Chrome') return 'chrome';
  if (own === 'Microsoft Edge') return 'edge';
  return slug(own) || 'chrome';
};
const slug = (name: unknown): string =>
  String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

let backupFilename: Promise<string> | null = null;
const getBackupFilename = () => (backupFilename ??= browserName().then((name) => `Better Trading 2/${name}_backup.txt`));

const saveBackup = async (text: string): Promise<boolean> => {
  if (!api.downloads?.download) return false;

  // Firefox's background page can make a blob address; Chrome's service worker can't, so it
  // gets the text as a data: address instead.
  const canBlob = typeof URL.createObjectURL === 'function';
  const url = canBlob
    ? URL.createObjectURL(new Blob([text], {type: 'text/plain'}))
    : `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;

  try {
    const id: number = await api.downloads.download({url, filename: await getBackupFilename(), conflictAction: 'overwrite', saveAs: false});
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

// Clicking a live search notification brings its trade tab to the front. Firefox unloads this
// script when idle (Chrome stops its service worker), so which tab each notification is for is
// also kept in session storage, which outlives that.
type NotificationTab = {tabId: number; windowId?: number};
const notificationTabs = new Map<string, NotificationTab>();
const notificationKey = (id: string) => `notification-tab-${id}`;

const rememberNotificationTab = (id: string, target: NotificationTab) => {
  notificationTabs.set(id, target);
  void api.storage?.session?.set({[notificationKey(id)]: target}).catch(() => undefined);
};

const findNotificationTab = async (id: string): Promise<NotificationTab | undefined> => {
  const known = notificationTabs.get(id);
  if (known) return known;
  try {
    return (await api.storage?.session?.get(notificationKey(id)))?.[notificationKey(id)];
  } catch (_error) {
    return undefined;
  }
};

const forgetNotificationTab = (id: string) => {
  notificationTabs.delete(id);
  void api.storage?.session?.remove(notificationKey(id)).catch(() => undefined);
};

api.notifications?.onClicked?.addListener((id: string) => {
  void findNotificationTab(id).then((target) => {
    if (!target) return;
    void api.tabs?.update(target.tabId, {active: true});
    if (target.windowId !== undefined) void api.windows?.update(target.windowId, {focused: true});
    void api.notifications.clear(id);
  });
});
api.notifications?.onClosed?.addListener((id: string) => forgetNotificationTab(id));

api.runtime.onMessage.addListener(
  (request: {query?: string; resource?: string; id?: string; text?: string}, _sender: unknown, sendResponse: (payload: unknown) => void) => {
    if (request.query === 'backup-file') {
      if (typeof request.text !== 'string') return undefined;
      saveBackup(request.text).then(sendResponse, () => sendResponse(false));
      return true;
    }

    // Live search alert, when the trade tab is in the background.
    if (request.query === 'notify') {
      const {title, message} = request as {title?: unknown; message?: unknown};
      if (typeof title !== 'string' || typeof message !== 'string' || !api.notifications?.create) return undefined;
      api.notifications
        .create({type: 'basic', iconUrl: api.runtime.getURL('assets/icon128.png'), title: title.slice(0, 100), message: message.slice(0, 200)})
        .then((id: string) => {
          const tab = (_sender as {tab?: {id?: number; windowId?: number}}).tab;
          if (tab?.id !== undefined) rememberNotificationTab(id, {tabId: tab.id, windowId: tab.windowId});
          sendResponse(true);
        }, () => sendResponse(false));
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
