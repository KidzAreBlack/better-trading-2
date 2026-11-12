import {slugify} from '../lib/util';

export interface ParsedItem {
  price: {currencySlug: string | null; value: number | null};
  socketsCount: number;
  isBodyArmour: boolean;
  ilvl: number | null;
}

// Icon addresses carry the item's art path, either in clear text or base64-encoded.
const iconPath = (src: string): string => {
  const encoded = src.match(/\/gen\/image\/([^/]+)\//);
  if (!encoded) return src;

  try {
    return atob(encoded[1].replace(/-/g, '+').replace(/_/g, '/'));
  } catch (_error) {
    return src;
  }
};

export const parseItem = (row: Element): ParsedItem => {
  const currencyName = row.querySelector('[data-field="price"] .currency-text span')?.textContent;
  const priceValue = row.querySelector('[data-field="price"] > br + span')?.textContent;
  const icon = row.querySelector<HTMLImageElement>('.icon img');
  const path = icon ? iconPath(icon.src) : '';
  const ilvlMatch = (row.querySelector('[data-field="ilvl"]')?.textContent || '').match(/(\d+)/);
  const value = priceValue ? parseFloat(priceValue.replace(/,/g, '')) : NaN;

  return {
    price: {currencySlug: currencyName ? slugify(currencyName) : null, value: isNaN(value) ? null : value},
    socketsCount: row.querySelectorAll('.sockets .socket').length,
    isBodyArmour: /\/BodyArmours\//.test(path),
    ilvl: ilvlMatch ? parseInt(ilvlMatch[1], 10) : null,
  };
};
