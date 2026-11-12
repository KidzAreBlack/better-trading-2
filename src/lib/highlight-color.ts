import {local} from './ext';

// Colour used to highlight the mods you are looking for in the results.
// Picked in the Settings tab; green unless changed.

export const DEFAULT_HIGHLIGHT_COLOR = '#33aa44';
const STORAGE_KEY = 'highlight-color';
const OPACITY = 0.35;

export const getHighlightColor = (): string => {
  const stored = local.get(STORAGE_KEY);

  return stored && /^#[0-9a-f]{6}$/i.test(stored) ? stored : DEFAULT_HIGHLIGHT_COLOR;
};

export const applyHighlightColor = (): void => {
  const color = getHighlightColor();
  const [red, green, blue] = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));

  document.documentElement.style.setProperty('--bt-highlight-bg', `rgba(${red}, ${green}, ${blue}, ${OPACITY})`);
  document.documentElement.style.setProperty('--bt-highlight-color', color);
};

export const setHighlightColor = (color: string): void => {
  local.set(STORAGE_KEY, color);
  applyHighlightColor();
};
