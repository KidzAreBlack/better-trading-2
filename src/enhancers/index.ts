// Improvements added to each search result on the trade page: equivalent
// prices, highlighted stats, socket warning, grouping of identical listings
// the Pin button and the Plus / Minus buttons on each mod.

import {fetchChaosRatios, type ChaosRatios} from '../lib/poe-ninja';
import {getStats} from '../lib/search-panel';
import {isEnabled} from '../lib/settings';
import {currentLocation} from '../lib/trade-location';
import {onPageChange} from '../lib/page-watch';
import {emit, escapeRegex, on} from '../lib/util';
import {parseItem, type ParsedItem} from './item';
import {addModButtons, setupModButtons} from './mod-buttons';

const UNENHANCED_ROWS = '.resultset > div.row[data-id]:not([bt-enhanced])';

const span = (className: string) => {
  const element = document.createElement('span');
  element.className = className;

  return element;
};

const image = (src: string, alt: string) => {
  const element = document.createElement('img');
  element.src = src;
  element.alt = alt;

  return element;
};

// ---- Equivalent prices (PoE 1, needs poe.ninja rates) -------------------------

const CHAOS_IMAGE = 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyRerollRare.png';
const DIVINE_IMAGE = 'https://web.poecdn.com/image/Art/2DItems/Currency/CurrencyModValues.png';

const equivalence = (className: string, parts: (string | HTMLElement)[]) => {
  const element = span(`bt-equivalent-pricings ${className}`);
  const inner = document.createElement('span');
  const equals = span('bt-equivalent-pricings-equals');
  equals.textContent = '=';
  inner.append(equals, ...parts);
  element.append(inner);

  return element;
};

const addEquivalentPricing = (row: Element, {price}: ParsedItem, ratios: ChaosRatios) => {
  const container = row.querySelector('.price');
  const currencyImage = row.querySelector<HTMLImageElement>('[data-field="price"] .currency-image img');
  if (!container || !currencyImage || !price.currencySlug || !price.value) return;

  const chaosValue = ratios[price.currencySlug];
  const divineValue = ratios['divine-orb'];

  if (chaosValue) {
    const total = Math.round(price.value * chaosValue);
    if (!total) return;

    container.append(equivalence('bt-equivalent-pricings-equivalent', [`${total}×`, image(CHAOS_IMAGE, 'chaos')]));

    const whole = Math.floor(price.value);
    if (whole === 0 || chaosValue < 1 || whole === price.value) return;

    const fraction = Math.round((price.value - whole) * chaosValue);
    container.append(
      equivalence('bt-equivalent-pricings-chaos-fraction', [
        `${whole}×`,
        image(currencyImage.src, currencyImage.alt),
        `+${fraction}×`,
        image(CHAOS_IMAGE, 'chaos'),
      ])
    );
  } else if (price.currencySlug === 'chaos-orb' && divineValue && price.value >= 0.5 * divineValue) {
    const divines = Math.round((price.value / divineValue) * 10) / 10;
    container.append(equivalence('bt-equivalent-pricings-equivalent', [`${divines}×`, image(DIVINE_IMAGE, 'divine')]));
  }
};

// ---- Highlight the stats you searched for -------------------------------------

const highlightStats = (row: Element, needles: RegExp[]) => {
  if (!needles.length) return;

  row.querySelectorAll('.item-mod').forEach((mod) => {
    const text = (mod.querySelector('[data-field^="stat."]') || mod).textContent || '';
    if (needles.some((needle) => needle.test(text))) mod.classList.add('bt-highlight-stat-filters');
  });
};

// ---- Socket warning (PoE 1 body armours) --------------------------------------

const SOCKET_THRESHOLDS = [
  {maxSockets: 2, ilvl: 1},
  {maxSockets: 3, ilvl: 24},
  {maxSockets: 4, ilvl: 34},
  {maxSockets: 5, ilvl: 49},
];

