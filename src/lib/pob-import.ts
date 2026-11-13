// "Add build": turns a Path of Building build (a PoB code or a pobb.in link) into a bookmark
// folder with one trade search per item the build wears.
//
// How it works:
// - The PoB code is base64url text of zlib-compressed XML. Items are plain text blocks.
// - Each item's mod lines are matched to the trade site's own stat list
//   (/api/trade/data/stats, the same list the "+ Add Stat Filter" box uses).
// - Searches are saved without a trade mode (In Person / Instant Buyout), so they open in
//   whichever mode you are using.
// - The trade site now stores a whole search inside its links (gzip + base64url of the
//   search JSON), so each search link is built right here: no searches are sent to the
//   trade site and the rate limit is never touched.
import type {BookmarkFolder, BookmarkTrade} from './bookmarks';
import {FOLDER_ICONS} from './bookmarks';
import {sendMessage} from './ext';
import type {TradeSiteVersion} from './trade-location';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

// ---- Reading the build -------------------------------------------------------------

const decodeBase64Url = (text: string): Uint8Array => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const transform = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

const POBB_LINK = /pobb\.in\/(?:u\/[^/\s]+\/)?([A-Za-z0-9_-]{6,})/;

// A pasted PoB code, or a pobb.in link (fetched by the background script).
export const readBuildCode = async (input: string): Promise<string | null> => {
  const text = input.trim();
  const link = POBB_LINK.exec(text);
  if (link) return sendMessage<string>({query: 'pobb-in', id: link[1]});
  return /^[A-Za-z0-9_\-+/=\s]{20,}$/.test(text) ? text : null;
};

export const decodeBuild = async (code: string): Promise<Document | null> => {
  try {
    const xml = new TextDecoder().decode(await transform(decodeBase64Url(code), new DecompressionStream('deflate')));
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return doc.querySelector('PathOfBuilding, PathOfBuilding2') || doc.querySelector('Build') ? doc : null;
  } catch (_error) {
    return null;
  }
};

export interface BuildItem {
  slot: string;
  rarity: string;
  name: string;
  base: string;
  implicits: string[];
  explicits: string[];
}

// Slots in the order they appear in the folder. Weapon swap slots are left out.
const SLOT_ORDER = ['Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Ring 3', 'Belt'];
const slotRank = (slot: string) => {
  const index = SLOT_ORDER.indexOf(slot);
  if (index >= 0) return index;
  if (slot.startsWith('Flask') || slot.startsWith('Charm')) return 20 + parseInt(slot.replace(/\D+/g, '') || '0', 10);
  if (slot.includes('Abyssal')) return 40;
  return 50; // tree jewels
};

const parseItem = (slot: string, text: string): BuildItem | null => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const rarityLine = lines.find((line) => line.startsWith('Rarity:'));
  if (!rarityLine) return null;
  const rarity = rarityLine.slice(7).trim().toUpperCase();
  const start = lines.indexOf(rarityLine) + 1;
  const name = lines[start] || '';
  const base = rarity === 'RARE' || rarity === 'UNIQUE' ? lines[start + 1] || '' : name;

  const implicitsAt = lines.findIndex((line) => line.startsWith('Implicits:'));
  const implicitCount = implicitsAt >= 0 ? parseInt(lines[implicitsAt].slice(10), 10) || 0 : 0;
  const modLines = implicitsAt >= 0 ? lines.slice(implicitsAt + 1) : [];

  // Uniques with several versions list every version's lines, tagged {variant:1,2}; only the
  // version picked in Path of Building ("Selected Variant", and "Selected Alt Variant") counts.
  const selected = new Set(
    lines.filter((line) => /^Selected (Alt )?Variant:/.test(line)).map((line) => line.replace(/^Selected (Alt )?Variant:/, '').trim())
  );
  const isActive = (line: string) => {
    const variants = /\{variant:([\d,]+)\}/.exec(line);
    return !variants || !selected.size || variants[1].split(',').some((variant) => selected.has(variant));
  };

  return {
    slot,
    rarity,
    name,
    base: base.replace(/^(Superior|Synthesised)\s+/, ''),
    implicits: modLines.slice(0, implicitCount).filter(isActive),
    explicits: modLines.slice(implicitCount).filter(isActive),
  };
};

