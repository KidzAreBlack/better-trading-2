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
//
// Regex mode, for map regexes (the same style as the game's stash search, e.g. from poe.re):
// used when the text has a quote, "!", "|", "\" or brackets / regex symbols in it.
//   "pack.*[2-9]\d%"   every pattern (split by spaces; quotes keep spaces in) must match
//   "!ele|refl"        "!" = must NOT match; "|" = either
// Each pattern is tested line by line against the whole item: name, properties
// (Item Quantity, Monster Pack Size...) and mod texts.

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

interface RegexTerm {
  pattern: RegExp;
  negate: boolean;
}

// The filter text is not remembered: every newly opened page starts with an empty filter.
let currentQuery = '';
let currentTerms: Term[] = [];
let currentRegex: RegexTerm[] | null = null; // set when the text is a regex query

let listener: ((counts: ModFilterCounts) => void) | null = null;
let scheduled = false;
let lastFirstId: string | null | undefined;
let sawNoResults = false;

const parseQuery = (query: string): Term[] =>
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

// ---- Regex mode -----------------------------------------------------------------------

const isRegexQuery = (query: string): boolean => /["!|\\[\]()*?^${}]/.test(query);

// Splits like the game: by spaces, except inside quotes; "!" before or inside the quotes negates.
const parseRegexQuery = (query: string): RegexTerm[] =>
  (query.match(/!?"[^"]*"?|[^\s"]+/g) || [])
    .map((token) => {
      let text = token;
      let negate = false;
      if (text.startsWith('!')) {
        negate = true;
        text = text.slice(1);
      }
      text = text.replace(/^"|"$/g, '');
      if (text.startsWith('!')) {
        negate = true;
        text = text.slice(1);
      }
      if (!text) return null;

      let pattern: RegExp;
      try {
        pattern = new RegExp(text, 'i');
      } catch (_error) {
        // Not a valid regex (still being typed): match it as plain text.
        pattern = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }
      return {pattern, negate};
    })
    .filter((term): term is RegexTerm => term !== null);

const textWithout = (element: Element, selector: string) => {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(selector).forEach((child) => child.remove());
  return (copy.textContent || '').replace(/\s+/g, ' ').trim();
};

// The item's text, a line per name / property / mod, as the game's search sees it.
const readItemLines = (row: Element): {text: string; mod: Element | null}[] => {
  const popup = row.querySelector('.item-popup') || row;
  const lines: {text: string; mod: Element | null}[] = [];

  popup.querySelectorAll('.item-popup__header-line, .item-popup__header .itemName, .item-popup__header .typeLine').forEach((element) => {
    const text = (element.textContent || '').trim();
    if (text && !lines.some((line) => line.text === text)) lines.push({text, mod: null});
  });
  popup.querySelectorAll('.item-popup__property, .property').forEach((element) => {
    lines.push({text: textWithout(element, '.bt-mod-buttons'), mod: null});
  });
  popup.querySelectorAll('.item-mod').forEach((element) => {
    lines.push({text: textWithout(element, '.bt-mod-buttons, .lc.l, .lc.r'), mod: element});
  });

  return lines.filter((line) => line.text);
};

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


// What each result matched, for the filter text it was last checked with.
const checked = new WeakMap<Element, {query: string; matches: boolean; matchedMods: Element[]}>();

const matchRow = (row: Element, terms: Term[], regex: RegexTerm[] | null): {matches: boolean; matchedMods: Element[]} => {
  if (regex) {
    const lines = readItemLines(row);
    return {
      matches: regex.every(({pattern, negate}) => lines.some((line) => pattern.test(line.text)) !== negate),
      matchedMods: lines
        .filter((line) => line.mod && regex.some(({pattern, negate}) => !negate && pattern.test(line.text)))
        .map((line) => line.mod as Element),
    };
  }

  const mods = readMods(row);
  return {
    matches: terms.every((term) => mods.some((mod) => modMatchesTerm(mod, term))),
    matchedMods: mods.filter((mod) => terms.some((term) => modMatchesTerm(mod, term))).map((mod) => mod.element),
  };
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

  const isOn = isAdvancedFilteringOn();
  const terms = isOn && !currentRegex ? currentTerms : [];
  const regex = isOn && currentRegex && currentRegex.length ? currentRegex : null;

  // Nothing to filter (empty box, or Advanced filtering off): undo any earlier filtering
  // and skip the per-result work.
  if (!terms.length && !regex) {
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((row) => row.classList.remove(HIDDEN_CLASS));
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((mod) => mod.classList.remove(HIGHLIGHT_CLASS));
    if (listener) listener({shown: rows.length, total: rows.length});
    return;
  }

  const highlight = isEnabled('highlight-stat-filters');

  rows.forEach((row) => {
    // Each result is only checked again when the filter text changed.
    let result = checked.get(row);
    if (!result || result.query !== currentQuery) {
      result = {query: currentQuery, ...matchRow(row, terms, regex)};
      checked.set(row, result);
    }
    const {matches, matchedMods} = result;
    if (matches) shown++;

    // Only touch classes when they need to change, to avoid re-triggering the observer.
    if (row.classList.contains(HIDDEN_CLASS) === matches) row.classList.toggle(HIDDEN_CLASS, !matches);

    // Highlight the mods that the filter text is looking for.
    const wanted = new Set(highlight && matches ? matchedMods : []);
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
  currentRegex = isRegexQuery(query) ? parseRegexQuery(query) : null;
  currentTerms = currentRegex ? [] : parseQuery(query);

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
