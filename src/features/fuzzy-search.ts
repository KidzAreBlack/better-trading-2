import {isEnabled} from '../lib/settings';

// Fuzzy search: automatically puts "~" in front of what you type in the
// trade site's main search box and in the stat filter boxes.
// (On the trade site, a leading "~" turns on fuzzy matching.)

const FUZZY_PREFIX = '~';

const isMainSearchInput = (input: HTMLInputElement) => Boolean(input.closest('.search-bar .search-left'));

const isStatFilterInput = (input: HTMLInputElement) => {
  const placeholder = input.placeholder || '';
  if (/stat group/i.test(placeholder)) return false;
  if (/stat filter/i.test(placeholder)) return true;

  // Fallback (other languages): the stat filters live in the last advanced pane.
  const pane = input.closest('.search-advanced-pane');
  if (!pane || !pane.parentElement) return false;

  const panes = pane.parentElement.querySelectorAll('.search-advanced-pane');
  if (panes.length < 2 || panes[panes.length - 1] !== pane) return false;

  return Boolean(input.closest('.filter-group-body')) && !input.closest('.filter-group-header');
};

const handleInput = (event: Event) => {
  if ((event as InputEvent).isComposing) return;

  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (!input.classList.contains('multiselect__input')) return;
  if (!isEnabled('fuzzy-search')) return;

  const value = input.value;
  if (!value || value.startsWith(FUZZY_PREFIX)) return;
  if (!isMainSearchInput(input) && !isStatFilterInput(input)) return;

  // This runs before the trade site's own listener, so it sees the prefixed value.
  input.value = `${FUZZY_PREFIX}${value}`;
  input.setSelectionRange(input.value.length, input.value.length);
};

export default function setupFuzzySearch() {
  document.addEventListener('input', handleInput, true);
}
