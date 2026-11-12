// "Next 100": the trade site only shows 100 results per search. This moves to
// the next slice by setting the Buyout Price "min" filter to the price of the
// last loaded result and pressing the site's own Search button.
//
// Limits (they come from how the site works):
// - If more than 100 items share the exact same price, the rest of that price
//   can't be reached; we then step just above that price and say so.
// - Prices in another currency are converted with poe.ninja rates, so the
//   cut-off between pages can overlap by a few items.

const RESULT_ROWS_SELECTOR = '.resultset > div.row[data-id]';
const CONVERSION_SAFETY_MARGIN = 0.97;
const SAME_PRICE_STEP = 1.01;

export interface ChaosRatios {
  [currencySlug: string]: number;
}

export interface RowPrice {
  amount: number;
  currency: string; // e.g. "Chaos Orb"
}

export interface NextMin {
  min: number;
  skippedSamePrice: boolean; // true when a same-price pile-up forced us to step above it
}

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const roundUp2 = (value: number) => Math.ceil(value * 100) / 100;
const roundDown2 = (value: number) => Math.floor(value * 100) / 100;

export const getResultRows = () => Array.from(document.querySelectorAll(RESULT_ROWS_SELECTOR));

export const readRowPrice = (row: Element): RowPrice | null => {
  const priceElement = row.querySelector('[data-field="price"]');
  if (!priceElement) return null;

  let amount: number | null = null;
  Array.from(priceElement.children).forEach((child) => {
    if (amount !== null || child.tagName !== 'SPAN' || child.className) return;

    const parsed = parseFloat((child.textContent || '').replace(/,/g, ''));
    if (!isNaN(parsed)) amount = parsed;
  });

  const currencyTextElement = priceElement.querySelector('.currency-text > span');
  const currencyImageElement = priceElement.querySelector('.currency-text img');
  const currency =
    (currencyTextElement && currencyTextElement.textContent) ||
    (currencyImageElement && currencyImageElement.getAttribute('alt')) ||
    '';

  if (amount === null || !currency) return null;

  return {amount, currency: currency.trim()};
};

// The Buyout Price row: the only filter with both a dropdown and min/max boxes.
export const findPriceFilter = (): {select: HTMLInputElement | null; minInput: HTMLInputElement} | null => {
  const candidates = Array.from(document.querySelectorAll('.filter-group-body .filter')).filter(
    (filter) => filter.querySelector('.multiselect') && filter.querySelector('input.minmax')
  );
  if (!candidates.length) return null;

  const byTitle = candidates.find((filter) => {
    const title = filter.querySelector('.filter-title');

    return /price/i.test((title && title.textContent) || '');
  });
  const filter = byTitle || candidates[candidates.length - 1];

  const minInput = filter.querySelector('input.minmax') as HTMLInputElement | null;
  if (!minInput) return null;

  return {select: filter.querySelector('.multiselect__input') as HTMLInputElement | null, minInput};
};

// Converts a result's price to the currency of the price filter. Returns null when it can't.
export const toFilterCurrency = (
  price: RowPrice,
  filterCurrencyLabel: string,
  chaosRatios: ChaosRatios | null
): {value: number; converted: boolean} | null => {
  const baseCurrency = slug(filterCurrencyLabel.replace(/equivalent/i, ''));
  const priceCurrency = slug(price.currency);

  if (!baseCurrency || !priceCurrency) return null;

  // Same currency (also covers short names like "chaos" vs "chaos-orb").
  if (baseCurrency === priceCurrency || baseCurrency.startsWith(`${priceCurrency}-`)) {
    return {value: price.amount, converted: false};
  }

  if (baseCurrency === 'chaos-orb' && chaosRatios && chaosRatios[priceCurrency]) {
    return {value: price.amount * chaosRatios[priceCurrency], converted: true};
  }

  return null;
};

export const computeNextMin = (
  first: {value: number; converted: boolean},
  last: {value: number; converted: boolean},
  currentMin: number | null
): NextMin => {
  let candidate = last.converted ? roundDown2(last.value * CONVERSION_SAFETY_MARGIN) : last.value;

  // Must move forward, otherwise the same 100 results come back.
  const floor = Math.max(first.value, currentMin === null ? 0 : currentMin);
  if (candidate > floor) return {min: candidate, skippedSamePrice: false};

  if (last.value > floor) return {min: last.value, skippedSamePrice: false};

  candidate = roundUp2(Math.max(last.value, floor) * SAME_PRICE_STEP);

  return {min: candidate, skippedSamePrice: true};
};

export const clickSearch = () => {
  const button = document.querySelector('.controls .search-btn') as HTMLButtonElement | null;
  if (!button) return false;

  // Searches the extension runs itself (Next 100, Back to start) are not added to History.
  isOwnSearchClick = true;
  try {
    button.click();
  } finally {
    isOwnSearchClick = false;
  }

  return true;
};

export let isOwnSearchClick = false;
