// Price summary: above the results, the lowest, median and highest price of the listings
// loaded on the page (those the result filter hides are left out). Prices in different
// currencies are compared in Chaos with poe.ninja's rates (PoE 1). Without rates (PoE 2),
// it only shows when every listing uses the same currency.

import {parseItem} from '../enhancers/item';
import {onPageChange} from '../lib/page-watch';
import {fetchChaosRatios, type ChaosRatios} from '../lib/poe-ninja';
import {isEnabled} from '../lib/settings';
import {currentLocation} from '../lib/trade-location';
import {on} from '../lib/util';

const SUMMARY_CLASS = 'bt-price-summary';
const ROWS = '.resultset > div.row[data-id]:not(.bt-mod-filter-hidden)';

interface Price {
  value: number; // in Chaos, or in the shared currency when there are no rates
}

let ratios: ChaosRatios | null = null;
let ratiosLeague = '';

const median = (sorted: number[]) => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const round = (value: number) => (value >= 100 ? Math.round(value) : Math.round(value * 10) / 10);

// "12 c", or "2.1 div" once it is worth a Divine or more.
const showChaos = (chaos: number) => {
  const divine = ratios?.['divine-orb'];
  return divine && chaos >= divine ? `${round(chaos / divine)} div` : `${round(chaos)} c`;
};

export const summaryText = (rows: Element[], rates: ChaosRatios | null): string | null => {
  const prices: Price[] = [];
  let currency: string | null = null;
  let sameCurrency = true;

  for (const row of rows) {
    const {price} = parseItem(row);
    if (!price.currencySlug || !price.value) continue;

    if (currency && currency !== price.currencySlug) sameCurrency = false;
    currency = currency || price.currencySlug;

    const rate = price.currencySlug === 'chaos-orb' ? 1 : rates?.[price.currencySlug];
    prices.push({value: rates ? (rate ? price.value * rate : NaN) : price.value});
  }

  const values = prices.map((price) => price.value).filter((value) => !isNaN(value)).sort((a, b) => a - b);
  if (values.length < 2) return null;

  if (rates) {
    return `${values.length} listings: lowest ${showChaos(values[0])} · median ${showChaos(median(values))} · highest ${showChaos(values[values.length - 1])}`;
  }
  if (!sameCurrency || !currency) return null;

  const name = rows[0].querySelector('[data-field="price"] .currency-text span')?.textContent?.trim() || currency;
  return `${values.length} listings: lowest ${round(values[0])} · median ${round(median(values))} · highest ${round(values[values.length - 1])} ${name}`;
};

const update = () => {
  const existing = document.querySelector<HTMLElement>(`.${SUMMARY_CLASS}`);
  if (!isEnabled('price-summary')) {
    existing?.remove();
    return;
  }

  const resultset = document.querySelector('.resultset');
  const rows = [...document.querySelectorAll(ROWS)];
  const isExchange = rows[0]?.classList.contains('exchange');

  const text = resultset && !isExchange ? summaryText(rows, ratios) : null;
  if (!text || !resultset) {
    existing?.remove();
    return;
  }

  const element = existing || document.createElement('div');
  element.className = SUMMARY_CLASS;
  // Only touch the page when something changed (the page watcher sees every change).
  if (element.textContent !== text) element.textContent = text;
  if (element.nextElementSibling !== resultset) resultset.before(element);
};

const loadRates = async () => {
  if (!isEnabled('price-summary')) return;
  const location = currentLocation();
  if (location.version !== '1' || !location.league) {
    ratios = null;
    return;
  }
  if (ratiosLeague === location.league && ratios) return;
  ratiosLeague = location.league;
  ratios = await fetchChaosRatios(location.league);
  update();
};

export default function setupPriceSummary() {
  onPageChange(() => {
    void loadRates();
    update();
  });
  on('settings-change', () => {
    void loadRates();
    update();
  });
  on('mod-filter-query', () => window.setTimeout(update, 50));
  void loadRates();
}
