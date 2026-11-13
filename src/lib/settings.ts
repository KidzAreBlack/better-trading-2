import {local} from './ext';
import {emit} from './util';

// Options shown in the Settings tab. `defaultOn` decides the first-time state.
export const SETTINGS = {
  'fuzzy-search': {label: 'Fuzzy search', defaultOn: false},
  'tier-search': {label: 'Tier search', defaultOn: false},
  // Sub-option of Tier search: the result filter box, Load all / Next 100, and the link from the tier picker.
  'advanced-filtering': {label: 'Advanced filtering', defaultOn: false},
  'highlight-stat-filters': {label: 'Highlight searched mods', defaultOn: true},
  'collapsible-stat-groups': {label: 'Stat filters are collapsible', defaultOn: false},
  'default-non-unique': {label: 'Item rarity starts on Any Non-Unique', defaultOn: false},
  'hover-open': {label: 'Show panel when hovering the icon', defaultOn: false},
  'equivalent-pricings': {label: 'Equivalent prices (from poe.ninja)', defaultOn: true},
  'maximum-sockets': {label: 'Warning for body armours that cannot be 6-socketed', defaultOn: true},
  'regroup-similars': {label: 'Group identical listings from the same seller', defaultOn: true},
  'mod-buttons': {label: 'Plus / Minus buttons on result mods', defaultOn: true},
} as const;

// The Settings tab, in groups.
export const SETTINGS_SECTIONS = [
  {title: 'Search form', keys: ['fuzzy-search', 'tier-search', 'collapsible-stat-groups', 'default-non-unique']},
  {title: 'Results', keys: ['highlight-stat-filters', 'mod-buttons', 'equivalent-pricings', 'maximum-sockets', 'regroup-similars']},
  {title: 'Panel', keys: ['hover-open']},
] as const;

export type SettingKey = keyof typeof SETTINGS;


// Advanced filtering only works while Tier search is on.
export const isAdvancedFilteringOn = (): boolean => isEnabled('tier-search') && isEnabled('advanced-filtering');

export const isEnabled = (key: SettingKey): boolean => {
  const stored = local.get(`setting-${key}`);
  if (stored === 'on') return true;
  if (stored === 'off') return false;

  return SETTINGS[key].defaultOn;
};

export const setEnabled = (key: SettingKey, enabled: boolean): void => {
  local.set(`setting-${key}`, enabled ? 'on' : 'off');
  emit('settings-change');
};
