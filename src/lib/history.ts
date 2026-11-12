import {storage} from './ext';
import {emit, on, uniqueId} from './util';
import {recommendTitle} from './search-panel';
import {isOwnSearchClick} from '../features/next-page';
import {currentLocation, sameLocation, type TradeLocation, type TradeSiteVersion} from './trade-location';

export interface HistoryEntry {
  id: string;
  title: string; // what was searched: item name, or category and rarity
  createdAt: string;
  version: TradeSiteVersion;
  type: string;
  league: string;
  slug: string;
}

const HISTORY_KEY = 'trade-history';
const MAXIMUM_LENGTH = 50;
const SEARCH_WAIT_MS = 10000;
const CHECK_INTERVAL_MS = 100;

export const fetchHistory = async (): Promise<HistoryEntry[]> =>
  ((await storage.get<HistoryEntry[]>(HISTORY_KEY)) || []).map((entry) => ({...entry, version: entry.version || '1'}));

export const clearHistory = async (): Promise<void> => {
  await storage.remove(HISTORY_KEY);
  emit('history-change');
};

export const logLocation = async (location: TradeLocation): Promise<void> => {
  const {version, type, league, slug} = location;
  if (!type || !league || !slug) return;

  const entries = await fetchHistory();
  if (entries[0] && sameLocation(location, entries[0])) return;

  entries.unshift({
    id: uniqueId(),
    title: recommendTitle(),
    createdAt: new Date().toISOString(),
    version,
    type,
    league,
    slug,
  });
  entries.splice(MAXIMUM_LENGTH);

  await storage.set(HISTORY_KEY, entries);
  emit('history-change');
};

// History only records searches you run yourself: pressing the Search button,
// or Enter in the search form. Opening a bookmark, a History entry or a link,
// reloading the page, and the extension's own Next 100 are not recorded.
//
// The search is recorded as soon as the site shows it: either the address
// changes to the new search, or (for a search with the same address as before)
// the new results appear.
export const setupHistory = (): void => {
  let waiting: {since: number; from: string} | null = null;

  const record = () => {
    if (!waiting) return;
    waiting = null;
    void logLocation(currentLocation());
  };

  const searched = () => {
    if (isOwnSearchClick) return;

    const started = {since: Date.now(), from: window.location.pathname};
    waiting = started;

    // Watch the address closely right after a search.
    const check = () => {
      if (waiting !== started) return;
      if (window.location.pathname !== started.from) return record();
      if (Date.now() - started.since > SEARCH_WAIT_MS) return record(); // safety net
      window.setTimeout(check, CHECK_INTERVAL_MS);
    };
    window.setTimeout(check, CHECK_INTERVAL_MS);
  };

  document.addEventListener('click', (event) => {
    if ((event.target as Element | null)?.closest?.('.controls .search-btn')) searched();
  }, true);

  document.addEventListener('keydown', (event) => {
    const target = event.target as Element | null;
    if (event.key === 'Enter' && target?.closest?.('.search-panel') && target.matches('input')) searched();
  }, true);

  on('location-change', record);
  on('new-results', record);
};