const addSocketWarning = (row: Element, {socketsCount, isBodyArmour, ilvl}: ParsedItem) => {
  const frame = row.querySelector('.item-popup');
  if (!frame || !ilvl || socketsCount === 0 || !isBodyArmour) return;

  const threshold = SOCKET_THRESHOLDS.find((candidate) => ilvl <= candidate.ilvl);
  if (!threshold || threshold.maxSockets <= socketsCount) return;

  const warning = document.createElement('div');
  warning.className = 'bt-maximum-sockets';
  warning.textContent = `Max. ${threshold.maxSockets} sockets`;
  frame.prepend(warning);
};

// ---- Group identical listings from the same seller ----------------------------

const itemHash = (row: Element) => {
  const seller = row.querySelector('.profile-link [href]')?.getAttribute('href') || '';
  const name = (row.querySelector('.item-popup__header')?.textContent || '').replace(/superior/i, '');
  const price = row.querySelector('[data-field="price"]')?.textContent || '';

  return [seller, name, price].join('|').replace(/\s/g, '').toLowerCase();
};

const firstOfGroup = (row: Element, hash: string): Element => {
  const previous = row.previousElementSibling;
  if (!previous || previous.getAttribute('bt-regroup-hash') !== hash) return row;

  return firstOfGroup(previous, hash);
};

const setGroupState = (first: Element, hash: string, state: string) => {
  for (let next = first.nextElementSibling; next && next.getAttribute('bt-regroup-hash') === hash; next = next.nextElementSibling) {
    next.setAttribute('bt-regroup-state', state);
  }
};

const regroupSimilar = (row: Element) => {
  const hash = itemHash(row);
  row.setAttribute('bt-regroup-hash', hash);

  const first = firstOfGroup(row, hash);
  if (first === row) return;

  let button = first.querySelector<HTMLButtonElement>('.bt-group-button');
  if (!button) {
    button = document.createElement('button');
    button.className = 'btn btn-default bt-group-button';
    button.type = 'button';
    button.dataset.state = 'hidden';
    button.dataset.count = '0';
    const groupButton = button;
    button.addEventListener('click', () => {
      groupButton.dataset.state = groupButton.dataset.state === 'hidden' ? 'visible' : 'hidden';
      setGroupState(first, hash, groupButton.dataset.state);
    });
    first.querySelector('.details .btns')?.append(button);
  }

  const count = parseInt(button.dataset.count || '0', 10) + 1;
  button.dataset.count = String(count);
  button.textContent = count === 1 ? '1 similar result' : `${count} similar results`;
  row.setAttribute('bt-regroup-state', button.dataset.state || 'hidden');
};

// ---- Pinned items --------------------------------------------------------------

export interface PinnedItem {
  id: string;
  pinnedAt: string;
  detailsElement: HTMLElement;
  renderedItemElement: HTMLElement | null;
  pricingElement: HTMLElement | null;
}

const pinnedItems = new Map<string, PinnedItem>();

export const getPinnedItems = (): PinnedItem[] =>
  Array.from(pinnedItems.values()).sort((a, b) => new Date(a.pinnedAt).getTime() - new Date(b.pinnedAt).getTime());

const pinsChanged = () => {
  document.querySelectorAll<HTMLElement>('.resultset > div.row[data-id]').forEach((row) => {
    row.classList.toggle('bt-pinned', pinnedItems.has(row.dataset.id || ''));
  });
  emit('pinned-change');
};

export const unpinItem = (id: string): void => {
  pinnedItems.delete(id);
  pinsChanged();
};

export const clearPinnedItems = (): void => {
  if (!pinnedItems.size) return;
  pinnedItems.clear();
  pinsChanged();
};

