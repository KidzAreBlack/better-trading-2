// Tier picker: adds a "T" button to each stat filter row of the search. It
// opens a list of that mod's tiers (name, item level, roll range) for the
// selected Item Category; clicking a tier puts its lowest roll in the "min" box.
//
// The tier table (assets/data/poe1-tiers.json) is generated from RePoE game data by
// scripts/build-tier-data.py. Path of Exile 1 only for now.

import {assetUrl} from '../lib/ext';
import {onPageChange} from '../lib/page-watch';
import {isAdvancedFilteringOn, isEnabled} from '../lib/settings';
import {getModFilterQuery, setModFilterQuery} from './mod-filter';
import {on, setInputValue} from '../lib/util';

type Tier = [string, number, number, number, string?]; // name, item level, lowest, highest, display

interface Family {
  g: string; // 'p' prefix or 's' suffix
  h: number; // 1 when the mod is a hybrid (has more than one stat line)
  w: number[]; // indexes into variants
  t: Tier[];
}

interface TierData {
  variants: [string, string, string][]; // item class, sub type (armour kind), influence
  stats: {[text: string]: Family[]};
}

// The tier table is about 0.2 MB, so it is only loaded once Tier search is used.
let DATA: TierData = {variants: [], stats: {}};
let dataState: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';

const loadData = () => {
  if (dataState !== 'idle') return;
  dataState = 'loading';

  fetch(assetUrl('data/poe1-tiers.json'))
    .then((response) => response.json())
    .then((data: TierData) => {
      DATA = data;
      dataState = 'ready';
      scheduleRefresh();
    })
    .catch(() => {
      dataState = 'failed';
    });
};
const BUTTON_CLASS = 'bt-tier-button';
const POPUP_ID = 'bt-tier-popup';
const CATEGORY_INPUT_SELECTOR =
  '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(1) input';
const SKIPPED_MUTATE_TYPES = /pseudo|implicit|enchant|crafted|scourge|veiled|monster|delve|ultimatum|sanctum/i;

