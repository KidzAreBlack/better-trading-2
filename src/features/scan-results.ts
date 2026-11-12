// "Scan more results": loads many more search results onto the page by
// repeatedly triggering the trade site's own "Load More", at a gentle pace.
// The mod filter (mod-filter.ts) then hides what doesn't match.
//
// It deliberately uses the site's own loading instead of calling the trade API
// directly, and pauses between loads, to stay within the site's rate limits.

import {sleep} from '../lib/util';

const RESULT_ROWS_SELECTOR = '.resultset > div.row[data-id]';
const PAUSE_BETWEEN_LOADS_MS = 1500;
const LOAD_TIMEOUT_MS = 10000;
const POLL_INTERVAL_MS = 200;
const BUTTON_TIMEOUT_MS = 2000;

export interface ScanProgress {
  loaded: number; // results loaded by this scan so far
  target: number;
  isRunning: boolean;
  stoppedEarly: boolean; // true when the site had nothing more to load (or stopped responding)
}

let isRunning = false;
let stopRequested = false;

const countRows = () => document.querySelectorAll(RESULT_ROWS_SELECTOR).length;

const findLoadMoreButton = (): HTMLButtonElement | null => {
  const button = document.querySelector('.load-more-btn') as HTMLButtonElement | null;

  return button && !button.disabled ? button : null;
};

// The button is missing while a load is in progress, and gone for good once
// every result of the search (max 100) is on the page.
const waitForLoadMoreButton = async () => {
  const deadline = Date.now() + BUTTON_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const button = findLoadMoreButton();
    if (button || stopRequested) return button;
    await sleep(POLL_INTERVAL_MS);
  }

  return null;
};

const waitForMoreRows = async (previousCount: number) => {
  const deadline = Date.now() + LOAD_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (stopRequested) return false;
    if (countRows() > previousCount) return true;
    await sleep(POLL_INTERVAL_MS);
  }

  return false;
};

export const stopScan = () => {
  stopRequested = true;
};

export const scanMoreResults = async (target: number, onProgress: (progress: ScanProgress) => void) => {
  if (isRunning) return;

  isRunning = true;
  stopRequested = false;

  const initialScroll = window.scrollY;
  const initialCount = countRows();
  let stoppedEarly = false;

  const report = (running: boolean) =>
    onProgress({loaded: countRows() - initialCount, target, isRunning: running, stoppedEarly});

  report(true);

  try {
    while (!stopRequested && countRows() - initialCount < target) {
      const previousCount = countRows();

      const button = await waitForLoadMoreButton();
      if (button) button.click();

      const gotMore = button ? await waitForMoreRows(previousCount) : false;
      report(true);

      if (!gotMore) {
        stoppedEarly = !stopRequested;
        break;
      }

      await sleep(PAUSE_BETWEEN_LOADS_MS);
    }
  } finally {
    isRunning = false;
    window.scrollTo(0, initialScroll);
    report(false);
  }
};
