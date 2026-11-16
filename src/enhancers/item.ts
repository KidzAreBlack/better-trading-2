import {slugify} from '../lib/util';

export interface ParsedItem {
  price: {currencySlug: string | null; value: number | null};
}

// The listing's asking price, e.g. 5 × "chaos-orb".
export const parseItem = (row: Element): ParsedItem => {
  const currencyName = row.querySelector('[data-field="price"] .currency-text span')?.textContent;
  const priceValue = row.querySelector('[data-field="price"] > br + span')?.textContent;
  const value = priceValue ? parseFloat(priceValue.replace(/,/g, '')) : NaN;

  return {
    price: {currencySlug: currencyName ? slugify(currencyName) : null, value: isNaN(value) ? null : value},
  };
};
