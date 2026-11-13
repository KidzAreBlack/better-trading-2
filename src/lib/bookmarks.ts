import {local, storage} from './ext';
import {searchKey} from './search-link';
import {base64Decode, base64Encode, emit, uniqueId} from './util';
import type {TradeSiteVersion} from './trade-location';

// Same data shapes and storage keys as the original Better Trading.
export interface BookmarkLocation {
  version: TradeSiteVersion;
  type: string;
  slug: string;
}

export interface BookmarkTrade {
  id?: string;
  title: string;
  location: BookmarkLocation;
  completedAt: string | null;
}

export interface BookmarkFolder {
  id?: string;
  title: string;
  version: TradeSiteVersion;
  icon: string | null;
  archivedAt: string | null;
}

const FOLDERS_KEY = 'bookmark-folders';
const TRADES_KEY = 'bookmark-trades';
const EXPANSION_KEY = 'bookmark-folders-expansion';

// Icons offered for folders: currency/item icons, and ascendancies grouped by class.
export const FOLDER_ICONS: Record<TradeSiteVersion, {items: string[]; ascendancies: string[][]}> = {
  '1': {
    items: ['alchemy', 'chaos', 'exalt', 'divine', 'mirror', 'card', 'essence', 'fossil', 'map', 'scarab'],
    ascendancies: [
      ['slayer', 'gladiator', 'champion'],
      ['assassin', 'saboteur', 'trickster'],
      ['juggernaut', 'berserker', 'chieftain'],
      ['necromancer', 'elementalist', 'occultist'],
      ['deadeye', 'raider', 'pathfinder'],
      ['guardian', 'hierophant', 'inquisitor'],
      ['ascendant'],
    ],
  },
  '2': {
    items: [
      'poe2-alchemy', 'poe2-annul', 'poe2-artificer', 'poe2-augment', 'poe2-chance', 'poe2-chaos', 'poe2-divine',
      'poe2-essence', 'poe2-exalt', 'poe2-gemcutter', 'poe2-glassblower', 'poe2-mirror', 'poe2-regal', 'poe2-rune',
      'poe2-transmute', 'poe2-vaal', 'poe2-waystone', 'poe2-wisdom',
    ],
    ascendancies: [
      ['poe2-titan', 'poe2-warbringer', 'poe2-smith-of-kitava'],
      ['poe2-chronomancer', 'poe2-stormweaver'],
      ['poe2-deadeye', 'poe2-pathfinder'],
      ['poe2-ritualist', 'poe2-amazon'],
      ['poe2-invoker', 'poe2-acolyte-of-chayula'],
      ['poe2-witch-hunter', 'poe2-gemling-legionnaire', 'poe2-tactician'],
      ['poe2-infernalist', 'poe2-blood-mage', 'poe2-lich'],
    ],
  },
};

// ---- Folders and trades ------------------------------------------------------

export const fetchFolders = async (): Promise<BookmarkFolder[]> => {
  const folders = (await storage.get<Partial<BookmarkFolder>[]>(FOLDERS_KEY)) || [];

  return folders.map((folder) => ({version: '1', icon: null, title: '', archivedAt: null, ...folder}));
};

export const fetchTrades = async (folderId: string): Promise<BookmarkTrade[]> => {
  const trades = (await storage.get<BookmarkTrade[]>(`${TRADES_KEY}--${folderId}`)) || [];

  return trades.map((trade) => ({...trade, location: {...trade.location, version: trade.location.version || '1'}}));
};

export const saveFolders = async (folders: BookmarkFolder[]): Promise<void> => {
  await storage.set(FOLDERS_KEY, folders);
  emit('bookmarks-change');
};

export const saveTrades = async (trades: BookmarkTrade[], folderId: string): Promise<void> => {
  await storage.set(
    `${TRADES_KEY}--${folderId}`,
    trades.map((trade) => ({...trade, id: trade.id || uniqueId()}))
  );
  emit('bookmarks-change');
};

export const saveFolder = async (folder: BookmarkFolder, options: {moveToEnd?: boolean} = {}): Promise<string> => {
  const folders = await fetchFolders();
  const id = folder.id || uniqueId();
  let updated: BookmarkFolder[];

  if (!folder.id) {
    updated = [...folders, {...folder, id}];
  } else {
    updated = folders.map((existing) => (existing.id === id ? {...existing, ...folder} : existing));
    if (options.moveToEnd) updated = [...updated.filter((f) => f.id !== id), ...updated.filter((f) => f.id === id)];
  }

  await saveFolders(updated);

  return id;
};

