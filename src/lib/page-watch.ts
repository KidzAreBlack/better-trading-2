// One shared watcher for changes to the trade page (search form and results).
// Features register a callback; all of them run together once per frame, no
// matter how many changes the site made, instead of each feature keeping its
// own watcher over the whole page.

type Listener = () => void;

const listeners: Listener[] = [];
let isScheduled = false;

const run = () => {
  if (!isScheduled) return;
  isScheduled = false;
  listeners.forEach((listener) => listener());
};

const schedule = () => {
  if (isScheduled) return;
  isScheduled = true;

  // Normally on the next frame; the timer covers moments when the browser is not drawing frames.
  window.requestAnimationFrame(run);
  window.setTimeout(run, 100);
};

let observer: MutationObserver | null = null;

export const onPageChange = (listener: Listener): void => {
  listeners.push(listener);
  if (observer) return;

  const trade = document.getElementById('trade');
  if (!trade) return;

  // The top-level wrapper of the trade page, so results added next to the search form are seen too.
  let root: HTMLElement = trade;
  while (root.parentElement && root.parentElement !== document.body) root = root.parentElement;

  observer = new MutationObserver(schedule);
  observer.observe(root, {childList: true, subtree: true, characterData: true});
};
