import {isAdvancedFilteringOn, isEnabled} from '../lib/settings';
import {onPageChange} from '../lib/page-watch';
import {emit, on} from '../lib/util';

// Mod filter: hides search results (already loaded on the page) that don't
// have the mods you ask for, by mod tier and/or mod name.
//
// It reads the tier (e.g. "P1", "S2") and mod name (e.g. "Wizard's") that the
// trade site already includes with each result (the info shown on hover).
//
// Query syntax (not case sensitive):
//   wizard            a mod whose name or text contains "wizard"
//   p1                a tier 1 prefix          s2   a tier 2 suffix
//   t1                a tier 1 prefix OR suffix
//   p3+               a prefix of tier 3 or better (P1, P2 or P3)
//   spell damage p2   ONE mod that contains "spell damage" AND is P2
//   wizard, s1        separate with commas: the item must match every part

const HIGHLIGHT_CLASS = 'bt-mod-filter-highlight';
const HIDDEN_CLASS = 'bt-mod-filter-hidden';
const RESULT_ROWS_SELECTOR = '.resultset > div.row[data-id]';

interface TierCondition {
  kind: string; // 'p' (prefix), 's' (suffix) or 't' (either)
  tier: number;
  orBetter: boolean;
}

interface Term {
  tiers: TierCondition[];
  words: string[];
}

interface ItemMod {
  element: Element;
  text: string; // stat text + mod name, lowercased
  kind: string | null; // 'p' or 's'
  tier: number | null;
}

export interface ModFilterCounts {
  shown: number;
  total: number;
}

// The filter text is not remembered: every newly opened page starts with an empty filter.
let currentQuery = '';
let currentTerms: Term[] = [];

let listener: ((counts: ModFilterCounts) => void) | null = null;
let scheduled = false;
let lastFirstId: string | null | undefined;
let sawNoResults = false;

export const parseQuery = (query: string): Term[] =>
  query
    .toLowerCase()
    .split(',')
    .map((part) => {
      const term: Term = {tiers: [], words: []};

      part
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .forEach((token) => {
          const tierMatch = token.match(/^([pst])(\d+)(\+)?$/);

          if (tierMatch) {
            term.tiers.push({kind: tierMatch[1], tier: parseInt(tierMatch[2], 10), orBetter: Boolean(tierMatch[3])});
          } else {
            term.words.push(token);
          }
        });

      return term;
    })
    .filter((term) => term.tiers.length || term.words.length);

const readMods = (row: Element): ItemMod[] => {
  const mods: ItemMod[] = [];

  row.querySelectorAll('.item-mod').forEach((modElement) => {
    const statElement = modElement.querySelector('[data-field^="stat."]') || modElement.querySelector('.s.lc');
    const nameElement = modElement.querySelector('.lc.r .d');
    const tierElement = modElement.querySelector('.lc.l');

    // The tier label is the text directly inside `.lc.l` (e.g. "P5"), next to the `.d` range.
    let tierLabel = '';
    if (tierElement) {
      tierElement.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) tierLabel += node.textContent || '';
      });
    }

    const tierMatch = tierLabel.trim().match(/^([ps])(\d+)$/i);
    const statText = statElement ? statElement.textContent || '' : '';
    const nameText = nameElement ? nameElement.textContent || '' : '';

    mods.push({
      element: modElement,
      text: `${statText} ${nameText}`.toLowerCase(),
      kind: tierMatch ? tierMatch[1].toLowerCase() : null,
      tier: tierMatch ? parseInt(tierMatch[2], 10) : null,
    });
  });

  return mods;
};

const modMatchesTerm = (mod: ItemMod, term: Term) => {
  const tiersMatch = term.tiers.every(({kind, tier, orBetter}) => {
    if (mod.tier === null || mod.kind === null) return false;
    if (kind !== 't' && kind !== mod.kind) return false;

    return orBetter ? mod.tier <= tier : mod.tier === tier;
  });

  return tiersMatch && term.words.every((word) => mod.text.includes(word));
};


const apply = () => {
  scheduled = false;

  const rows = document.querySelectorAll(RESULT_ROWS_SELECTOR);
  let shown = 0;

  // Notice when a search brings in a fresh set of results (as opposed to "Load More" adding to it).
  const firstId = rows.length ? rows[0].getAttribute('data-id') : null;
  if (!rows.length) {
    sawNoResults = true;
  } else if (sawNoResults || firstId !== lastFirstId) {
    const isFirstLook = lastFirstId === undefined;
    sawNoResults = false;
    lastFirstId = firstId;
    if (!isFirstLook) emit('new-results');
  }

  const terms = isAdvancedFilteringOn() ? currentTerms : [];

  const highlight = terms.length > 0 && isEnabled('highlight-stat-filters');

  rows.forEach((row) => {
    const mods = terms.length ? readMods(row) : [];
    const matches = !terms.length || terms.every((term) => mods.some((mod) => modMatchesTerm(mod, term)));
    if (matches) shown++;

    // Only touch classes when they need to change, to avoid re-triggering the observer.
    if (row.classList.contains(HIDDEN_CLASS) === matches) row.classList.toggle(HIDDEN_CLASS, !matches);

    // Highlight the mods that the filter text is looking for.
    const wanted = new Set(
      highlight && matches ? mods.filter((mod) => terms.some((term) => modMatchesTerm(mod, term))).map((mod) => mod.element) : []
    );
    row.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
      if (!wanted.has(element)) element.classList.remove(HIGHLIGHT_CLASS);
    });
    wanted.forEach((element) => {
      if (!element.classList.contains(HIGHLIGHT_CLASS)) element.classList.add(HIGHLIGHT_CLASS);
    });
  });

  if (listener) listener({shown, total: rows.length});
};

const scheduleApply = () => {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(apply);
};

export const getModFilterQuery = () => currentQuery;

export const setModFilterQuery = (query: string) => {
  if (query === currentQuery) return;

  currentQuery = query;
  currentTerms = parseQuery(query);

  scheduleApply();
  emit('mod-filter-query'); // the sidebar box and the tier picker both follow the filter text
};

export const onModFilterChange = (callback: ((counts: ModFilterCounts) => void) | null) => {
  listener = callback;
  if (callback) scheduleApply();
};

export default function setupModFilter() {
  currentTerms = parseQuery(currentQuery);

  // Turning Tier search off shows every result again.
  on('settings-change', scheduleApply);

  // Results load as you search and scroll, so re-apply whenever the page changes.
  onPageChange(scheduleApply);

  scheduleApply();
}