let scheduled = false;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s*\(local\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const isSupportedSite = () => !/^\/trade2/.test(window.location.pathname);

// ---- Reading the page -------------------------------------------------------

export const readStatText = (row: Element): string | null => {
  const title = row.querySelector('.filter-title');
  if (!title) return null;

  const mutateType = title.querySelector('.mutate-type');
  if (mutateType && SKIPPED_MUTATE_TYPES.test(mutateType.textContent || '')) return null;

  const clone = title.cloneNode(true) as Element;
  clone.querySelectorAll(`.mutate-type, .${BUTTON_CLASS}`).forEach((element) => element.remove());

  return normalize(clone.textContent || '');
};

export const readCategory = (): string => {
  const input = document.querySelector(CATEGORY_INPUT_SELECTOR) as HTMLInputElement | null;
  const value = input ? input.value || '' : '';

  return value
    .toLowerCase()
    .replace(/^any\s+/, '')
    .trim();
};

// ---- Looking up tiers --------------------------------------------------------

export interface TierSection {
  label: string;
  kind: string; // 'p' prefix or 's' suffix
  tiers: Tier[];
}

const variantLabel = ([itemClass, sub, influence]: [string, string, string], withClass: boolean) =>
  [withClass ? itemClass : '', sub, influence ? `(${influence})` : ''].filter(Boolean).join(' ');

const summarize = (labels: string[]) => {
  const unique = labels.filter((label, index) => label && labels.indexOf(label) === index);
  if (unique.length <= 3) return unique.join(', ');

  return `${unique.slice(0, 3).join(', ')} +${unique.length - 3}`;
};

export const findSections = (statText: string, category: string): TierSection[] => {
  const families = DATA.stats[statText];
  if (!families) return [];

  const categoryMatches = (itemClass: string) => {
    const name = itemClass.toLowerCase();

    return name === category || name === `base ${category}` || name.replace(/-handed/, ' hand') === category;
  };
  const categoryIsKnown = Boolean(category) && DATA.variants.some(([itemClass]) => categoryMatches(itemClass));

  const sections: {section: TierSection; order: number}[] = [];

  families.forEach((family) => {
    const variants = family.w
      .map((index) => DATA.variants[index])
      .filter(([itemClass]) => !categoryIsKnown || categoryMatches(itemClass));
    if (!variants.length) return;

    const kind = family.g === 'p' ? 'Prefix' : 'Suffix';
    // When the mod rolls on every kind of the selected category, the category name alone is enough.
    const plainKinds = DATA.variants.filter(([itemClass, , influence]) => categoryMatches(itemClass) && !influence);
    const coversWholeCategory =
      categoryIsKnown && variants.length === plainKinds.length && variants.every(([, , influence]) => !influence);
    const where = coversWholeCategory
      ? ''
      : summarize(variants.map((variant) => variantLabel(variant, !categoryIsKnown)));
    const itemClass = categoryIsKnown ? variants[0][0] : '';
    const label = [kind, [itemClass, where].filter(Boolean).join(' '), family.h ? 'hybrid mod' : '']
      .filter(Boolean)
      .join(' · ');
    const isInfluenced = variants.every(([, , influence]) => Boolean(influence));

    sections.push({section: {label, kind: family.g, tiers: family.t}, order: (isInfluenced ? 2 : 0) + (family.h ? 1 : 0)});
  });

  return sections.sort((a, b) => a.order - b.order).map(({section}) => section);
};

// ---- Link with the sidebar's result filter ----------------------------------
//
// Picking a tier also adds a matching term to the "Filter results by mod tier /
// name" box (e.g. "increased spell damage p2+"), so loaded results are filtered
// to that mod at that tier or better. The two stay in step:
// - emptying the filter box clears the min values the picker filled in;
// - changing or clearing a min box (or removing the stat filter) drops its term.

interface TierLink {
  minInput: HTMLInputElement;
  value: string;
  term: string;
  tier: number;
}

const links = new Map<string, TierLink>();
let isSyncingLinks = false;

const queryParts = (query: string) =>
  query
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

export const resultFilterTerm = (statText: string, kind: string, tier: number): string => {
  const words = statText
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(' ')
    .filter(Boolean);

  return [...words, `${kind}${tier}${tier > 1 ? '+' : ''}`].join(' ');
};

const removeTerm = (term: string) => {
  const parts = queryParts(getModFilterQuery());
  const index = parts.indexOf(term);
  if (index === -1) return;

  parts.splice(index, 1);
  setModFilterQuery(parts.join(', '));
};

const unlink = (statText: string, options: {clearMin?: boolean; keepTerm?: boolean} = {}) => {
  const link = links.get(statText);
  if (!link) return;

  links.delete(statText);
  scheduleRefresh(); // update the "T2" on its button
  if (!options.keepTerm) removeTerm(link.term);
  if (options.clearMin && link.minInput.isConnected && link.minInput.value === link.value) setInputValue(link.minInput, '');
};

const linkToResultFilter = (statText: string, minInput: HTMLInputElement, kind: string, tier: number) => {
  isSyncingLinks = true;

  try {
    unlink(statText);

    const term = resultFilterTerm(statText, kind, tier);
    links.set(statText, {minInput, value: minInput.value, term, tier});

    const parts = queryParts(getModFilterQuery());
    if (!parts.includes(term)) setModFilterQuery([...parts, term].join(', '));
  } finally {
    isSyncingLinks = false;
  }
};

// The filter text changed (typed in the sidebar, or cleared).
const syncLinksWithQuery = () => {
  if (isSyncingLinks || !links.size) return;
  isSyncingLinks = true;

  try {
    const parts = queryParts(getModFilterQuery());
    const isEmptied = parts.length === 0;

    Array.from(links.entries()).forEach(([statText, link]) => {
      if (!parts.includes(link.term)) unlink(statText, {clearMin: isEmptied, keepTerm: true});
    });
  } finally {
    isSyncingLinks = false;
  }
};

// A min box changed, or its stat filter was removed from the search.
const syncLinksWithPage = () => {
  if (isSyncingLinks || !links.size) return;
  isSyncingLinks = true;

  try {
    Array.from(links.entries()).forEach(([statText, link]) => {
      // The site may redraw its filters; find the same stat filter again before giving up.
      if (!link.minInput.isConnected) {
        const row = Array.from(document.querySelectorAll('.filter-group-body .filter')).find(
          (candidate) => readStatText(candidate) === statText
        );
        const minInput = row ? (row.querySelector('input.minmax') as HTMLInputElement | null) : null;
        if (minInput) link.minInput = minInput;
      }

      if (!link.minInput.isConnected || link.minInput.value !== link.value) unlink(statText);
    });
  } finally {
    isSyncingLinks = false;
  }
};

// ---- Popup ----------------------------------------------------------------

const formatNumber = (value: number) => String(Math.round(value * 100) / 100);

const closePopup = () => {
  const popup = document.getElementById(POPUP_ID);
  if (popup) popup.remove();

  document.removeEventListener('mousedown', handleOutsideClick, true);
  document.removeEventListener('keydown', handleKeydown, true);
};

function handleOutsideClick(event: Event) {
  const popup = document.getElementById(POPUP_ID);
  const target = event.target as Element | null;
  if (popup && target && (popup.contains(target) || target.closest(`.${BUTTON_CLASS}`))) return;

  closePopup();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closePopup();
}

const element = (tag: string, className: string, text?: string) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;

  return node;
};

