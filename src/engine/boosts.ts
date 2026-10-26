import { ROUNDS, type Player, type Round } from './types';

// Sumber morale & perkembangan di luar hasil laga (tanpa fitur latihan). Semua angka: ASUMSI, lihat docs/ASUMSI.md.

/** Morale: target perorangan tercapai / meleset ≥ 2 babak. */
export const TARGET_HIT = 1.5, TARGET_MISS = 1;
/** Minggu tanpa bertanding: morale negatif dikali ini (lebih cepat pulih dari weeklyDecay saja). */
export const REST_RECOVERY = 0.6;
/** Morale saat turnamen di negara sendiri dimulai. */
export const HOME_BONUS = 1;
/** Morale: dipanggil ke skuad beregu; dicoret padahal layak (negara manajer). */
export const SELECT_BONUS = 1, SNUB_PENALTY = 0.5;
/** Pasangan: mulai menang beruntun ke-n, tiap kemenangan menambah morale; dibubarkan manajer. */
export const PAIR_STREAK_FROM = 3, PAIR_STREAK_BONUS = 0.3, DISSOLVE_PENALTY = 1.5;
/** Rekor pribadi (sekali): gelar pertama, menang pertama atas top 10, ranking terbaik karier (≤ 100). */
export const FIRST_TITLE_BONUS = 2, FIRST_TOP10_WIN_BONUS = 1.5, CAREER_HIGH_BONUS = 0.5;

export const bumpForm = (p: Player, d: number) => { p.form = Math.max(-10, Math.min(10, p.form + d)); };

/** Babak yang dicapai vs target: hit bila sama/lebih jauh, miss bila meleset ≥ 2 babak; gagal ke babak utama = miss bila target ≤ R32. */
export function hitTarget(reached: Round | undefined, target: Round): 'hit' | 'miss' | 'none' {
  const t = ROUNDS.indexOf(target);
  if (reached === undefined) return t <= ROUNDS.indexOf('R32') ? 'miss' : 'none';
  const r = ROUNDS.indexOf(reached);
  return r <= t ? 'hit' : r >= t + 2 ? 'miss' : 'none';
}

/** Kandidat sehat, tidak terpilih, yang peringkatnya lebih baik dari terpilih terburuk segender. */
export function snubbed(selected: Player[], candidates: Player[], bestRank: (p: Player) => number) {
  const ids = new Set(selected.map((p) => p.id));
  return candidates.filter((p) => {
    if (ids.has(p.id) || p.injury) return false;
    const same = selected.filter((s) => s.gender === p.gender);
    return same.length > 0 && bestRank(p) < Math.max(...same.map(bestRank));
  });
}
