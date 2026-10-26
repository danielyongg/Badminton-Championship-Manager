import { makeRng } from './rng';
import type { Player } from './types';

// Sifat atlet (selain sifat perkembangan lama `Player.trait`). Semua angka: ASUMSI, lihat docs/ASUMSI.md.

export const TRAITS = [
  'ironBody', 'injuryProne', 'quickRecovery', 'ageless', 'traveler',
  'clutch', 'choker', 'slowStarter', 'momentumRider', 'consistent',
  'fragileMorale', 'homeHero', 'leader', 'idealPartner', 'awkwardPartner',
] as const;
export type TraitId = (typeof TRAITS)[number];

export const TRAIT_GROUP: Record<TraitId, 'physical' | 'mental' | 'morale' | 'doubles'> = {
  ironBody: 'physical', injuryProne: 'physical', quickRecovery: 'physical', ageless: 'physical', traveler: 'physical',
  clutch: 'mental', choker: 'mental', slowStarter: 'mental', momentumRider: 'mental', consistent: 'mental',
  fragileMorale: 'morale', homeHero: 'morale', leader: 'morale', idealPartner: 'doubles', awkwardPartner: 'doubles',
};

const CONFLICTS: [TraitId, TraitId][] = [['ironBody', 'injuryProne'], ['clutch', 'choker'], ['idealPartner', 'awkwardPartner']];
/** Peluang jumlah sifat: 0 / 1 / 2. */
const COUNT_CHANCE = [0.6, 0.3, 0.1];

/** Sifat fisik: pengali peluang cedera, pemulihan kelelahan mingguan, kelelahan perjalanan. */
export const IRON_INJURY = 0.5, PRONE_INJURY = 1.8, QUICK_RECOVERY = 1.5, TRAVELER_FATIGUE = 0.5;
/** Awet muda: penurunan usia dihitung seolah sekian tahun lebih muda. */
export const AGELESS_YEARS = 2;
/** Mental di poin kritis (±) dan semua atribut di laga besar (SF/F atau turnamen besar). */
export const CLUTCH_MENTAL = 8, CLUTCH_BIG = 1, CHOKER_MENTAL = 8, CHOKER_BIG = 1.5;
/** Sifat fisik/perkembangan terbaca setelah 2 akhir musim tercatat; lainnya setelah 30 laga. */
export const REVEAL_SEASONS = 2, REVEAL_MATCHES = 30;

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0 || 1; };

/** Sifat dari id atlet (deterministik, tidak memakai rng game agar urutan acak dunia tidak bergeser). */
export function rollTraits(id: string): TraitId[] {
  const rng = makeRng(hash(`traits:${id}`));
  const r = rng();
  const n = r < COUNT_CHANCE[0] ? 0 : r < COUNT_CHANCE[0] + COUNT_CHANCE[1] ? 1 : 2;
  const out: TraitId[] = [];
  while (out.length < n) {
    const t = TRAITS[Math.floor(rng() * TRAITS.length)];
    if (out.includes(t) || CONFLICTS.some(([a, b]) => (t === a && out.includes(b)) || (t === b && out.includes(a)))) continue;
    out.push(t);
  }
  return out;
}

export function ensureTraits(players: Player[]) { for (const p of players) p.traits ??= rollTraits(p.id); }
export const hasTrait = (p: Player, t: TraitId) => !!p.traits?.includes(t);
/** Bagian atlet di satu sisi yang punya sifat t (ganda: 0 / 0,5 / 1). */
export const traitShare = (ps: Player[], t: TraitId) => ps.filter((p) => hasTrait(p, t)).length / Math.max(1, ps.length);
export const injuryMult = (p: Player) => (hasTrait(p, 'ironBody') ? IRON_INJURY : hasTrait(p, 'injuryProne') ? PRONE_INJURY : 1);

export function visibleTraits(p: Player, matchesPlayed: number, seasons = p.attrHistory.length) {
  const out: (TraitId | 'late' | 'stagnant')[] = [];
  if (p.trait && seasons >= REVEAL_SEASONS) out.push(p.trait);
  for (const t of p.traits ?? []) if (TRAIT_GROUP[t] === 'physical' ? seasons >= REVEAL_SEASONS : matchesPlayed >= REVEAL_MATCHES) out.push(t);
  return out;
}
/** Yang terlihat sekarang tapi belum terlihat sebelumnya (untuk laporan kuartal & berita). */
export function revealedTraits(p: Player, matchesPlayed: number, prevMatches: number) {
  const before = new Set(visibleTraits(p, prevMatches, p.attrHistory.length - 1));
  return visibleTraits(p, matchesPlayed).filter((t) => !before.has(t));
}
