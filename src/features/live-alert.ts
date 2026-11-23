// Live search alerts: a sound, and optionally a desktop notification, when a live search
// finds new items. Only new items the site adds above the ones already shown count, so the
// first results and "Load more" don't set it off. One alert per batch of new items.

import {findTradeByLocation} from '../lib/bookmarks';
import {local, sendMessage, storage} from '../lib/ext';
import {onPageChange} from '../lib/page-watch';
import {isEnabled} from '../lib/settings';
import {currentLocation} from '../lib/trade-location';
import {emit, on} from '../lib/util';

const ROWS = '.resultset > div.row[data-id]';
const BATCH_MS = 400;

// "site" is the trade site's own live search sound (picked in the site's Settings): the
// default, played by the site itself. Choosing any other sound mutes the site's one, so
// only one plays. Built-in sounds; your own are "custom:<id>". A bookmark can also be
// silent ("none").
const SITE_SOUND = 'site';
const BUILT_IN_SOUNDS = {chime: 'Chime', ding: 'Ding', beep: 'Beep'} as const;
type BuiltIn = keyof typeof BUILT_IN_SOUNDS;
export type SoundChoice = string;

const CHOICE_KEY = 'live-alert-sound-choice';
const VOLUME_KEY = 'live-alert-volume';
const LIBRARY_KEY = 'live-alert-custom-sounds';
const OLD_CUSTOM_KEY = 'live-alert-custom-sound'; // the single custom sound of the first version
const MAX_CUSTOM_BYTES = 1024 * 1024;
export const NO_SOUND = 'none';

export interface CustomSound {
  id: string;
  name: string;
  data: string; // base64
}

const isBuiltIn = (choice: string): choice is BuiltIn => choice in BUILT_IN_SOUNDS;
const customId = (choice: string) => (choice.startsWith('custom:') ? choice.slice(7) : null);

// ---- Your own sounds ---------------------------------------------------------------------

// Kept in the extension's storage, so they still play if the original files are moved or deleted.
export const getCustomSounds = async (): Promise<CustomSound[]> => {
  const library = await storage.get<CustomSound[]>(LIBRARY_KEY);
  if (library) return library;
  const old = await storage.get<{name: string; data: string}>(OLD_CUSTOM_KEY);
  if (!old) return [];
  const migrated = [{id: 'first', name: old.name.replace(/\.[^.]+$/, ''), data: old.data}];
  await storage.set(LIBRARY_KEY, migrated);
  await storage.remove(OLD_CUSTOM_KEY);
  return migrated;
};

const saveCustomSounds = async (sounds: CustomSound[]) => {
  await storage.set(LIBRARY_KEY, sounds);
  emit('live-alert-change');
};

export const addCustomSound = async (file: File): Promise<string | null> => {
  if (file.size > MAX_CUSTOM_BYTES) return 'That file is over 1 MB. Pick a shorter sound.';
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const sound: CustomSound = {id: Date.now().toString(36), name: file.name.replace(/\.[^.]+$/, '') || 'My sound', data: btoa(binary)};
  // Make sure it can be played before keeping it.
  if (!(await decodeCustom(sound))) return 'That file could not be played. Use an mp3, wav or ogg file.';
  await saveCustomSounds([...(await getCustomSounds()), sound]);
  return null;
};

export const renameCustomSound = async (id: string, name: string): Promise<void> => {
  await saveCustomSounds((await getCustomSounds()).map((sound) => (sound.id === id ? {...sound, name: name.trim() || sound.name} : sound)));
};

export const removeCustomSound = async (id: string): Promise<void> => {
  decodedCache.delete(id);
  if (getSoundChoice() === `custom:${id}`) local.set(CHOICE_KEY, null);
  await saveCustomSounds((await getCustomSounds()).filter((sound) => sound.id !== id));
};

// Every sound to pick from: built-in ones, then yours.
export const listSounds = async (): Promise<{value: string; label: string}[]> => [
  {value: SITE_SOUND, label: 'Trade site\u2019s sound'},
  ...Object.entries(BUILT_IN_SOUNDS).map(([value, label]) => ({value, label})),
  ...(await getCustomSounds()).map((sound) => ({value: `custom:${sound.id}`, label: sound.name})),
];

const soundLabel = async (choice: string): Promise<string> =>
  choice === NO_SOUND ? 'No sound' : (await listSounds()).find((sound) => sound.value === choice)?.label || 'Trade site\u2019s sound';

// ---- Default sound and volume -------------------------------------------------------------