export interface Build {
  className: string;
  ascendancy: string;
  level: string;
  items: BuildItem[];
}

export interface ItemSetChoice {
  id: string;
  title: string;
}

// The build's item sets ("Leveling", "Endgame"...), and the one the build has selected.
export const listItemSets = (doc: Document): {sets: ItemSetChoice[]; active: string} => {
  const itemsNode = doc.querySelector('Items');
  const sets = Array.from(itemsNode?.querySelectorAll(':scope > ItemSet') || []).map((set, index) => {
    const id = set.getAttribute('id') || String(index + 1);
    return {id, title: (set.getAttribute('title') || '').trim() || `Item set ${id}`};
  });
  const active = itemsNode?.getAttribute('activeItemSet') || sets[0]?.id || '1';
  return {sets, active};
};

export const readBuild = (doc: Document, setId?: string): Build => {
  const build = doc.querySelector('Build');
  const itemsNode = doc.querySelector('Items');
  const byId = new Map<string, string>();
  itemsNode?.querySelectorAll(':scope > Item').forEach((item) => byId.set(item.getAttribute('id') || '', item.textContent || ''));

  // The chosen item set (the build's own choice by default), or the slots listed directly
  // under <Items> in older builds.
  const wanted = setId || itemsNode?.getAttribute('activeItemSet') || '1';
  const set = itemsNode?.querySelector(`ItemSet[id="${wanted}"]`) || itemsNode?.querySelector('ItemSet') || itemsNode;
  const slots: [string, string][] = [];
  set?.querySelectorAll(':scope > Slot').forEach((slot) => {
    const name = slot.getAttribute('name') || '';
    const id = slot.getAttribute('itemId') || '0';
    if (id !== '0' && !/Swap/.test(name)) slots.push([name, id]);
  });

  // Jewels socketed in the active passive tree.
  const tree = doc.querySelector('Tree');
  const specs = tree ? Array.from(tree.querySelectorAll(':scope > Spec')) : [];
  const spec = specs[parseInt(tree?.getAttribute('activeSpec') || '1', 10) - 1] || specs[0];
  spec?.querySelectorAll('Sockets > Socket').forEach((socket) => {
    const id = socket.getAttribute('itemId') || '0';
    if (id !== '0') slots.push(['Jewel', id]);
  });

  const items = slots
    .map(([slot, id]) => parseItem(slot, byId.get(id) || ''))
    .filter((item): item is BuildItem => item !== null)
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot));

  return {
    className: build?.getAttribute('className') || '',
    ascendancy: build?.getAttribute('ascendClassName') || '',
    level: build?.getAttribute('level') || '',
    items,
  };
};

// ---- Matching mods to trade stats ---------------------------------------------------

interface StatEntry {
  id: string;
  text: string;
}
type StatIndex = Map<string, Map<string, StatEntry[]>>; // group -> normalised text -> entries

// The page's own fetch, so requests count as the trade site's (needed in Firefox).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pageFetch: typeof fetch = (input, init) => ((globalThis as any).content?.fetch ?? fetch)(input, init);

const apiBase = (version: TradeSiteVersion) => `https://www.pathofexile.com/api/${version === '2' ? 'trade2' : 'trade'}/data`;

export const loadStatIndex = async (version: TradeSiteVersion): Promise<StatIndex> => {
  const payload: Json = await (await pageFetch(`${apiBase(version)}/stats`)).json();
  const index: StatIndex = new Map();
  for (const group of payload.result || []) {
    const texts = new Map<string, StatEntry[]>();
    for (const entry of group.entries || []) {
      const key = String(entry.text).toLowerCase();
      texts.set(key, [...(texts.get(key) || []), {id: entry.id, text: entry.text}]);
    }
    index.set(group.id, texts);
  }
  return index;
};

