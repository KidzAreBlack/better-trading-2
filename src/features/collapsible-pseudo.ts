import {local} from '../lib/ext';

// Makes the "Pseudo" group in the "+ Add Stat Filter" list collapsible:
// click the "Pseudo" heading to hide or show its stats. The choice is remembered.
//
// The hiding itself is done with CSS (src/content.css). This file
// handles the click on the heading, and keeps the keyboard working while the
// group is hidden (arrow keys and Enter skip over the hidden pseudo stats).

const STORAGE_KEY = 'pseudo-collapsed';
const BODY_CLASS = 'bt-pseudo-collapsed';
const STAT_SELECT_SELECTOR = '.filter-select-mutate';
const MAX_SKIPS = 600;

const isCollapsed = () => document.body.classList.contains(BODY_CLASS);

const isPseudoItem = (item: Element | null) => Boolean(item && item.querySelector('.mutate-type-pseudo'));

const isPseudoHeading = (option: Element) => {
  const item = option.closest('li');

  return Boolean(item && option.closest(STAT_SELECT_SELECTOR) && isPseudoItem(item.nextElementSibling));
};

const handleClick = (event: Event) => {
  const target = event.target as Element | null;
  const heading = target && target.closest ? target.closest('.multiselect__option--disabled') : null;
  if (!heading || !isPseudoHeading(heading)) return;

  event.preventDefault();
  event.stopPropagation();

  const collapsed = !isCollapsed();
  document.body.classList.toggle(BODY_CLASS, collapsed);

  if (collapsed) {
    local.set(STORAGE_KEY, 'on');
  } else {
    local.set(STORAGE_KEY, null);
  }
};

// The site's list keeps its own "highlighted" stat. While pseudo stats are
// hidden, move that highlight past them so Enter never picks a hidden stat.
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
};

let isSkipping = false;

const skipHiddenHighlight = async (input: HTMLInputElement, key: string) => {
  if (isSkipping) return;
  isSkipping = true;

  try {
    const select = input.closest(STAT_SELECT_SELECTOR);
    if (!select) return;

    for (let count = 0; count < MAX_SKIPS; count++) {
      await tick();

      const highlighted = select.querySelector('.multiselect__option--highlight');
      if (!highlighted || !isPseudoItem(highlighted.closest('li'))) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const init: any = {key, keyCode: key === 'ArrowUp' ? 38 : 40, bubbles: true};
      input.dispatchEvent(new KeyboardEvent('keydown', init));
    }
  } finally {
    isSkipping = false;
  }
};

const handleKeyboard = (event: Event) => {
  if (isSkipping || !isCollapsed()) return;

  const input = event.target as HTMLInputElement | null;
  if (!input || !input.classList || !input.classList.contains('multiselect__input')) return;
  if (!input.closest(STAT_SELECT_SELECTOR)) return;

  const key = (event as KeyboardEvent).key;
  if (event.type === 'keydown' && key !== 'ArrowDown' && key !== 'ArrowUp') return;

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  skipHiddenHighlight(input, key === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown');
};

export default function setupCollapsiblePseudo() {
  if (local.get(STORAGE_KEY) === 'on') document.body.classList.add(BODY_CLASS);

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyboard, true);
  document.addEventListener('input', handleKeyboard, true);
  document.addEventListener('focusin', handleKeyboard, true);
}
