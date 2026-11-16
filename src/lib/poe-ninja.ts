import {sendMessage, storage} from './ext';
import {slugify} from './util';

export type ChaosRatios = Record<string, number>;

const CACHE_KEY = 'poe-ninja-chaos-ratios-v2';
const CACHE_DURATION_MS = 3600000; // 1 hour

// poe.ninja's currency overview: each currency's value in the league's "primary" currency
// (Chaos Orb), with the currency names in `items`.
interface Payload {
  lines?: {id: string; primaryValue: number}[];
  items?: {id: string; name: string}[];
}

// Chaos value of each currency for a league, keyed like the trade site's currency names
// ("divine-orb"), from poe.ninja (fetched by the background script).
export const fetchChaosRatios = async (league: string): Promise<ChaosRatios | null> => {
  const cached = await storage.get<ChaosRatios>(CACHE_KEY, league);
  if (cached) return cached;

  const resource = `/poe1/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`;
  const payload = await sendMessage<Payload>({query: 'poe-ninja', resource});
  if (!payload?.lines?.length || !payload.items?.length) return null;

  // Values are in the primary currency; divide by Chaos's own value to get Chaos.
  const chaos = payload.lines.find((line) => line.id === 'chaos')?.primaryValue || 1;
  const names = new Map(payload.items.map((item) => [item.id, item.name]));

  const ratios: ChaosRatios = {};
  payload.lines.forEach(({id, primaryValue}) => {
    const name = names.get(id);
    if (name && primaryValue > 0) ratios[slugify(name)] = primaryValue / chaos;
  });
  if (!ratios['divine-orb']) return null;

  await storage.set(CACHE_KEY, ratios, league, new Date(Date.now() + CACHE_DURATION_MS));

  return ratios;
};
