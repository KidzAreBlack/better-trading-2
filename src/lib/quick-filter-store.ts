// Saved Quick filter presets. Kept here, apart from the bar, so backups can include them.
import {storage} from './ext';
import type {TradeSiteVersion} from './trade-location';
import {emit} from './util';

const STORAGE_KEY = 'quick-filters';

export interface QuickFilter {
  id: string;
  version: TradeSiteVersion;
  label: string;
  group: string; // misc_filters
  filter: string; // corrupted
  value: {option?: string | null; min?: number; max?: number};
  valueText: string; // "No", "80+", shown on the button
  yesNo?: boolean; // a Yes / No filter: shown with its own ✗ (No) and ✓ (Yes) buttons
  stats?: QuickStat[]; // a set of stats instead of a filter: shown with − and + buttons
}

export interface QuickStat {
  id: string; // pseudo.pseudo_total_life
  text: string; // +# total maximum Life
  min?: number;
  max?: number;
}

export const fetchQuickFilters = async (): Promise<QuickFilter[]> => (await storage.get<QuickFilter[]>(STORAGE_KEY)) || [];

export const saveQuickFilters = async (filters: QuickFilter[]): Promise<void> => {
  await storage.set(STORAGE_KEY, filters);
  emit('quick-filters-change');
};

// Enough of a preset to show and use it: anything else in a backup file is left out.
export const isQuickFilter = (value: unknown): value is QuickFilter => {
  const filter = value as QuickFilter;
  if (!filter || typeof filter !== 'object') return false;
  if (typeof filter.id !== 'string' || typeof filter.label !== 'string' || (filter.version !== '1' && filter.version !== '2')) return false;
  if (filter.stats !== undefined) return Array.isArray(filter.stats) && filter.stats.every((stat) => stat && typeof stat.id === 'string' && typeof stat.text === 'string');
  return typeof filter.group === 'string' && typeof filter.filter === 'string' && Boolean(filter.value) && typeof filter.value === 'object';
};
