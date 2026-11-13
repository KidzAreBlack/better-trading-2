// Plus and Minus buttons beside each mod of a search result (shown on hover):
// Plus adds the mod to an "And" stat group, Minus to a "Not" group. Each group is made
// the first time and reused after that. The filters go into the search form; run the
// search when ready.
//
// The search form lives in the page's own code, so the change is made by page-world.ts.

import {isEnabled} from '../lib/settings';
import {on} from '../lib/util';
import {flash} from '../ui/common';

const ACTIVE_CLASS = 'bt-mod-buttons-on';
const GROUP_NAMES = {and: 'And', not: 'Not'} as const;

let nextKey = 1;

const askPage = (id: string, type: 'and' | 'not'): Promise<string> =>
  new Promise((resolve) => {
    const key = String(nextKey++);
    const finish = (answer: string) => {
      window.removeEventListener('bt-stat-filter-result', listener);
      window.clearTimeout(timer);
      resolve(answer);
    };
    const listener = (event: Event) => {
      try {
        const result = JSON.parse(String((event as CustomEvent).detail));
        if (result.key === key) finish(result.answer);
      } catch (_error) {
        // Not our answer.
      }
    };
    const timer = window.setTimeout(() => finish('failed'), 1000);

    window.addEventListener('bt-stat-filter-result', listener);
    window.dispatchEvent(new CustomEvent('bt-stat-filter', {detail: JSON.stringify({id, type, key})}));
  });

const addToSearch = async (id: string, type: 'and' | 'not', text: string) => {
  const group = GROUP_NAMES[type];
  const answer = await askPage(id, type);

  if (answer === 'added') flash.success(`Added to the ${group} group: ${text}`);
  else if (answer === 'exists') flash.alert(`Already in the ${group} group: ${text}`);
  else flash.alert('Could not reach the search form. Reload the page and try again.');
};

const button = (type: 'and' | 'not', id: string, text: string) => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `bt-mod-button bt-mod-button-${type}`;
  element.textContent = type === 'and' ? '+' : '−';
  element.title = type === 'and' ? 'Add this mod to an And group in your search' : 'Add this mod to a Not group in your search';
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void addToSearch(id, type, text);
  });

  return element;
};

export const addModButtons = (row: Element): void => {
  row.querySelectorAll('.item-mod [data-field^="stat."]').forEach((field) => {
    if (field.querySelector('.bt-mod-buttons')) return;

    const id = (field.getAttribute('data-field') || '').slice('stat.'.length);
    const text = (field.textContent || '').replace(/\s+/g, ' ').trim();
    if (!id || !text) return;

    // A zero-width anchor, so the mod text does not move when the buttons appear.
    const anchor = document.createElement('span');
    anchor.className = 'bt-mod-buttons';
    const buttons = document.createElement('span');
    buttons.className = 'bt-mod-buttons-inner';
    buttons.append(button('and', id, text), button('not', id, text));
    anchor.append(buttons);
    field.prepend(anchor);
  });
};

// Turning the setting off hides the buttons at once (they stay in the page, unused).
export const setupModButtons = (): void => {
  const update = () => document.body.classList.toggle(ACTIVE_CLASS, isEnabled('mod-buttons'));
  update();
  on('settings-change', update);
};
