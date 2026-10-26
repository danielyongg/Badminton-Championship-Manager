import { ROUNDS, type Player, type Round } from './types';

// Sumber morale & perkembangan di luar hasil laga (tanpa fitur latihan). Semua angka: ASUMSI, lihat docs/ASUMSI.md.

/** Morale: target perorangan tercapai / meleset ≥ 2 babak. */
export const TARGET_HIT = 1.5, TARGET_MISS = 1;
/** Minggu tanpa bertanding: morale negatif dikali ini (lebih cepat pulih dari weeklyDecay saja). */
export const REST_RECOVERY = 0.6;
/** Morale saat turnamen di negara sendiri dimulai. */
export const HOME_BONUS = 1;

export const bumpForm = (p: Player, d: number) => { p.form = Math.max(-10, Math.min(10, p.form + d)); };

/** Babak yang dicapai vs target: hit bila sama/lebih jauh, miss bila meleset ≥ 2 babak; gagal ke babak utama = miss bila target ≤ R32. */
export function hitTarget(reached: Round | undefined, target: Round): 'hit' | 'miss' | 'none' {
  const t = ROUNDS.indexOf(target);
  if (reached === undefined) return t <= ROUNDS.indexOf('R32') ? 'miss' : 'none';
  const r = ROUNDS.indexOf(reached);
  return r <= t ? 'hit' : r >= t + 2 ? 'miss' : 'none';
}