export interface ItemData {
  bases: Map<string, string>; // every real base type, with its group (weapon, armour, accessory...)
  uniques: Set<string>; // every real unique name
}

export const loadItemData = async (version: TradeSiteVersion): Promise<ItemData> => {
  const payload: Json = await (await pageFetch(`${apiBase(version)}/items`)).json();
  const data: ItemData = {bases: new Map(), uniques: new Set()};
  for (const group of payload.result || []) {
    for (const entry of group.entries || []) {
      if (entry.name) data.uniques.add(entry.name);
      else if (entry.type) data.bases.set(entry.type, group.id);
    }
  }
  return data;
};

const NUMBER = /\d+(?:\.\d+)?/g;

interface ModMatch {
  id: string;
  value: number | null;
}

// "{crafted}{range:0.5}+42 to maximum Life" -> the stat filter for it, with its value.
const matchMod = (rawLine: string, preferred: string, index: StatIndex, isLocalItem: boolean): ModMatch | null => {
  const tags = (rawLine.match(/\{[^}]*\}/g) || []).map((tag) => tag.slice(1, -1).split(':')[0]);
  const line = rawLine
    .split('\n')
    .map((part) =>
      part
        .replace(/\{[^}]*\}/g, '')
        // Unrolled items show ranges, "+(30-50) to Dexterity": use the low end.
        .replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g, '$1')
        .trim()
    )
    .join('\n');
  if (!line || /^(Corrupted|Mirrored|Split|Unidentified|.* Item)$/m.test(line)) return null;

  // PoB tags cluster jewel enchants as {crafted}, so crafted lines also look in "enchant".
  const first = tags.includes('crafted') ? ['crafted', 'enchant'] : tags.includes('fractured') ? ['fractured'] : tags.includes('enchant') ? ['enchant'] : [preferred];
  const order = [...first, 'explicit', 'implicit', 'enchant', 'crafted', 'fractured'].filter((name, i, all) => all.indexOf(name) === i);

  const attempt = (text: string, sign: number): ModMatch | null => {
    const numbers = (text.match(NUMBER) || []).map(Number);
    const key = text.replace(NUMBER, '#').toLowerCase();
    for (const name of order) {
      const entries = index.get(name)?.get(key) || [];
      const local = isLocalItem ? index.get(name)?.get(`${key} (local)`) : undefined;
      const entry = (local && local[0]) || entries[0];
      if (entry) {
        const value = numbers.length ? (numbers.reduce((sum, n) => sum + n, 0) / numbers.length) * sign : null;
        return {id: entry.id, value};
      }
      // Some stats are written out in full, numbers included ("1 Added Passive Skill is Arcing Shot").
      const exact = index.get(name)?.get(text.toLowerCase());
      if (exact && exact[0]) return {id: exact[0].id, value: null};
    }
    return null;
  };

  return (
    attempt(line, 1) ||
    // "Bow Attacks fire an additional Arrow" is listed as "Bow Attacks fire # additional Arrows".
    (/\ban additional \w+/.test(line) ? attempt(line.replace(/\ban additional (\w+)/, '1 additional $1s'), 1) : null) ||
    // The trade site writes some counts in the singular ("Gain # Charge when you are Hit").
    (/\bCharges\b/.test(line) ? attempt(line.replace(/\bCharges\b/g, 'Charge'), 1) : null) ||
    // The trade site lists "reduced"/"less" mods as negative "increased"/"more" ones.
    (/\breduced\b/.test(line) ? attempt(line.replace(/\breduced\b/, 'increased'), -1) : null) ||
    (/\bless\b/.test(line) ? attempt(line.replace(/\bless\b/, 'more'), -1) : null)
  );
};

// ---- Building the searches ------------------------------------------------------------