const openPopup = (button: HTMLElement, row: Element) => {
  const alreadyOpenForThisRow = button.classList.contains('is-open');

  closePopup();
  document.querySelectorAll(`.${BUTTON_CLASS}.is-open`).forEach((other) => other.classList.remove('is-open'));
  if (alreadyOpenForThisRow) return;

  const statText = readStatText(row);
  const minInput = row.querySelector('input.minmax') as HTMLInputElement | null;
  if (!statText || !minInput) return;

  const category = readCategory();
  const sections = findSections(statText, category);
  const titleElement = row.querySelector('.filter-title');

  const popup = element('div', 'bt-tier-popup');
  popup.id = POPUP_ID;
  popup.appendChild(
    element('div', 'bt-tier-popup-title', `Tier picker · ${titleElement ? (titleElement.textContent || '').trim() : ''}`)
  );

  if (!sections.length) {
    popup.appendChild(element('div', 'bt-tier-popup-note', 'No tiers found for this mod on the selected Item Category.'));
  }

  sections.forEach(({label, kind, tiers}) => {
    popup.appendChild(element('div', 'bt-tier-popup-section', label));

    tiers.forEach(([name, itemLevel, lowest, highest, display], index) => {
      const tierRow = element('button', 'bt-tier-popup-row');
      tierRow.setAttribute('type', 'button');
      tierRow.title = `Set min to ${formatNumber(lowest)}`;
      tierRow.appendChild(element('span', 'bt-tier-popup-tier', `T${index + 1}`));
      tierRow.appendChild(element('span', 'bt-tier-popup-name', name));
      tierRow.appendChild(element('span', 'bt-tier-popup-ilvl', `ilvl ${itemLevel}`));
      tierRow.appendChild(
        element('span', 'bt-tier-popup-range', display || `${formatNumber(lowest)}–${formatNumber(highest)}`)
      );
      tierRow.addEventListener('click', () => {
        setInputValue(minInput, formatNumber(lowest));
        if (isAdvancedFilteringOn()) linkToResultFilter(statText, minInput, kind, index + 1);
        closePopup();
        button.classList.remove('is-open');
        showSelectedTier(button, statText);
      });

      popup.appendChild(tierRow);
    });
  });

  if (sections.length && !DATA.variants.some(([itemClass]) => itemClass.toLowerCase().includes(category) && category)) {
    popup.appendChild(
      element('div', 'bt-tier-popup-note', 'Pick an Item Category (e.g. Staff) to see only the tiers for that item type.')
    );
  }

  document.body.appendChild(popup);
  button.classList.add('is-open');

  // Place it under the button, kept inside the window.
  const rect = button.getBoundingClientRect();
  const width = popup.offsetWidth;
  const left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom - 16;
  popup.style.left = `${left}px`;
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.maxHeight = `${Math.max(200, spaceBelow)}px`;
  if (spaceBelow < 200) popup.style.top = `${Math.max(8, window.innerHeight - 216)}px`;

  document.addEventListener('mousedown', handleOutsideClick, true);
  document.addEventListener('keydown', handleKeydown, true);
};

// ---- Buttons on the stat filter rows ---------------------------------------

const refreshButtons = () => {
  scheduled = false;
  syncLinksWithPage();

  if (!isEnabled('tier-search') || !isSupportedSite()) {
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach((button) => button.remove());
    closePopup();

    return;
  }

  if (dataState !== 'ready') return loadData();

  document.querySelectorAll('.filter-group-body .filter').forEach((row) => {
    const minInput = row.querySelector('input.minmax');
    const existing = row.querySelector(`.${BUTTON_CLASS}`);
    const statText = minInput ? readStatText(row) : null;
    const hasTiers = Boolean(statText && DATA.stats[statText]);

    if (!hasTiers) {
      if (existing) existing.remove();

      return;
    }

    if (existing || !minInput) {
      if (existing && statText) showSelectedTier(existing, statText);

      return;
    }

    const title = row.querySelector('.filter-title');
    if (!title) return;

    const button = element('button', BUTTON_CLASS, 'T ▾');
    button.setAttribute('type', 'button');
    button.title = 'Pick a mod tier';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openPopup(button, row);
    });

    // At the right end of the stat's name, so it sits on the same line, just before the min box.
    title.classList.add('bt-has-tier-button');
    title.appendChild(button);
    if (statText) showSelectedTier(button, statText);
  });
};

// "T2 ▾" once a tier was picked for this stat, "T ▾" otherwise.
const showSelectedTier = (button: Element, statText: string) => {
  const link = links.get(statText);
  const label = link ? `T${link.tier} ▾` : 'T ▾';
  if (button.textContent !== label) button.textContent = label;
  button.classList.toggle('has-tier', Boolean(link));
};

const scheduleRefresh = () => {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(refreshButtons);
};

export default function setupTierPicker() {
  onPageChange(scheduleRefresh);

  on('settings-change', scheduleRefresh);
  on('mod-filter-query', syncLinksWithQuery);
  document.addEventListener('input', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.classList.contains('minmax')) syncLinksWithPage();
  });
  scheduleRefresh();
}
