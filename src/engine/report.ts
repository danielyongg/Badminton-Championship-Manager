import { ageAt, currentAbility } from './generator';
import { suggestedSector } from './scouting';
import type { Discipline, GameDate, Player } from './types';

// Laporan analis per atlet (profil, negara manajer): perkembangan, performa, saran sektor & rekomendasi. ASUMSI semua ambang.
export const RECENT_MATCHES = 10;
export const GOOD_FORM = 0.6, POOR_FORM = 0.4;
export const RECALL_RANK = 100, RECALL_GAP = 5, RECALL_MAX_AGE = 29;
export const VETERAN_AGE = 30, VETERAN_RANK = 50;
export const LOW_STARS = 2, LOW_RANK = 150, LOW_STARS_AGE = 22;
export const JUNIOR_LOW_STARS = 1.5, JUNIOR_LOW_AGE = 18;

export type Verdict = 'keep' | 'release' | 'promote' | 'recall' | 'stayOut';
export type Trend = 'up' | 'flat' | 'down';

export interface ReportInput {
  p: Player;
  date: GameDate;
  /** Hasil laga terakhir (true = menang), terlama dulu. */
  results: boolean[];
  /** Nomor dengan peringkat senior terbaik sekarang & ±12 minggu lalu. */
  best?: { d: Discipline; rank: number; before?: number };
  stars: number;
  /** Junior Pratama (belum dipromosikan). */
  junior: boolean;
  /** Ambang kemampuan siap senior (promotionLine). */
  line: number;
}

export function playerReport({ p, date, results, best, stars, junior, line }: ReportInput) {
  const ca = currentAbility(p.attrs);
  const start = p.attrHistory.at(-1);
  const season = start ? ca - currentAbility(start.attrs) : undefined; // sejak awal musim
  const trend: Trend = !p.caDelta ? 'flat' : p.caDelta > 0 ? 'up' : 'down';
  const age = ageAt(p.birth, date);

  const recent = results.slice(-RECENT_MATCHES);
  const wins = recent.filter(Boolean).length;
  const rate = recent.length ? wins / recent.length : undefined;
  const form = rate === undefined ? undefined : rate >= GOOD_FORM ? 'good' as const : rate <= POOR_FORM ? 'poor' as const : 'mixed' as const;

  const rank = best?.rank ?? Infinity;
  let verdict: Verdict, reason: string;
  if (p.released !== undefined) {
    const strong = rank <= RECALL_RANK || ca >= line + RECALL_GAP;
    [verdict, reason] = age <= RECALL_MAX_AGE && strong ? ['recall', 'strong'] : ['stayOut', age > RECALL_MAX_AGE ? 'old' : 'weak'];
  } else if (junior) {
    if (p.readySince !== undefined) [verdict, reason] = ['promote', 'ready'];
    else if (age >= JUNIOR_LOW_AGE && stars <= JUNIOR_LOW_STARS) [verdict, reason] = ['release', 'lowPotential'];
    else [verdict, reason] = ['keep', 'developing'];
  } else if (age >= VETERAN_AGE && trend === 'down' && rank > VETERAN_RANK) [verdict, reason] = ['release', 'declining'];
  else if (age >= LOW_STARS_AGE && stars <= LOW_STARS && rank > LOW_RANK) [verdict, reason] = ['release', 'lowPotential'];
  else [verdict, reason] = ['keep', age < LOW_STARS_AGE ? 'developing' : rank <= VETERAN_RANK ? 'core' : 'depth'];

  return { ca, season, trend, age, recent: { wins, n: recent.length }, form, best, sector: suggestedSector(p), verdict, reason };
}