export const getSoundChoice = (): SoundChoice => {
  const stored = local.get(CHOICE_KEY);
  if (stored === 'custom') return 'custom:first'; // the first version's single custom sound
  return stored && (stored === SITE_SOUND || isBuiltIn(stored) || customId(stored)) ? stored : SITE_SOUND;
};

export const setSoundChoice = (choice: SoundChoice): void => {
  local.set(CHOICE_KEY, choice);
  emit('live-alert-change');
};

export const getVolume = (): number => {
  const stored = parseInt(local.get(VOLUME_KEY) || '', 10);
  return Number.isFinite(stored) ? Math.min(100, Math.max(0, stored)) : 70;
};

export const setVolume = (volume: number): void => {
  local.set(VOLUME_KEY, String(Math.round(volume)));
  emit('live-alert-change');
};

// ---- Playing -------------------------------------------------------------------------------

let context: AudioContext | null = null;
const decodedCache = new Map<string, AudioBuffer>();

const audio = (): AudioContext | null => {
  const Context = window.AudioContext || (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Context) return null;
  context = context || new Context();
  return context;
};

const decodeCustom = async (sound: CustomSound): Promise<AudioBuffer | null> => {
  const cached = decodedCache.get(sound.id);
  if (cached) return cached;
  const ctx = audio();
  if (!ctx) return null;
  try {
    const bytes = Uint8Array.from(atob(sound.data), (char) => char.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    decodedCache.set(sound.id, buffer);
    return buffer;
  } catch (_error) {
    return null;
  }
};

// The built-in sounds are made on the spot, so no sound files ship with the extension.
const TONES: Record<BuiltIn, {wave: OscillatorType; notes: [number, number, number][]; level: number}> = {
  // [frequency, start, length] in Hz and seconds
  chime: {wave: 'sine', notes: [[880, 0, 0.35], [1320, 0.12, 0.5]], level: 0.6},
  ding: {wave: 'triangle', notes: [[1046, 0, 0.8]], level: 0.7},
  beep: {wave: 'square', notes: [[660, 0, 0.1], [660, 0.16, 0.1]], level: 0.15},
};

export const playAlertSound = async (choice: SoundChoice = getSoundChoice(), volume = getVolume()): Promise<boolean> => {
  if (choice === SITE_SOUND) {
    // The site's own sound, as set in its Settings (for the Test buttons).
    window.dispatchEvent(new CustomEvent('bt-site-sound', {detail: JSON.stringify({test: true})}));
    return true;
  }
  const ctx = audio();
  if (!ctx || volume <= 0 || choice === NO_SOUND) return false;
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

  const output = ctx.createGain();
  output.gain.value = volume / 100;
  output.connect(ctx.destination);

  const id = customId(choice);
  if (id) {
    const sound = (await getCustomSounds()).find((custom) => custom.id === id);
    const buffer = sound ? await decodeCustom(sound) : null;
    if (!buffer) return playAlertSound('chime', volume); // a removed sound: the default chime
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(output);
    source.start();
    return true;
  }

  const {wave, notes, level} = TONES[isBuiltIn(choice) ? choice : 'chime'];
  const now = ctx.currentTime;
  for (const [frequency, start, length] of notes) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(level, now + start);
    envelope.gain.exponentialRampToValueAtTime(0.001, now + start + length);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(now + start);
    oscillator.stop(now + start + length);
  }
  return true;
};

// ---- Watching the live search ----------------------------------------------------------

const rowSummary = (row: Element): string => {
  const name = [row.querySelector('.itemName')?.textContent, row.querySelector('.typeLine')?.textContent]
    .map((text) => text?.trim())
    .filter(Boolean)
    .join(' ');
  const price = row.querySelector('[data-field="price"] > br + span')?.textContent?.trim();
  const currency = row.querySelector('[data-field="price"] .currency-text span')?.textContent?.trim();
  return `${name || 'New item'}${price ? ` – ${price} ${currency || ''}`.trimEnd() : ''}`;
};

// ---- Which sound this live search uses ----------------------------------------------------
// The sound picked on its bookmark, or the default one from Settings.

interface SearchSound {
  slug: string;
  choice: SoundChoice;
  bookmark: string | null; // the bookmark's title
}

let searchSound: SearchSound | null = null;

const loadSearchSound = async (): Promise<SearchSound> => {
  const location = currentLocation();
  const slug = location.slug || '';
  if (searchSound?.slug === slug) return searchSound;
  const trade = await findTradeByLocation(location);
  const loaded = {slug, choice: trade?.sound || getSoundChoice(), bookmark: trade?.title || null};
  if (currentLocation().slug === slug) searchSound = loaded;
  return loaded;
};

