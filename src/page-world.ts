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
