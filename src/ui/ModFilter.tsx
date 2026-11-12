import {useEffect, useRef, useState} from 'preact/hooks';
import {getModFilterQuery, onModFilterChange, setModFilterQuery} from '../features/mod-filter';
import {clickSearch, computeNextMin, findPriceFilter, getResultRows, readRowPrice, toFilterCurrency} from '../features/next-page';
import {scanMoreResults, stopScan} from '../features/scan-results';
import {fetchChaosRatios} from '../lib/poe-ninja';
import {currentLocation} from '../lib/trade-location';
import {on, setInputValue, sleep} from '../lib/util';

const MAX_RESULTS_PER_SEARCH = 100;
const SCAN_TARGET = 90; // 10 are shown first, 90 more can be loaded
const NEW_SEARCH_TIMEOUT_MS = 15000;
const AUTO_LOAD_DELAY_MS = 1500;

let originalMin: string | null = null;

// The "Tier search" box: filter loaded results by mod tier or name, load all
// results of a search, and move on to the next 100 by price.
export function ModFilter() {
  const [query, setQuery] = useState(getModFilterQuery());
  const [counts, setCounts] = useState({shown: 0, total: 0});
  const [isBusy, setIsBusy] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    onModFilterChange(setCounts);
    // The tier picker can fill in or clear the filter text too.
    const unsubscribe = on('mod-filter-query', () => setQuery(getModFilterQuery()));

    return () => {
      onModFilterChange(null);
      unsubscribe();
    };
  }, []);

  // With something in the filter box, a new search loads all of its results (max 100)
  // by itself, so the filter has the whole search to work on.
  const working = useRef(false);
  working.current = isBusy || isScanning;
  const autoLoad = useRef<() => void>(() => {});
  autoLoad.current = () => {
    if (working.current || !getModFilterQuery().trim() || currentLocation().isLive) return;
    void loadAll();
  };

  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = on('new-results', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => autoLoad.current(), AUTO_LOAD_DELAY_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  const updateQuery = (value: string) => {
    setQuery(value);
    setModFilterQuery(value);
  };

  const loadAll = async () => {
    setIsScanning(true);
    let last = {loaded: 0, stoppedEarly: false};

    await scanMoreResults(SCAN_TARGET, (progress) => {
      last = progress;
      if (progress.isRunning) setMessage(`Loading... ${progress.loaded} more so far`);
    });

    setIsScanning(false);
    setMessage(last.stoppedEarly || last.loaded >= SCAN_TARGET ? `Loaded ${last.loaded} more, that is all of them` : `Loaded ${last.loaded} more results`);
  };

  const searchAndLoad = async () => {
    const previousCount = getResultRows().length;
    const previousFirstId = getResultRows()[0]?.getAttribute('data-id') ?? null;

    await sleep(100);
    if (!clickSearch()) return;

    const deadline = Date.now() + NEW_SEARCH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(250);
      const rows = getResultRows();
      if (rows.length < previousCount || (rows.length && rows[0].getAttribute('data-id') !== previousFirstId)) break;
    }

    await sleep(1500);
    await loadAll();
  };

  const run = async (work: () => Promise<void>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await work();
    } finally {
      setIsBusy(false);
    }
  };

  const nextPage = () =>
    run(async () => {
      // Everything in the current 100 must be loaded first, or the unseen ones would be skipped.
      await loadAll();

      const rows = getResultRows();
      if (rows.length < MAX_RESULTS_PER_SEARCH) return setMessage('This search has no more results');

      const priceFilter = findPriceFilter();
      if (!priceFilter) return setMessage('Could not find the Buyout Price filter. Open "Show Filters" and tick Trade Filters, then try again');

      const firstPrice = readRowPrice(rows[0]);
      const lastPrice = readRowPrice(rows[rows.length - 1]);
      if (!firstPrice || !lastPrice) return setMessage('Could not read the price of the results');

      const location = currentLocation();
      const filterCurrency = priceFilter.select ? priceFilter.select.value || priceFilter.select.placeholder : '';
      const ratios = location.version === '1' && location.league ? await fetchChaosRatios(location.league) : null;
      const first = toFilterCurrency(firstPrice, filterCurrency, ratios);
      const last = toFilterCurrency(lastPrice, filterCurrency, ratios);
      if (!first || !last) return setMessage(`Could not convert ${lastPrice.currency} prices. Set the Buyout Price min by hand`);

      const currentMin = parseFloat(priceFilter.minInput.value);
      const {min, skippedSamePrice} = computeNextMin(first, last, isNaN(currentMin) ? null : currentMin);

      if (originalMin === null) originalMin = priceFilter.minInput.value;
      setInputValue(priceFilter.minInput, String(min));
      await searchAndLoad();

      setPage((current) => current + 1);
      setMessage(
        skippedSamePrice
          ? `too many items at the same price, skipped ahead to price ${min}`
          : `showing results from price ${min} and up`
      );
    });

  const backToStart = () =>
    run(async () => {
      const priceFilter = findPriceFilter();
      if (priceFilter) setInputValue(priceFilter.minInput, originalMin || '');

      originalMin = null;
      setPage(1);
      await searchAndLoad();
      setMessage('Back on the first 100 results');
    });

  const isActive = Boolean(query.trim());

  return (
    <div class="bt-mod-filter">
      <div class="bt-mod-filter-row">
        <input
          type="text"
          class={`bt-mod-filter-input ${isActive ? 'is-active' : ''}`}
          placeholder="Filter results by mod tier / name"
          value={query}
          onInput={(event) => updateQuery((event.target as HTMLInputElement).value)}
        />
        {isActive && (
          <button type="button" class="bt-mod-filter-button" title="Clear filter" onClick={() => updateQuery('')}>
            {'\u00d7'}
          </button>
        )}
        <button type="button" class="bt-mod-filter-button" title="How to use" onClick={() => setShowHelp(!showHelp)}>
          ?
        </button>
      </div>

      {isActive && (
        <div class="bt-mod-filter-status">
          Showing {counts.shown} of {counts.total} loaded results
        </div>
      )}

      <div class="bt-mod-filter-scan">
        {isScanning && !isBusy ? (
          <button type="button" class="bt-mod-filter-scan-button" onClick={() => stopScan()}>
            Stop scanning
          </button>
        ) : (
          <button type="button" class="bt-mod-filter-scan-button" disabled={isBusy || isScanning} onClick={() => void loadAll()}>
            Load all (max 100)
          </button>
        )}
        <button type="button" class="bt-mod-filter-scan-button" disabled={isBusy || isScanning} onClick={() => void nextPage()}>
          Next 100
        </button>
        {page > 1 && (
          <button type="button" class="bt-mod-filter-scan-button" disabled={isBusy || isScanning} title="Put the price filter back and search again" onClick={() => void backToStart()}>
            Back to start
          </button>
        )}
      </div>

      <div class="bt-mod-filter-scan-line">
        {message && (
          <span class="bt-mod-filter-scan-status">
            {page > 1 ? `Page ${page}: ` : ''}
            {message}
          </span>
        )}
      </div>

      {showHelp && (
        <div class="bt-mod-filter-help">
          <div><b>wizard</b> &mdash; mod name or text contains "wizard"</div>
          <div><b>p1</b> / <b>s1</b> &mdash; a tier 1 prefix / a tier 1 suffix</div>
          <div><b>t1</b> &mdash; a tier 1 prefix or suffix</div>
          <div><b>p3+</b> &mdash; a prefix of tier 3 or better</div>
          <div><b>spell damage p2</b> &mdash; one mod with "spell damage" that is P2</div>
          <div><b>wizard, s1</b> &mdash; use commas, the item must match every part</div>
          <div class="bt-mod-filter-help-note">Only filters results already loaded on the page. Use the scan button to load more.</div>
        </div>
      )}
    </div>
  );
}