const togglePin = (row: HTMLElement) => {
  const id = row.dataset.id;
  if (!id) return;

  if (pinnedItems.has(id)) {
    pinnedItems.delete(id);
  } else {
    const details = row.querySelector('.middle');
    if (!details) return;

    const clone = (element: Element | null) => {
      if (!element) return null;

      const copy = element.cloneNode(true) as HTMLElement;
      // Buttons added to results by extensions make no sense on a copy.
      copy.querySelectorAll('button').forEach((button) => button.remove());

      return copy;
    };

    pinnedItems.set(id, {
      id,
      pinnedAt: new Date().toISOString(),
      detailsElement: clone(details) as HTMLElement,
      renderedItemElement: clone(row.querySelector('.left .newItemContainer')),
      pricingElement: clone(row.querySelector('.details .price')),
    });
  }

  pinsChanged();
};

const addPinButton = (row: HTMLElement) => {
  const buttons = row.querySelector('.details .btns');
  if (!buttons || buttons.querySelector('.bt-pin-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-default bt-pin-button';
  const pin = span('bt-pin-button-unpinned');
  pin.textContent = 'Pin';
  const unpin = span('bt-pin-button-pinned');
  unpin.textContent = 'Unpin';
  button.append(pin, unpin);
  button.addEventListener('click', () => togglePin(row));

  const wrapper = document.createElement('span');
  wrapper.append(button);
  buttons.append(wrapper);
};

// ---- Running the enhancers on new results -------------------------------------

let isRunning = false;
let runAgain = false;

const enhanceNewRows = async () => {
  if (isRunning) {
    runAgain = true;

    return;
  }
  isRunning = true;

  try {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(UNENHANCED_ROWS));

    if (!rows.length) {
      // A new search empties the list: pinned items belong to the previous results.
      if (!document.querySelector('.resultset > div.row')) clearPinnedItems();

      return;
    }
    if (rows[0].classList.contains('exchange')) return;

    const location = currentLocation();
    const ratios =
      isEnabled('equivalent-pricings') && location.version === '1' && location.league
        ? await fetchChaosRatios(location.league)
        : null;
    const needles = isEnabled('highlight-stat-filters')
      ? getStats().map((stat) => new RegExp(escapeRegex(stat).replace(/#/g, '[\\+\\-]?[\\d.]+'), 'i'))
      : [];

    rows.forEach((row) => {
      if (row.hasAttribute('bt-enhanced')) return;
      row.setAttribute('bt-enhanced', '');

      const item = parseItem(row);
      if (ratios) addEquivalentPricing(row, item, ratios);
      highlightStats(row, needles);
      if (isEnabled('maximum-sockets') && location.version === '1') addSocketWarning(row, item);
      if (isEnabled('regroup-similars')) regroupSimilar(row);
      addPinButton(row);
      addModButtons(row);
    });
  } finally {
    isRunning = false;

    if (runAgain) {
      runAgain = false;
      void enhanceNewRows();
    }
  }
};

// The result extras that a setting turns on or off. When one of them changes, results
// already on the page are redone, so the change shows at once.
const RESULT_SETTINGS = ['highlight-stat-filters', 'equivalent-pricings', 'maximum-sockets', 'regroup-similars'] as const;
const resultSettingsState = () => RESULT_SETTINGS.map((key) => isEnabled(key)).join();

const redoAllRows = () => {
  document.querySelectorAll('.bt-equivalent-pricings, .bt-maximum-sockets, .bt-group-button').forEach((element) => element.remove());
  document.querySelectorAll('.bt-highlight-stat-filters').forEach((element) => element.classList.remove('bt-highlight-stat-filters'));
  document.querySelectorAll('.resultset > div.row[bt-enhanced]').forEach((row) => {
    row.removeAttribute('bt-enhanced');
    row.removeAttribute('bt-regroup-hash');
    row.removeAttribute('bt-regroup-state');
  });
  void enhanceNewRows();
};

export const setupEnhancers = (): void => {
  setupModButtons();

  let lastState = resultSettingsState();
  on('settings-change', () => {
    const state = resultSettingsState();
    if (state === lastState) return;
    lastState = state;
    redoAllRows();
  });
  onPageChange(() => void enhanceNewRows());
  void enhanceNewRows();
};
