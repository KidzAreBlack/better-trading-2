// The trade site stores the whole search inside its links ("H4sI…": gzip + base64url of the
// search JSON), including the trade mode ("status": In Person, Instant Buyout, Any...).
// Saved links should not force a mode: bookmarks are saved without it, and when a bookmark or
// history link is opened, the mode you are currently using is put in.
import {local} from './ext';
import {currentLocation} from './trade-location';
import type {TradeSiteVersion} from './trade-location';
import {emit, on} from './util';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const transform = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

// Only links that carry their search can be read; old short search ids cannot.
export const isSelfContained = (slug: string): boolean => slug.startsWith('H4sI');

export const decodeSearch = async (slug: string): Promise<Json | null> => {
  if (!isSelfContained(slug)) return null;
  try {
    const binary = atob(slug.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(await transform(bytes, new DecompressionStream('gzip'))));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
};

export const encodeSearch = async (query: Json): Promise<string> => {
  const bytes = await transform(new TextEncoder().encode(JSON.stringify(query)), new CompressionStream('gzip'));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// A link without its trade mode, for saving.
export const withoutTradeMode = async (slug: string): Promise<string> => {
  const query = await decodeSearch(slug);
  if (!query || !('status' in query)) return slug;
  const {status: _status, ...rest} = query;
  return encodeSearch(rest);
};

// A link set to the given trade mode, for opening.
export const withTradeMode = async (slug: string, mode: string | null): Promise<string> => {
  if (!mode) return slug;
  const query = await decodeSearch(slug);
  if (!query || query.status?.option === mode) return slug;
  return encodeSearch({...query, status: {...(query.status || {}), option: mode}});
};

// Identifies a search regardless of its trade mode, for "is this the same search?" checks.
export const searchKey = async (slug: string): Promise<string> => {
  const query = await decodeSearch(slug);
  if (!query) return slug;
  const {status: _status, ...rest} = query;
  return JSON.stringify(rest);
};

// ---- The mode you are using ---------------------------------------------------------

const modeKey = (version: TradeSiteVersion) => `trade-mode-${version}`;

export const currentTradeMode = (version: TradeSiteVersion): string | null => local.get(modeKey(version));

// Remembers the mode of each search you run (read from the address), per site version.
export const setupTradeModeTracking = (): void => {
  const remember = async () => {
    const location = currentLocation();
    if (location.type !== 'search' || !location.slug) return;
    const mode = (await decodeSearch(location.slug))?.status?.option;
    if (typeof mode === 'string' && mode && mode !== currentTradeMode(location.version)) {
      local.set(modeKey(location.version), mode);
      emit('trade-mode-change');
    }
  };

  void remember();
  on('location-change', () => void remember());
};
