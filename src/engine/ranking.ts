import { mainRoundName, type KnockoutResult } from './knockout';
import { ROUNDS, type Discipline, type DrawSlot, type EntrantId, type GameDate, type RankingEntry, type RankingRow, type Round, type Ruleset, type Tier, type TournamentDef } from './types';

// Ranking dunia BWF: periode 52 minggu bergulir, 10 hasil terbaik, tie-break jumlah turnamen.

/** ASUMSI: 1 tahun = 52 minggu game. */
export const absWeek = (d: GameDate) => d.year * 52 + d.week;

/** Poin untuk babak yang dicapai. Bonus Super 1000 bila hadiah turnamen melebihi hadiah standar tier. */
export function pointsFor(tier: Tier, prizeUsd: number, reached: Round) {
  const extra = prizeUsd - tier.prizeUsd;
  const table = tier.bonusPoints?.find((b) => extra >= b.minExtraPrizeUsd)?.points ?? tier.points;
  return table[ROUNDS.indexOf(reached)] ?? 0;
}

/**
 * Hasil main draw gugur → entri ranking. Peserta yang dapat bye/walkover di R1 lalu kalah di R2 → poin R2
 * (otomatis, karena babak yang tercatat adalah babak tempat ia kalah).
 * Wildcard yang kalah di babak pertama turnamen dengan zeroPointsForR1WildcardLoss (S500/S750; S300, S100 & grade 3 menurut GCR 7.11) → 0 poin.
 * ponytail: wildcard yang menang walkover/bye di R1 lalu kalah di R2 tetap dapat poin R2 (GCR: walkover bukan kemenangan); jarang terjadi.
 * ASUMSI: kalah di babak kualifikasi = tidak mendapat poin.
 */
export function knockoutResults(
  main: KnockoutResult, slots: DrawSlot[], event: TournamentDef, tier: Tier, discipline: Discipline, date: GameDate, ruleset: Ruleset,
): RankingEntry[] {
  const firstRound = mainRoundName(slots.length, 0);
  const wildcards = new Set(slots.filter((s) => s.wildcard).map((s) => s.entrant));
  const out: RankingEntry[] = [];
  for (const [entrantId, reached] of main.reached) {
    const zero = tier.zeroPointsForR1WildcardLoss && wildcards.has(entrantId) && reached === firstRound;
    out.push({
      entrantId, discipline, tournamentId: event.id, tierId: tier.id, year: date.year, week: date.week,
      points: zero ? 0 : pointsFor(tier, event.prizeUsd, reached as Round),
      expiresAbsWeek: absWeek(date) + ruleset.ranking.windowWeeks,
    });
  }
  return out;
}

/** Peringkat dengan "ranking sama, nomor berikutnya dilewati" (1, 2, 2, 4). */
function assignRanks(rows: Omit<RankingRow, 'rank'>[]): RankingRow[] {
  rows.sort((a, b) => b.points - a.points || b.tournamentsPlayed - a.tournamentsPlayed);
  let rank = 0;
  return rows.map((r, i) => {
    const p = rows[i - 1];
    if (!p || p.points !== r.points || p.tournamentsPlayed !== r.tournamentsPlayed) rank = i + 1;
    return { ...r, rank };
  });
}

/** Entri yang masih berlaku pada minggu `now` (kedaluwarsa tepat 52 minggu setelah turnamen). */
export const activeEntries = (entries: RankingEntry[], discipline: Discipline, nowAbs: number) =>
  entries.filter((e) => e.discipline === discipline && e.expiresAbsWeek > nowAbs && absWeek(e) <= nowAbs);

/** World ranking: ≤ bestOf turnamen → semua dihitung; lebih → hanya bestOf terbaik. */
export function computeRanking(entries: RankingEntry[], discipline: Discipline, nowAbs: number, ruleset: Ruleset): RankingRow[] {
  const by = new Map<EntrantId, number[]>();
  for (const e of activeEntries(entries, discipline, nowAbs)) by.set(e.entrantId, [...(by.get(e.entrantId) ?? []), e.points]);
  const rows: Omit<RankingRow, 'rank'>[] = [];
  for (const [entrantId, pts] of by) {
    const points = pts.sort((a, b) => b - a).slice(0, ruleset.ranking.bestOf).reduce((s, x) => s + x, 0);
    if (points > 0) rows.push({ entrantId, points, tournamentsPlayed: pts.length });
  }
  return assignRanks(rows);
}

/**
 * Race to Finals: hasil World Tour dalam satu musim, maks `bestOf` (14) terbaik dengan batas per tier
 * (maks 3 dari Super 100). Greedy dari poin terbesar = optimal karena batas hanya per tier.
 */
export function computeRace(entries: RankingEntry[], discipline: Discipline, year: number, ruleset: Ruleset): RankingRow[] {
  const { bestOf, tiers, maxFromTier } = ruleset.race;
  const by = new Map<EntrantId, RankingEntry[]>();
  for (const e of entries)
    if (e.discipline === discipline && e.year === year && tiers.includes(e.tierId))
      by.set(e.entrantId, [...(by.get(e.entrantId) ?? []), e]);
  const rows: Omit<RankingRow, 'rank'>[] = [];
  for (const [entrantId, list] of by) {
    const used: Record<string, number> = {};
    let points = 0, n = 0;
    for (const e of list.sort((a, b) => b.points - a.points)) {
      if (n === bestOf) break;
      if ((used[e.tierId] ?? 0) >= (maxFromTier[e.tierId] ?? Infinity)) continue;
      used[e.tierId] = (used[e.tierId] ?? 0) + 1;
      points += e.points;
      n++;
    }
    if (points > 0) rows.push({ entrantId, points, tournamentsPlayed: list.length });
  }
  return assignRanks(rows);
}

export const rankMap = (rows: RankingRow[]) => new Map(rows.map((r) => [r.entrantId, r.rank]));

/** Entri seorang peserta yang kedaluwarsa dalam `withinWeeks` minggu ke depan; `counted` = sedang masuk 10 terbaik. */
export function expiringPoints(entries: RankingEntry[], entrantId: EntrantId, discipline: Discipline, nowAbs: number, withinWeeks: number, ruleset: Ruleset) {
  const mine = activeEntries(entries, discipline, nowAbs).filter((e) => e.entrantId === entrantId).sort((a, b) => b.points - a.points);
  const counted = new Set(mine.slice(0, ruleset.ranking.bestOf));
  return mine
    .filter((e) => e.expiresAbsWeek <= nowAbs + withinWeeks)
    .sort((a, b) => a.expiresAbsWeek - b.expiresAbsWeek)
    .map((e) => ({ entry: e, weeksLeft: e.expiresAbsWeek - nowAbs, counted: counted.has(e) }));
}

/** Riwayat peringkat mingguan seorang peserta (dihitung ulang; Fase 5 menyimpan snapshot mingguan). */
export function rankHistory(entries: RankingEntry[], entrantId: EntrantId, discipline: Discipline, fromAbs: number, toAbs: number, ruleset: Ruleset) {
  const out: { absWeek: number; rank?: number }[] = [];
  for (let w = fromAbs; w <= toAbs; w++)
    out.push({ absWeek: w, rank: computeRanking(entries, discipline, w, ruleset).find((r) => r.entrantId === entrantId)?.rank });
  return out;
}
