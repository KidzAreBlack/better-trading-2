import {local} from './ext';
import {emit} from './util';

// Options shown in the Settings tab. `defaultOn` decides the first-time state.
export const SETTINGS = {
  // Settings tab
  'fuzzy-search': {label: 'Fuzzy search', defaultOn: false},
  'tier-search': {label: 'Tier search', defaultOn: false},
  // Sub-option of Tier search: the result filter box, Load all / Next 100, and the link from the tier picker.
  'advanced-filtering': {label: 'Advanced filtering', defaultOn: false},
  'highlight-stat-filters': {label: 'Highlight searched mods', defaultOn: true},
  'default-non-unique': {label: 'Item rarity starts on Any Non-Unique', defaultOn: false},
  'hover-open': {label: 'Open the hidden panel by hovering its icon', defaultOn: false},
  // "Enabled item result enhancers" on the About page
  'equivalent-pricings': {label: 'Equivalent pricings (powered by poe.ninja)', defaultOn: true},
  'maximum-sockets': {label: 'Warning for armors that cannot be 6-socketed', defaultOn: true},
  'regroup-similars': {label: 'Regroup similar results', defaultOn: true},
} as const;

export const SETTINGS_TAB_KEYS = ['fuzzy-search', 'tier-search', 'highlight-stat-filters', 'default-non-unique', 'hover-open'] as const;
export const ENHANCER_KEYS = ['equivalent-pricings', 'maximum-sockets', 'regroup-similars'] as const;

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
