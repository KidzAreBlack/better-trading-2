import {emit} from './util';

export type TradeSiteVersion = '1' | '2';

export interface TradeLocation {
  version: TradeSiteVersion;
  type: string | null;
  league: string | null;
  slug: string | null;
  isLive: boolean;
}

const BASE_URL = 'https://www.pathofexile.com';
const REALMS = ['xbox', 'sony', 'poe2'];
const POLLING_INTERVAL_MS = 500;

export const parseTradePath = (pathname: string): TradeLocation => {
  const parts = pathname.split('/').slice(1);
  let versionPart, type, league, slug, live;

  if (REALMS.includes(parts[2])) {
    let realm, leagueInRealm;
    [versionPart, type, realm, leagueInRealm, slug, live] = parts;
    league = `${realm}/${leagueInRealm}`;
  } else {
    [versionPart, type, league, slug, live] = parts;
  }

  return {
    version: versionPart === 'trade2' ? '2' : '1',
    type: type || null,
    league: league ? decodeURIComponent(league) : null,
    slug: slug || null,
    isLive: live === 'live',
  };
};

export const currentLocation = (): TradeLocation => parseTradePath(window.location.pathname);

export const tradeUrl = (version: TradeSiteVersion, type: string, slug: string, league: string): string =>
  [BASE_URL, version === '2' ? 'trade2' : 'trade', type, league, slug].join('/');

export const sameLocation = (
  a: Pick<TradeLocation, 'version' | 'type' | 'league' | 'slug'>,
  b: Pick<TradeLocation, 'version' | 'type' | 'league' | 'slug'>
): boolean => a.version === b.version && a.league === b.league && a.slug === b.slug && a.type === b.type;

// The trade site changes the address without reloading, so watch for it.
export const watchLocation = (): void => {
  let last = currentLocation();

  window.setInterval(() => {
    if (!document.hasFocus()) return;

    const now = currentLocation();
    if (sameLocation(last, now) && last.isLive === now.isLive) return;

    last = now;
    emit('location-change');
  }, POLLING_INTERVAL_MS);
};
