// Price on bookmarks: when a bookmarked search's results load, remember its lowest price and
// how many listings it has, to show under the bookmark next time (with ▲ / ▼ when the
// lowest price changed since the visit before).

import {parseItem} from '../enhancers/item';
import {fetchFolders, fetchTrades, findTradeByLocation} from '../lib/bookmarks';
import {storage} from '../lib/ext';
import {onPageChange} from '../lib/page-watch';
import {fetchChaosRatios, type ChaosRatios} from '../lib/poe-ninja';
import {isEnabled} from '../lib/settings';
import {currentLocation} from '../lib/trade-location';
import {emit, on} from '../lib/util';

const STATS_KEY = 'bookmark-stats';
const ROWS = '.resultset > div.row[data-id]';
const SETTLE_MS = 1500;

export interface BookmarkSnapshot {
  lowest: string | null; // "12 c", "1.5 div", "3 Exalted Orb"
  lowestChaos: number | null; // for comparing visits (PoE 1)
  count: number | null; // listings the search matched
  isCountExact: boolean; // false: only the loaded results were counted ("100+")
  at: string; // ISO date
}

export interface BookmarkStats {
  current: BookmarkSnapshot;
  previous: BookmarkSnapshot | null;
}

let cache: Record<string, BookmarkStats> | null = null;

export const fetchBookmarkStats = async (): Promise<Record<string, BookmarkStats>> => {
  cache = cache || (await storage.get<Record<string, BookmarkStats>>(STATS_KEY)) || {};
  return cache;
};

const round = (value: number) => (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);

const lowestOf = (rows: Element[], ratios: ChaosRatios | null): {text: string; chaos: number | null} | null => {
  let best: {text: string; chaos: number | null; value: number} | null = null;
  let currency: string | null = null;
  for (const row of rows) {
    const {price} = parseItem(row);
    if (!price.currencySlug || !price.value) continue;
    if (ratios) {
      const rate = price.currencySlug === 'chaos-orb' ? 1 : ratios[price.currencySlug];
      if (!rate) continue;
      const chaos = price.value * rate;
      if (!best || chaos < best.value) {
        const divine = ratios['divine-orb'];
        best = {text: divine && chaos >= divine ? `${round(chaos / divine)} div` : `${round(chaos)} c`, chaos, value: chaos};
      }
    } else {
      // Without rates (PoE 2), prices can only be compared in one currency.
      if (currency && currency !== price.currencySlug) return null;
      currency = price.currencySlug;
      if (!best || price.value < best.value) {
        const name = row.querySelector('[data-field="price"] .currency-text span')?.textContent?.trim() || currency;
        best = {text: `${round(price.value)} ${name}`, chaos: null, value: price.value};
      }
    }
  }
  return best && {text: best.text, chaos: best.chaos};
};

// The site's line above the results: "Showing 100 results (523 matched)", "Showing 32 results"
// when that's all of them, or "No results found". Otherwise, the results on the page.
const countOf = (rows: Element[]): {count: number; isCountExact: boolean} => {
  const header = document.querySelector('.results > .row-total')?.textContent || '';
  const found = /([\d,.]+)\s+matched/i.exec(header) || /showing\s+([\d,.]+)\s+results?/i.exec(header);
  const total = found ? parseInt(found[1].replace(/\D/g, ''), 10) : /no results/i.test(header) ? 0 : NaN;
  if (Number.isFinite(total)) return {count: total, isCountExact: true};
  const hasMore = Boolean(document.querySelector('.resultset .load-more-btn'));
  return {count: rows.length, isCountExact: !hasMore};
};

// Drops what was saved for bookmarks that no longer exist.
const withoutDeletedBookmarks = async (stats: Record<string, BookmarkStats>): Promise<Record<string, BookmarkStats>> => {
  const ids = new Set<string>();
  for (const folder of await fetchFolders()) {
    if (folder.id) (await fetchTrades(folder.id)).forEach((trade) => trade.id && ids.add(trade.id));
  }
  return Object.fromEntries(Object.entries(stats).filter(([id]) => ids.has(id)));
};

// Which bookmark the open search is (looked up once per search).
let lookup: {slug: string; tradeId: string | null} | null = null;
let recorded = '';
let timer: number | undefined;

const record = async () => {
  const location = currentLocation();
  if (!isEnabled('bookmark-prices') || location.type !== 'search' || !location.slug) return;
  const rows = [...document.querySelectorAll(ROWS)];
  if (rows[0]?.classList.contains('exchange')) return;
  // Results loaded, or the site saying there are none (a search with no listings is worth knowing too).
  if (!rows.length && !/no results/i.test(document.querySelector('.results > .row-total')?.textContent || '')) return;

  if (lookup?.slug !== location.slug) {
    const trade = await findTradeByLocation(location);
    lookup = {slug: location.slug, tradeId: trade?.id || null};
  }
  const {tradeId} = lookup;
  if (!tradeId) return;

  const ratios = location.version === '1' && location.league ? await fetchChaosRatios(location.league) : null;
  const lowest = lowestOf(rows, ratios);
  const {count, isCountExact} = countOf(rows);
  const signature = `${tradeId}|${lowest?.text}|${count}|${isCountExact}`;
  if (signature === recorded) return;
  recorded = signature;

  // Read again: another trade tab may have saved since.
  const stats = (await storage.get<Record<string, BookmarkStats>>(STATS_KEY)) || {};
  const before = stats[tradeId];
  const snapshot: BookmarkSnapshot = {lowest: lowest?.text || null, lowestChaos: lowest?.chaos ?? null, count, isCountExact, at: new Date().toISOString()};
  // The visit before this one is kept to show the change. Loading more of the same search
  // only updates this visit.
  const sameVisit = before && Date.now() - new Date(before.current.at).getTime() < 10 * 60 * 1000;
  stats[tradeId] = {current: snapshot, previous: sameVisit ? before.previous : before?.current || null};
  cache = await withoutDeletedBookmarks(stats);
  await storage.set(STATS_KEY, cache);
  emit('bookmark-stats-change');
};

const schedule = () => {
  if (!isEnabled('bookmark-prices')) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void record(), SETTLE_MS);
};

export default function setupBookmarkStats() {
  onPageChange(schedule);
  on('location-change', () => {
    recorded = '';
    schedule();
  });
  on('bookmarks-change', () => {
    lookup = null;
    recorded = '';
    schedule();
  });
  on('settings-change', schedule);
  // Coming back to this tab: pick up prices other trade tabs saved meanwhile.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    cache = null;
    emit('bookmark-stats-change');
  });
  schedule();
}