// Builds often use example items: a made-up rare name, an invented base or a placeholder unique.
// Rare names are never searched for. An unknown base falls back to the slot's item type, and an
// unknown unique is searched by its mods like a rare.
const SLOT_FALLBACKS: Record<string, string> = {'Weapon 1': 'weapon', Jewel: 'jewel'};

const SLOT_CATEGORIES: Record<string, string> = {
  Helmet: 'armour.helmet',
  'Body Armour': 'armour.chest',
  Gloves: 'armour.gloves',
  Boots: 'armour.boots',
  Amulet: 'accessory.amulet',
  'Ring 1': 'accessory.ring',
  'Ring 2': 'accessory.ring',
  'Ring 3': 'accessory.ring',
  Belt: 'accessory.belt',
};

// Finds the base type inside a magic item's name ("Seething Divine Life Flask of Staunching").
const findBase = (name: string, bases: Map<string, string>): string | null => {
  let best: string | null = null;
  for (const base of bases.keys()) if (name.includes(base) && (!best || base.length > best.length)) best = base;
  return best;
};

export interface BuiltSearch {
  title: string;
  query: Json;
  matched: number;
  skipped: number;
}

export const buildSearch = (item: BuildItem, index: StatIndex, data: ItemData, minPercent: number): BuiltSearch | null => {
  const {bases} = data;
  const label = item.slot.replace(/ \d+$/, '').replace(/ Abyssal Socket$/, ' jewel');
  const isRealUnique = item.rarity === 'UNIQUE' && data.uniques.has(item.name);


  const base = item.rarity === 'MAGIC' ? findBase(item.name, bases) : item.base;
  const isRealBase = Boolean(base && bases.has(base));
  const group = isRealBase ? bases.get(base as string) : undefined;
  const category = SLOT_CATEGORIES[item.slot] || (isRealBase ? undefined : SLOT_FALLBACKS[item.slot.includes('Abyssal') ? 'Jewel' : item.slot]);
  const isLocalItem = group === 'weapon' || group === 'armour';

  const filters: Json[] = [];
  let skipped = 0;
  const add = (lines: string[], preferred: string) => {
    for (let i = 0; i < lines.length; ) {
      // Some mods span two or three lines (flask immunities: "Grants Immunity to Bleeding... /
      // Grants Immunity to Corrupted Blood..."). The trade site lists those as one stat, so try
      // the lines together first.
      let used = 1;
      let match: ModMatch | null = null;
      for (const count of [3, 2]) {
        if (i + count > lines.length) continue;
        match = matchMod(lines.slice(i, i + count).join('\n'), preferred, index, isLocalItem);
        if (match) {
          used = count;
          break;
        }
      }
      match = match || matchMod(lines[i], preferred, index, isLocalItem);
      const line = lines[i];
      i += used;

      if (!match) {
        if (!/^(Corrupted|Mirrored|Split|.* Item)$/.test(line.replace(/\{[^}]*\}/g, '').trim())) skipped++;
        continue;
      }
      if (filters.some((filter) => filter.id === match!.id)) continue;
      // Uniques: just "has this mod", no values, so any roll of that version matches.
      // Others: small counts (+1 gem level, 2 extra arrows) stay exact; other values use the chosen %.
      const min =
        isRealUnique || match.value === null || match.value <= 0
          ? undefined
          : match.value <= 3
            ? Math.floor(match.value)
            : Math.floor((match.value * minPercent) / 100);
      filters.push(min !== undefined && min > 0 ? {id: match.id, value: {min}} : {id: match.id});
    }
  };
  if (isRealUnique) {
    // A unique's own mods tell its versions apart. Its implicits come from the base, and
    // crafted or enchanted lines were added by the player, so those are left out.
    add(item.explicits.filter((line) => !/\{(crafted|enchant)\}/.test(line)), 'explicit');
    const query: Json = {name: item.name, type: item.base};
    if (filters.length) query.stats = [{type: 'and', filters}];
    return {title: `${label}: ${item.name}`, query, matched: filters.length, skipped};
  }

  add(item.implicits, 'implicit');
  add(item.explicits, 'explicit');

  // A placeholder unique ("any unique with these mods") is searched without the rarity limit.
  const typeFilters: Json = item.rarity === 'UNIQUE' ? {} : {rarity: {option: 'nonunique'}};
  const query: Json = {stats: [{type: 'and', filters}], filters: {type_filters: {filters: typeFilters}}};
  // Armour and jewellery: search the whole category (any base) so more items show up.
  // Weapons, shields, quivers, jewels and flasks: keep the exact base type.
  if (category) typeFilters.category = {option: category};
  else if (isRealBase) query.type = base;

  if (!filters.length && !query.type && !category) return null;

  const shownBase = isRealBase ? base : `${item.base || 'unknown base'}, any base`;
  const name =
    item.rarity === 'UNIQUE'
      ? `${item.name} (not a real unique, searched by mods)`
      : item.rarity === 'RARE'
        ? `${item.name} (${shownBase})`
        : isRealBase
          ? (base as string)
          : item.name;
  return {title: `${label}: ${name}`, query, matched: filters.length, skipped};
};

