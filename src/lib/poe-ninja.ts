import {sendMessage, storage} from './ext';
import {slugify} from './util';

export type ChaosRatios = Record<string, number>;

const CACHE_KEY = 'poe-ninja-chaos-ratios-cache';
const CACHE_DURATION_MS = 3600000; // 1 hour

interface Payload {
  lines?: {currencyTypeName: string; chaosEquivalent: number}[];
}

// Chaos value of each currency for a league, from poe.ninja (fetched by the background script).
export const fetchChaosRatios = async (league: string): Promise<ChaosRatios | null> => {
  const cached = await storage.get<ChaosRatios>(CACHE_KEY, league);
  if (cached) return cached;

  const resource = `/data/currencyoverview?type=Currency&league=${encodeURIComponent(league)}`;
  const payload = await sendMessage<Payload>({query: 'poe-ninja', resource});
  if (!payload?.lines?.length) return null;

  const ratios: ChaosRatios = {};
  payload.lines.forEach(({currencyTypeName, chaosEquivalent}) => (ratios[slugify(currencyTypeName)] = chaosEquivalent));

  await storage.set(CACHE_KEY, ratios, league, new Date(Date.now() + CACHE_DURATION_MS));

  return ratios;
};
