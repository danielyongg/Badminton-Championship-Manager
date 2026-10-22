import { emptyStats } from './match';
import { WINNER_SHOTS, type EntrantId, type Match, type MatchStats } from './types';

// Statistik karier dari Match.stats. `stats` dibuang untuk musim lama (endYear), jadi sebelum dibuang dijumlahkan ke
// arsip per peserta (SeasonState.statArchive); total karier = arsip + laga yang statistiknya masih ada.

export interface StatAcc {
  n: number; // laga berstatistik
  kmh: number; // smash tercepat
  winners: number; // winner + poin langsung dari servis
  ue: number; // unforced error
  streak: number; // poin beruntun terbanyak
  /** Jumlah semua statistik, sisi 0 = peserta ini, sisi 1 = lawannya (kmh & reli terpanjang: maksimum). Arsip lama: tidak ada. */
  s?: MatchStats;
}

const empty = (): StatAcc => ({ n: 0, kmh: 0, winners: 0, ue: 0, streak: 0 });
export const v2 = (m: Match) => (m.stats && 'v' in m.stats ? (m.stats as MatchStats) : undefined);

const PAIRS = ['ue', 'fe', 'sf', 'sw', 'srv', 'srvWon', 'streak', 'gp', 'gps', 'mps'] as const;

/** Tambahkan statistik satu laga ke `into` dengan sisi `i` sebagai sisi 0 (sudut pandang peserta). */
export function addOriented(into: MatchStats, s: MatchStats, i: 0 | 1) {
  const j = (1 - i) as 0 | 1;
  for (const k of PAIRS) { into[k][0] += s[k][i]; into[k][1] += s[k][j]; }
  for (const k of WINNER_SHOTS) { into.win[k][0] += s.win[k][i]; into.win[k][1] += s.win[k][j]; }
  into.kmh = [Math.max(into.kmh[0], s.kmh[i]), Math.max(into.kmh[1], s.kmh[j])];
  into.longest = Math.max(into.longest, s.longest);
  s.rallies.forEach((x, k) => (into.rallies[k] += x));
  into.sec += s.sec;
}

function add(acc: StatAcc, s: MatchStats, i: 0 | 1) {
  acc.n++;
  acc.kmh = Math.max(acc.kmh, s.kmh[i]);
  acc.winners += WINNER_SHOTS.reduce((x, k) => x + s.win[k][i], 0) + s.sw[i];
  acc.ue += s.ue[i];
  acc.streak = Math.max(acc.streak, s.streak[i]);
  if (acc.s) addOriented(acc.s, s, i);
}

/** Pindahkan statistik laga yang akan dibuang ke arsip per peserta (kedua sisi). */
export function archiveStats(archive: Record<EntrantId, StatAcc>, matches: Match[]) {
  for (const m of matches) {
    const s = v2(m);
    if (s) m.sides.forEach((id, i) => add((archive[id] ??= { ...empty(), s: emptyStats() }), s, i as 0 | 1));
  }
}

/** Statistik karier gabungan untuk sekumpulan id peserta (atlet + pasangannya, atau satu pasangan). */
export function careerStats(archive: Record<EntrantId, StatAcc> | undefined, matches: Match[], ids: Set<EntrantId>) {
  const acc = empty();
  for (const id of ids) {
    const a = archive?.[id];
    if (!a) continue;
    acc.n += a.n; acc.winners += a.winners; acc.ue += a.ue;
    acc.kmh = Math.max(acc.kmh, a.kmh); acc.streak = Math.max(acc.streak, a.streak);
  }
  // Rubber game (game ketiga): dari skor, tersimpan selamanya.
  const decider: [number, number] = [0, 0];
  for (const m of matches) {
    const i = ids.has(m.sides[0]) ? 0 : ids.has(m.sides[1]) ? 1 : -1;
    if (i < 0) continue;
    const s = v2(m);
    if (s) add(acc, s, i as 0 | 1);
    if (m.scores.length === 3 && !m.walkover && !m.retired) decider[m.winner === i ? 0 : 1]++;
  }
  return { ...acc, decider };
}

/**
 * Jumlah statistik (sisi 0 = peserta `id`, sisi 1 = lawan) dari laga yang statistiknya masih ada, ditambah arsip bila
 * `withArchive` (arsip lama tanpa `s` tidak ikut). `n` = jumlah laga yang dijumlahkan.
 */
export function statTotals(archive: Record<EntrantId, StatAcc> | undefined, matches: Match[], id: EntrantId, withArchive: boolean) {
  const s = emptyStats();
  let n = 0;
  const a = withArchive ? archive?.[id] : undefined;
  if (a?.s) { addOriented(s, a.s, 0); n += a.n; }
  for (const m of matches) {
    const st = v2(m), i = m.sides.indexOf(id);
    if (!st || i < 0) continue;
    addOriented(s, st, i as 0 | 1);
    n++;
  }
  return { s, n };
}