export const saveTrade = async (trade: BookmarkTrade, folderId: string): Promise<void> => {
  const trades = await fetchTrades(folderId);
  const updated = trade.id
    ? trades.map((existing) => (existing.id === trade.id ? {...existing, ...trade} : existing))
    : [...trades, {...trade, id: uniqueId()}];

  await saveTrades(updated, folderId);
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await storage.remove(`${TRADES_KEY}--${folderId}`);
  await saveFolders((await fetchFolders()).filter((folder) => folder.id !== folderId));
};

export const deleteTrade = async (tradeId: string, folderId: string): Promise<void> => {
  await saveTrades((await fetchTrades(folderId)).filter((trade) => trade.id !== tradeId), folderId);
};

export const findTradeByLocation = async (location: {
  version: TradeSiteVersion;
  type: string | null;
  slug: string | null;
}): Promise<BookmarkTrade | null> => {
  if (!location.type || !location.slug) return null;

  const folders = await fetchFolders();
  const active: BookmarkTrade[] = [];
  const archived: BookmarkTrade[] = [];
  // Bookmarks are saved without a trade mode, so compare the searches with the mode left out.
  const target = await searchKey(location.slug);

  for (const folder of folders) {
    if (!folder.id) continue;

    const matches: BookmarkTrade[] = [];
    for (const trade of await fetchTrades(folder.id)) {
      if (trade.location.version !== location.version || trade.location.type !== location.type) continue;
      if (trade.location.slug === location.slug || (await searchKey(trade.location.slug)) === target) matches.push(trade);
    }
    (folder.archivedAt ? archived : active).push(...matches);
  }

  const candidates = active.length ? active : archived;
  candidates.sort((a, b) => a.title.localeCompare(b.title));

  return candidates[0] || null;
};

// ---- Which folders are open (per browser) -------------------------------------

export const getExpandedFolderIds = (): string[] => (local.get(EXPANSION_KEY) || '').split(',').filter(Boolean);

export const setExpandedFolderIds = (ids: string[]): void => local.set(EXPANSION_KEY, ids.join(','));

// ---- Export / import of one folder (same string format as the original) -------

interface ExportedFolder {
  icn: string | null;
  tit: string;
  ver?: TradeSiteVersion;
  trs: {tit: string; loc: string}[];
}

export const serializeFolder = (folder: BookmarkFolder, trades: BookmarkTrade[]): string => {
  const payload: ExportedFolder = {
    icn: folder.icon,
    tit: folder.title,
    ver: folder.version,
    trs: trades.map((trade) => ({
      tit: trade.title,
      loc: `${trade.location.version}:${trade.location.type}:${trade.location.slug}`,
    })),
  };

  return `3:${base64Encode(JSON.stringify(payload))}`;
};

export const deserializeFolder = (serialized: string): [BookmarkFolder, BookmarkTrade[]] | null => {
  try {
    const text = serialized.trim();
    const exportVersion = text.startsWith('3:') ? 3 : text.startsWith('2:') ? 2 : 1;
    const payload: ExportedFolder = JSON.parse(exportVersion >= 2 ? base64Decode(text.slice(2)) : atob(text));

    const folder: BookmarkFolder = {
      version: exportVersion >= 3 && payload.ver ? payload.ver : '1',
      icon: payload.icn || null,
      title: payload.tit,
      archivedAt: null,
    };

    const trades: BookmarkTrade[] = payload.trs.map((trade) => {
      const parts = trade.loc.split(':');
      const [version, type, slug] = exportVersion >= 3 ? parts : ['1', ...parts];

      return {title: trade.tit, completedAt: null, location: {version: version as TradeSiteVersion, type, slug}};
    });

    if (typeof folder.title !== 'string') return null;

    return [folder, trades];
  } catch (_error) {
    return null;
  }
};

// ---- Backup file of every folder (same file format as the original) -----------

const SECTION_DELIMITER = '\n--------------------\n';

export const generateBackup = async (): Promise<string> => {
  const active: string[] = [];
  const archived: string[] = [];

  for (const folder of await fetchFolders()) {
    if (!folder.id) continue;
    (folder.archivedAt ? archived : active).push(serializeFolder(folder, await fetchTrades(folder.id)));
  }

  return [active.join('\n'), archived.join('\n')].join(SECTION_DELIMITER);
};

export const restoreBackup = async (data: string): Promise<number> => {
  const [activeSection = '', archivedSection = ''] = data.replace(/\r\n/g, '\n').split(SECTION_DELIMITER);
  let restored = 0;

  const restore = async (section: string, archivedAt: string | null) => {
    for (const line of section.split('\n').filter(Boolean)) {
      const result = deserializeFolder(line);
      if (!result) continue;

      const [folder, trades] = result;
      const folderId = await saveFolder({...folder, archivedAt});
      await saveTrades(trades, folderId);
      restored++;
    }
  };

  await restore(activeSection, null);
  await restore(archivedSection, new Date().toUTCString());

  return restored;
};
