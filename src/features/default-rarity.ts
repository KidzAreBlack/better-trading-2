// Optional: start with "Any Non-Unique" in the Item Rarity box instead of "Any".
//
// It only steps in when the form is at its starting state: a trade page opened
// without a search, and after the "Clear" button. A search you open (bookmark,
// history, link) keeps whatever rarity it was made with, and picking "Any"
// yourself sticks.

import {isEnabled} from '../lib/settings';
import {currentLocation} from '../lib/trade-location';
import {sleep} from '../lib/util';

const RARITY_INPUT = '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(2) input';
const NON_UNIQUE = /non[-\s]?unique/i;
const ATTEMPTS = 40;
const ATTEMPT_INTERVAL_MS = 250;

const selectNonUnique = (): 'done' | 'retry' | 'skip' => {
  const input = document.querySelector<HTMLInputElement>(RARITY_INPUT);
  const select = input?.closest('.multiselect');
  if (!input || !select) return 'retry';

  // Leave a rarity that is already chosen alone.
  const current = (input.value || input.placeholder || '').trim();
  if (NON_UNIQUE.test(current)) return 'done';
  if (current && !/^any$/i.test(current)) return 'skip';

  const option = Array.from(select.querySelectorAll<HTMLElement>('.multiselect__option')).find((candidate) =>
    NON_UNIQUE.test(candidate.textContent || '')
  );
  if (!option) return 'retry';

  option.click();

  return 'done';
};

// The search form is filled in a moment after the page loads, so keep trying for a while.
const applyDefault = async () => {
  if (!isEnabled('default-non-unique')) return;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (selectNonUnique() !== 'retry') return;
    await sleep(ATTEMPT_INTERVAL_MS);
  }
};

export default function setupDefaultRarity() {
  const {type, slug} = currentLocation();
  if (!slug && (!type || type === 'search')) void applyDefault();

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    if (target?.closest?.('.controls .clear-btn')) window.setTimeout(() => void applyDefault(), 150);
  });
}
