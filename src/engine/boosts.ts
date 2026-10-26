import { ageAt, currentAbility } from './generator';
import { absWeek, computeRanking } from './ranking';
import type { SeasonState } from './season';
import { DISCIPLINES, ROUNDS, type GameDate, type Player, type Round, type Ruleset } from './types';

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
/** Pengalaman: kalah tipis dari lawan ≥ CLOSE_LOSS_GAP lebih kuat bernilai seperti ini (menang 1,5; kalah biasa 1). */
export const CLOSE_LOSS_EXP = 1.4, CLOSE_LOSS_GAP = 5;
/** Perkembangan: ±MORALE_GROWTH pada morale ±10. */
export const MORALE_GROWTH = 0.1;
/** Lingkungan pelatnas: +ELITE_PER per atlet top 20 senegara, maks ELITE_MAX, untuk usia ≤ ELITE_AGE. */
export const ELITE_PER = 0.02, ELITE_MAX = 0.1, ELITE_AGE = 23;
/** Mentor: pasangan aktif berusia ≥ 25 dan CA ≥ +10 dari atlet ≤ 21 → mental +MENTOR_MENTAL/tahun, faktor pertumbuhan +MENTOR_GROWTH. */
export const MENTOR_MENTAL = 1, MENTOR_GROWTH = 0.05;
/** Sembuh dari cedera berat: peluang mental naik COMEBACK_MENTAL. */
export const COMEBACK_CHANCE = 0.3, COMEBACK_MENTAL = 2;

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

/** Kalah tipis: rubber game, atau setiap game kalah selisih ≤ 3. */
export const isCloseLoss = (scores: [number, number][], loser: 0 | 1) =>
  scores.length >= 3 || scores.every((g) => g[1 - loser] - g[loser] <= 3);

/** Atlet unik per negara yang ada di top 20 nomor mana pun (pasangan → kedua atlet). */
export function eliteCounts(state: SeasonState, rs: Ruleset) {
  const now = absWeek(state.date);
  const pairOf = new Map(state.pairs.map((p) => [p.id, p]));
  const country = new Map(state.players.map((p) => [p.id, p.countryId]));
  const ids = new Set(DISCIPLINES.flatMap((d) => computeRanking(state.results, d, now, rs).slice(0, 20)
    .flatMap((r) => pairOf.get(r.entrantId)?.playerIds ?? [r.entrantId])));
  const out = new Map<string, number>();
  for (const id of ids) { const c = country.get(id); if (c) out.set(c, (out.get(c) ?? 0) + 1); }
  return out;
}

/** Atlet ≤ 21 th yang punya pasangan aktif (bukan dadakan) berusia ≥ 25 dengan CA ≥ CA-nya + 10. */
export function mentorsOf(state: SeasonState, date: GameDate) {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const out = new Set<string>();
  for (const pair of state.pairs) {
    if (pair.dissolved || pair.adHoc) continue;
    const [a, b] = pair.playerIds.map((id) => byId.get(id));
    for (const [y, o] of [[a, b], [b, a]] as const)
      if (y && o && ageAt(y.birth, date) <= 21 && ageAt(o.birth, date) >= 25 && currentAbility(o.attrs) >= currentAbility(y.attrs) + 10) out.add(y.id);
  }
  return out;
}