// The trade site's link format: gzip of the search JSON, in base64url.
export const searchSlug = async (query: Json): Promise<string> =>
  encodeBase64Url(await transform(new TextEncoder().encode(JSON.stringify(query)), new CompressionStream('gzip')));

const folderIcon = (version: TradeSiteVersion, ascendancy: string): string | null => {
  if (!ascendancy) return null;
  // Compared without hyphens, so "Witchhunter" finds the "witch-hunter" icon.
  const key = ascendancy.toLowerCase().replace(/[^a-z]+/g, '');
  const icons = FOLDER_ICONS[version].ascendancies.flat();
  return icons.find((icon) => icon.replace(/^poe2-/, '').replace(/-/g, '') === key) || null;
};

export interface ImportedBuild {
  folder: BookmarkFolder;
  trades: BookmarkTrade[];
  skippedMods: number;
}

// Step 1: read the pasted code or pobb.in link. Returns the build, or a message to show.
export const loadBuild = async (input: string): Promise<Document | string> => {
  const code = await readBuildCode(input);
  if (!code) return 'Paste a Path of Building code or a pobb.in link.';
  const doc = await decodeBuild(code);
  return doc || 'That doesn\u2019t look like a Path of Building build.';
};

// Step 2: make the folder and its searches from the chosen item set.
export const createBuildFolder = async (doc: Document, version: TradeSiteVersion, minPercent: number, setId?: string): Promise<ImportedBuild | string> => {
  const build = readBuild(doc, setId);
  if (!build.items.length) return 'This item set has no equipped items.';

  let index: StatIndex;
  let data: ItemData;
  try {
    [index, data] = await Promise.all([loadStatIndex(version), loadItemData(version)]);
  } catch (_error) {
    return 'Could not load the trade site\u2019s stat list. Reload the page and try again.';
  }

  const trades: BookmarkTrade[] = [];
  let skippedMods = 0;
  for (const item of build.items) {
    const search = buildSearch(item, index, data, minPercent);
    if (!search) continue;
    skippedMods += search.skipped;
    trades.push({title: search.title, completedAt: null, location: {version, type: 'search', slug: await searchSlug(search.query)}});
  }

  // Name the set in the folder title when the build has more than one.
  const {sets, active} = listItemSets(doc);
  const setTitle = sets.length > 1 ? sets.find((set) => set.id === (setId || active))?.title : undefined;
  const who = build.ascendancy && build.ascendancy !== 'None' ? build.ascendancy : build.className || 'Build';
  const title = `${who}${build.level ? ` (level ${build.level})` : ''}${setTitle ? ` \u2013 ${setTitle}` : ''}`;

  return {folder: {title, version, icon: folderIcon(version, build.ascendancy), archivedAt: null}, trades, skippedMods};
};
