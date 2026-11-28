import {local} from './ext';
import {emit} from './util';

// Options shown in the Settings tab. `defaultOn` decides the first-time state.
export const SETTINGS = {
  'fuzzy-search': {label: 'Add fuzzy key to search', defaultOn: false},
  'quick-filters': {label: 'Quick filter presets', defaultOn: true},
  'tier-search': {label: 'Tier search', defaultOn: false},
  // Sub-option of Tier search: the result filter box, Load all / Next 100, and the link from the tier picker.
  'advanced-filtering': {label: 'Advanced filtering', defaultOn: false},
  'highlight-stat-filters': {label: 'Highlight searched mods', defaultOn: true},
  'collapsible-stat-groups': {label: 'Stat filters are collapsible', defaultOn: false},
  'default-non-unique': {label: 'Item rarity starts on Any Non-Unique', defaultOn: false},
  'sticky-search': {label: 'Keep the search bar on screen while scrolling', defaultOn: false},
  'hover-open': {label: 'Show panel when hovering the icon', defaultOn: false},
  'bookmark-prices': {label: 'Show the lowest price and listing count on bookmarks', defaultOn: true},
  'auto-backup': {label: 'Back up bookmarks automatically (Downloads/Better Trading 2)', defaultOn: true},
  'equivalent-pricings': {label: 'Equivalent prices (from poe.ninja)', defaultOn: true},
  'regroup-similars': {label: 'Group identical listings from the same seller', defaultOn: true},
  'price-summary': {label: 'Price summary above the results (lowest / median / highest)', defaultOn: false},
  'mod-buttons': {label: 'Plus / Minus buttons on result mods', defaultOn: true},
  'live-alert-sound': {label: 'Live search custom sound', defaultOn: false},
  'live-alert-notification': {label: 'Live search desktop notification', defaultOn: false},
  // Which tabs the panel shows (Settings always shows).
  'tab-bookmarks': {label: 'Bookmarks', defaultOn: true},
  'tab-pinned-items': {label: 'Pinned items', defaultOn: false},
  'tab-bulk': {label: 'Bulk', defaultOn: true},
  'tab-history': {label: 'History', defaultOn: true},
} as const;

// The Settings tab, in groups.
export const SETTINGS_SECTIONS = [
  {title: 'Search form', keys: ['fuzzy-search', 'quick-filters', 'tier-search', 'collapsible-stat-groups', 'default-non-unique', 'sticky-search']},
  {title: 'Results', keys: ['highlight-stat-filters', 'mod-buttons', 'equivalent-pricings', 'price-summary', 'regroup-similars']},
  {title: 'Live search', keys: ['live-alert-sound', 'live-alert-notification']},
  {title: 'Panel', keys: ['hover-open', 'bookmark-prices', 'auto-backup']},
  {title: 'Tabs', keys: ['tab-bookmarks', 'tab-pinned-items', 'tab-bulk', 'tab-history']},
] as const;

export type SettingKey = keyof typeof SETTINGS;


// Advanced filtering only works while Tier search is on.
export const isAdvancedFilteringOn = (): boolean => isEnabled('tier-search') && isEnabled('advanced-filtering');

// Settings are checked very often (on every page change), so they're kept in memory and
// only read from storage again when they change, here or in another trade tab.
const cache = new Map<SettingKey, boolean>();

export const isEnabled = (key: SettingKey): boolean => {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const stored = local.get(`setting-${key}`);
  const value = stored === 'on' ? true : stored === 'off' ? false : SETTINGS[key].defaultOn;
  cache.set(key, value);
  return value;
};

export const setEnabled = (key: SettingKey, enabled: boolean): void => {
  local.set(`setting-${key}`, enabled ? 'on' : 'off');
  cache.set(key, enabled);
  emit('settings-change');
};

// A setting changed in another trade tab: apply it here too.
window.addEventListener('storage', (event) => {
  if (event.key !== null && !event.key.startsWith('bt-setting-')) return;
  cache.clear();
  emit('settings-change');
});
