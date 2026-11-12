import {local} from '../lib/ext';

// Makes every group in the "+ Add Stat Filter" list collapsible (Pseudo, Explicit,
// Implicit, Fractured, Enchant, Crafted...): click a group's heading to hide or show
// its stats. Which groups are hidden is remembered.
//
// The look of the headings is plain CSS (src/content.css). Hiding is done by a small
// stylesheet built here from the hidden groups, so it keeps working while the site
// re-draws the list as you type. The keyboard keeps working too: arrow keys and Enter
// skip over hidden stats.

const STORAGE_KEY = 'collapsed-stat-groups';
const OLD_PSEUDO_KEY = 'pseudo-collapsed'; // setting from before every group could collapse
const STYLE_ID = 'bt-collapsed-stat-groups';
const STAT_SELECT_SELECTOR = '.filter-select-mutate';
const MAX_SKIPS = 600;

const collapsed = new Set<string>();

// The group a stat belongs to, from its "mutate-type-<group>" label class.
const groupOfItem = (item: Element | null): string | null => {
  const label = item && item.querySelector('[class*="mutate-type-"]');
  if (!label) return null;
  for (const name of Array.from(label.classList)) {
    if (name.startsWith('mutate-type-')) return name.slice('mutate-type-'.length);
  }
  return null;
};

const isHiddenItem = (item: Element | null) => {
  const group = groupOfItem(item);
  return group !== null && collapsed.has(group);
};

// Group names come from the site's class names; keep only safe characters for CSS.
const cssName = (group: string) => group.replace(/[^a-zA-Z0-9_-]/g, '');

// "html body" makes these rules win over the default heading style in content.css.
const HEADING = (group: string) =>
  `html body .filter-select-mutate li.multiselect__element:has(> .multiselect__option--disabled):has(+ li .mutate-type-${group}) > .multiselect__option--disabled`;

const render = () => {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = Array.from(collapsed)
    .map(cssName)
    .filter(Boolean)
    .map(
      (group) =>
        `html body .filter-select-mutate li.multiselect__element:has(.mutate-type-${group}) { display: none !important; }\n` +
        `${HEADING(group)}::before { content: '\\25b8'; }\n` +
        `${HEADING(group)}::after { content: '(hidden, click to show)' !important; }`
    )
    .join('\n');
};

const save = () => local.set(STORAGE_KEY, collapsed.size ? JSON.stringify(Array.from(collapsed)) : null);

const load = () => {
  try {
    const saved = JSON.parse(local.get(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach((group) => typeof group === 'string' && collapsed.add(group));
  } catch (_error) {
    // Unreadable setting: start with every group shown.
  }

  if (local.get(OLD_PSEUDO_KEY) === 'on') {
    collapsed.add('pseudo');
    local.set(OLD_PSEUDO_KEY, null);
    save();
  }
};

const handleClick = (event: Event) => {
  const target = event.target as Element | null;
  const heading = target && target.closest ? target.closest('.multiselect__option--disabled') : null;
  if (!heading || !heading.closest(STAT_SELECT_SELECTOR)) return;

  const group = groupOfItem(heading.closest('li')?.nextElementSibling ?? null);
  if (!group) return;

  event.preventDefault();
  event.stopPropagation();

  if (collapsed.has(group)) collapsed.delete(group);
  else collapsed.add(group);
  save();
  render();
};

// The site's list keeps its own "highlighted" stat. Move that highlight past hidden
// stats so Enter never picks one.
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
      if (!highlighted || !isHiddenItem(highlighted.closest('li'))) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const init: any = {key, keyCode: key === 'ArrowUp' ? 38 : 40, bubbles: true};
      input.dispatchEvent(new KeyboardEvent('keydown', init));
    }
  } finally {
    isSkipping = false;
  }
};

const handleKeyboard = (event: Event) => {
  if (isSkipping || collapsed.size === 0) return;

  const input = event.target as HTMLInputElement | null;
  if (!input || !input.classList || !input.classList.contains('multiselect__input')) return;
  if (!input.closest(STAT_SELECT_SELECTOR)) return;

  const key = (event as KeyboardEvent).key;
  if (event.type === 'keydown' && key !== 'ArrowDown' && key !== 'ArrowUp') return;

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  skipHiddenHighlight(input, key === 'ArrowUp' ? 'ArrowUp' : 'ArrowDown');
};

export default function setupCollapsibleStatGroups() {
  load();
  render();

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyboard, true);
  document.addEventListener('input', handleKeyboard, true);
  document.addEventListener('focusin', handleKeyboard, true);
}
