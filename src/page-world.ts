// Runs inside the trade page itself (not the extension's isolated world), because only
// the page can reach the site's search form state (window.app.state).
//
// The content script asks for a stat filter with a "bt-stat-filter" event; this adds it
// to the search form and answers with "bt-stat-filter-result". Details travel as JSON
// strings, which cross between the two worlds in every browser.

interface StatFilter {
  id: string;
  value: Record<string, unknown>;
  disabled: boolean;
}

interface StatGroup {
  type: string;
  filters: StatFilter[];
  disabled?: boolean;
}

type Answer = 'added' | 'exists' | 'failed';

const addStatFilter = (id: string, type: 'and' | 'not'): Answer => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stats: StatGroup[] | undefined = (window as any).app?.state?.stats;
  if (!Array.isArray(stats) || !id) return 'failed';

  const filter: StatFilter = {id, value: {}, disabled: false};
  // Plus goes to its own "And" group, not the first group (the site's main "Stat Filters").
  const group = stats.find((candidate, index) => candidate.type === type && !candidate.disabled && (type !== 'and' || index > 0));

  if (!group) {
    stats.push({type, filters: [filter]});
    return 'added';
  }
  if (group.filters.some((existing) => existing.id === id)) return 'exists';

  group.filters.push(filter);
  return 'added';
};

window.addEventListener('bt-stat-filter', (event) => {
  let request: {id?: string; type?: string; key?: string} = {};
  try {
    request = JSON.parse(String((event as CustomEvent).detail));
  } catch (_error) {
    return;
  }

  let answer: Answer = 'failed';
  try {
    if (request.id && (request.type === 'and' || request.type === 'not')) answer = addStatFilter(request.id, request.type);
  } catch (_error) {
    answer = 'failed';
  }

  window.dispatchEvent(new CustomEvent('bt-stat-filter-result', {detail: JSON.stringify({key: request.key, answer})}));
});

// ---- Quick filters ----------------------------------------------------------------------
// "bt-quick-filter" sets one filter in the search form (for example Miscellaneous >
// Corrupted to No), or adds / removes a set of stat filters, and answers with
// "bt-quick-filter-result".

interface QuickFilterValue {
  option?: string | null;
  min?: number;
  max?: number;
}

interface FilterGroupState {
  disabled?: boolean;
  filters?: Record<string, QuickFilterValue | undefined>;
}

const setQuickFilter = (groupId: string, filterId: string, wanted: QuickFilterValue): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: Record<string, FilterGroupState | undefined> | undefined = (window as any).app?.state?.filters;
  if (!filters || typeof filters !== 'object' || !groupId || !filterId) return false;

  const group = filters[groupId] || (filters[groupId] = {filters: {}});
  group.filters = group.filters || {};
  group.disabled = false; // the site skips a group whose box is unticked
  const value: QuickFilterValue = {};
  if (wanted.option != null) value.option = wanted.option;
  if (typeof wanted.min === 'number') value.min = wanted.min;
  if (typeof wanted.max === 'number') value.max = wanted.max;
  group.filters[filterId] = value;
  return true;
};

const clearQuickFilter = (groupId: string, filterId: string): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: Record<string, FilterGroupState | undefined> | undefined = (window as any).app?.state?.filters;
  if (!filters || typeof filters !== 'object') return false;
  delete filters[groupId]?.filters?.[filterId];
  return true;
};

interface QuickStat {
  id: string;
  min?: number;
  max?: number;
}

// Plus: puts the stats in the main Stat Filters group (or updates their values there).
// Minus: takes them out of every group.
const applyQuickStats = (wanted: QuickStat[], mode: string): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups: StatGroup[] | undefined = (window as any).app?.state?.stats;
  if (!Array.isArray(groups)) return false;
  const ids = new Set(wanted.map((stat) => stat.id));

  if (mode === 'remove') {
    groups.forEach((group) => {
      for (let index = group.filters.length - 1; index >= 0; index--) {
        if (ids.has(group.filters[index].id)) group.filters.splice(index, 1);
      }
    });
    return true;
  }

  let main = groups.find((group) => group.type === 'and');
  if (!main) {
    groups.unshift({type: 'and', filters: []});
    main = groups[0];
  }
  main.disabled = false;
  wanted.forEach((stat) => {
    if (!stat.id) return;
    const value: Record<string, number> = {};
    if (typeof stat.min === 'number') value.min = stat.min;
    if (typeof stat.max === 'number') value.max = stat.max;
    const existing = main?.filters.find((filter) => filter.id === stat.id);
    if (existing) {
      existing.value = value;
      existing.disabled = false;
    } else {
      main?.filters.push({id: stat.id, value, disabled: false});
    }
  });
  return true;
};

window.addEventListener('bt-quick-filter', (event) => {
  let request: {key?: string; group?: string; filter?: string; value?: QuickFilterValue; clear?: boolean; stats?: QuickStat[]; mode?: string} = {};
  try {
    request = JSON.parse(String((event as CustomEvent).detail));
  } catch (_error) {
    return;
  }

  let done = false;
  try {
    if (Array.isArray(request.stats)) done = applyQuickStats(request.stats, String(request.mode || 'add'));
    else if (request.clear) done = clearQuickFilter(String(request.group || ''), String(request.filter || ''));
    else done = setQuickFilter(String(request.group || ''), String(request.filter || ''), request.value || {});
  } catch (_error) {
    done = false;
  }

  window.dispatchEvent(new CustomEvent('bt-quick-filter-result', {detail: JSON.stringify({key: request.key, done})}));
});

// ---- The trade site's live search sound --------------------------------------------------
// The site plays its alert through an <audio> element with a file from /audio/trade/. While
// Better Trading 2 plays a different sound for the search, that one is kept quiet, so only
// one sound plays. "bt-site-sound" says {muted} or asks to {test} it.

const isSiteSound = (media: HTMLMediaElement) => /\/audio\/trade\//.test(media.currentSrc || media.src || '');
const originalPlay = HTMLMediaElement.prototype.play;
let siteSoundMuted = false;

HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
  if (siteSoundMuted && isSiteSound(this)) return Promise.resolve();
  return originalPlay.call(this);
};

window.addEventListener('bt-site-sound', (event) => {
  let request: {muted?: unknown; test?: unknown} = {};
  try {
    request = JSON.parse(String((event as CustomEvent).detail));
  } catch (_error) {
    return;
  }
  if (typeof request.muted === 'boolean') siteSoundMuted = request.muted;
  if (request.test) {
    const media = [...document.querySelectorAll('audio')].find(isSiteSound);
    if (media) {
      media.currentTime = 0;
      originalPlay.call(media).catch(() => undefined);
    }
  }
});

// Loaded after the extension's other script: let it send its settings again.
window.dispatchEvent(new CustomEvent('bt-page-world-ready'));
