import { WINNER_SHOTS, type EntrantId, type Match, type MatchStats } from './types';

// Statistik karier dari Match.stats. `stats` dibuang untuk musim lama (endYear), jadi sebelum dibuang dijumlahkan ke
// arsip per peserta (SeasonState.statArchive); total karier = arsip + laga yang statistiknya masih ada.

export interface StatAcc {
  n: number; // laga berstatistik
  kmh: number; // smash tercepat
  winners: number; // winner + poin langsung dari servis
  ue: number; // unforced error
  streak: number; // poin beruntun terbanyak
}

const empty = (): StatAcc => ({ n: 0, kmh: 0, winners: 0, ue: 0, streak: 0 });
const v2 = (m: Match) => (m.stats && 'v' in m.stats ? (m.stats as MatchStats) : undefined);

function add(acc: StatAcc, s: MatchStats, i: 0 | 1) {
  acc.n++;
  acc.kmh = Math.max(acc.kmh, s.kmh[i]);
  acc.winners += WINNER_SHOTS.reduce((x, k) => x + s.win[k][i], 0) + s.sw[i];
  acc.ue += s.ue[i];
  acc.streak = Math.max(acc.streak, s.streak[i]);
}

/** Pindahkan statistik laga yang akan dibuang ke arsip per peserta (kedua sisi). */
export function archiveStats(archive: Record<EntrantId, StatAcc>, matches: Match[]) {
  for (const m of matches) {
    const s = v2(m);
    if (s) m.sides.forEach((id, i) => add((archive[id] ??= empty()), s, i as 0 | 1));
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