const BADGE_CLASS = 'bt-live-alert-badge';
let badgeText = '';

// A line above the live results saying which sound will play (click it to hear it).
const placeBadge = () => {
  const existing = document.querySelector<HTMLElement>(`.${BADGE_CLASS}`);
  const resultset = document.querySelector('.resultset');
  if (!badgeText || !resultset || !isActive() || !isEnabled('live-alert-sound')) {
    existing?.remove();
    return;
  }
  const badge = existing || document.createElement('button');
  if (!existing) {
    badge.className = BADGE_CLASS;
    badge.setAttribute('type', 'button');
    badge.title = 'Play it';
    badge.addEventListener('click', () => void loadSearchSound().then((sound) => playAlertSound(sound.choice)));
  }
  if (badge.textContent !== badgeText) badge.textContent = badgeText;
  // Above the price summary when it shows, otherwise right above the results.
  const anchor = resultset.previousElementSibling?.classList.contains('bt-price-summary') ? resultset.previousElementSibling : resultset;
  if (badge.nextElementSibling !== anchor) anchor.before(badge);
};

// Mutes the site's own live search sound while another sound is chosen for this search.
let siteMuted: boolean | null = null;
const muteSiteSound = (muted: boolean) => {
  if (siteMuted === muted) return;
  siteMuted = muted;
  window.dispatchEvent(new CustomEvent('bt-site-sound', {detail: JSON.stringify({muted})}));
};

const refreshBadge = async () => {
  if (!isActive() || !isEnabled('live-alert-sound')) {
    muteSiteSound(false);
    badgeText = '';
    placeBadge();
    return;
  }
  const sound = await loadSearchSound();
  muteSiteSound(sound.choice !== SITE_SOUND);
  const label = await soundLabel(sound.choice);
  badgeText = `\u{1F514} Live alert: ${label}${sound.bookmark ? ` (bookmark \u201C${sound.bookmark}\u201D)` : ' (default sound)'}`;
  placeBadge();
};

const alert = async (count: number, first: Element) => {
  const sound = await loadSearchSound();
  // The site plays its own sound itself.
  if (isEnabled('live-alert-sound') && sound.choice !== SITE_SOUND) void playAlertSound(sound.choice);
  // The desktop notification is for when you're looking at something else.
  if (isEnabled('live-alert-notification') && (document.hidden || !document.hasFocus())) {
    const what = count > 1 ? `${count} new items` : 'new item';
    void sendMessage({
      query: 'notify',
      title: sound.bookmark ? `${sound.bookmark}: ${what}` : `Live search: ${what}`,
      message: rowSummary(first),
    });
  }
};

let seen = new Set<string>();
let pending = 0;
let pendingFirst: Element | null = null;
let timer: number | undefined;

const isActive = () => currentLocation().isLive && (isEnabled('live-alert-sound') || isEnabled('live-alert-notification'));

const check = () => {
  if (!isActive()) {
    if (seen.size) seen = new Set();
    if (document.querySelector(`.${BADGE_CLASS}`)) placeBadge();
    return;
  }
  placeBadge();

  const rows = [...document.querySelectorAll(ROWS)];
  if (!rows.length) {
    seen = new Set(); // a new search: its first results aren't "new"
    return;
  }

  const isFirstLoad = seen.size === 0;
  // New items arrive above the ones already shown; "Load more" adds below them.
  let lastSeenIndex = -1;
  rows.forEach((row, index) => {
    if (seen.has(row.getAttribute('data-id') || '')) lastSeenIndex = index;
  });

  let fresh = 0;
  let first: Element | null = null;
  rows.forEach((row, index) => {
    const id = row.getAttribute('data-id') || '';
    if (seen.has(id)) return;
    seen.add(id);
    if (!isFirstLoad && index < lastSeenIndex) {
      fresh++;
      first = first || row;
    }
  });
  if (!fresh) return;

  pending += fresh;
  pendingFirst = pendingFirst || first;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (pendingFirst) void alert(pending, pendingFirst);
    pending = 0;
    pendingFirst = null;
  }, BATCH_MS);
};

export default function setupLiveAlert() {
  const refresh = () => {
    searchSound = null;
    void refreshBadge();
    check();
  };
  onPageChange(check);
  ['location-change', 'settings-change', 'bookmarks-change', 'live-alert-change'].forEach((event) => on(event, refresh));
  // The page script may start after this one: tell it again whether to mute the site's sound.
  window.addEventListener('bt-page-world-ready', () => {
    siteMuted = null;
    void refreshBadge();
  });
  void refreshBadge();
}
