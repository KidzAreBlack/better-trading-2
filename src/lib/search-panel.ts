// Reads what is currently entered in the trade site's search form.

const SEARCH_INPUT = '.search-panel .search-bar .search-left input';
const CATEGORY_INPUT = '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(1) input';
const RARITY_INPUT = '.search-advanced-items .filter-group:nth-of-type(1) .filter-property:nth-of-type(2) input';
const STATS = '.search-advanced-pane:last-child .filter-group-body .filter:not(.disabled) .filter-title';

const inputValue = (selector: string, emptyValue?: string): string | null => {
  const input = document.querySelector<HTMLInputElement>(selector);
  const value = input?.value;
  if (!value || value === emptyValue) return null;

  return value;
};

export const getCategory = (): string | null => inputValue(CATEGORY_INPUT, 'Any');
export const getRarity = (): string | null => inputValue(RARITY_INPUT, 'Any');
export const getName = (): string | null => inputValue(SEARCH_INPUT);

export const recommendTitle = (): string => {
  const name = getName();
  if (name) return name;

  const category = getCategory();
  const rarity = getRarity();
  if (!category) return '';

  return rarity ? `${category} (${rarity})` : category;
};

// Stat texts of the active stat filters, e.g. "#% increased spell damage".
export const getStats = (): string[] =>
  Array.from(document.querySelectorAll<HTMLElement>(STATS)).map((title) => {
    const clone = title.cloneNode(true) as HTMLElement;
    // Leave out the stat's type label and the tier picker's button, which sit inside the name.
    clone.querySelectorAll('.mutate-type, .bt-tier-button').forEach((element) => element.remove());

    return (clone.textContent || '')
      .replace(/\s*\(local\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  });
