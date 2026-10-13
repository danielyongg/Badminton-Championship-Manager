import { ageAt } from './generator';
import { absWeek, computeRanking } from './ranking';
import type { Rng } from './rng';
import { teamFormatsIn, teamStrengths, type SeasonState } from './season';
import { levelOf } from './team';
import { DISCIPLINES, type FederationGoal, type Pair, type Player, type Ruleset, type SeasonReport, type TeamFormat } from './types';
import { t } from '../i18n';

// Mode karier: target federasi, rapor akhir musim, perkiraan potensi, kelola pasangan.

const countryOfEntrant = (state: SeasonState) => {
  const player = new Map(state.players.map((p) => [p.id, p.countryId]));
  const pair = new Map(state.pairs.map((p) => [p.id, player.get(p.playerIds[0])!]));
  return (id: string) => pair.get(id) ?? player.get(id);
};

/** Gelar negara dalam satu musim (tier di `career.titleTiers`, semua nomor). */
export function titlesOf(state: SeasonState, rs: Ruleset, countryId: string, year: number) {
  const tierOf = new Map(rs.calendar.map((e) => [e.id, e.tierId]));
  const country = countryOfEntrant(state);
  return state.champions.filter((c) => c.year === year && rs.career.titleTiers.includes(tierOf.get(c.tournamentId) ?? '') && country(c.winner) === countryId).length;
}

/** Jumlah atlet/pasangan negara di top 10 dunia (semua nomor) saat ini. */
export function top10Of(state: SeasonState, rs: Ruleset, countryId: string) {
  const country = countryOfEntrant(state);
  const now = absWeek(state.date);
  return DISCIPLINES.reduce((n, d) => n + computeRanking(state.results, d, now, rs).filter((r) => r.rank <= 10 && country(r.entrantId) === countryId).length, 0);
}

/** Hasil beregu negara di putaran final tahun ini (0 = tidak lolos / belum dimainkan … 5 = juara). */
export function teamLevel(state: SeasonState, countryId: string, year: number, format: TeamFormat) {
  const r = state.teamResults.find((x) => x.year === year && x.format === format && !x.confederation);
  return levelOf(!!r?.teams.includes(countryId), r?.reached[countryId]);
}

/**
 * Target beregu dari peringkat kekuatan tim di awal musim (ASUMSI):
 * #1 → juara, #2 → final, #3–4 → semifinal, #5–8 → perempat final, #9–16 → lolos ke putaran final.
 */
function teamGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  return teamFormatsIn(rs, state.date.year).flatMap((format) => {
    const rank = teamStrengths(state, rs, format).findIndex((t) => t.countryId === countryId) + 1;
    const target = rank === 0 || rank > rs.team.finals.teams ? 0 : rank === 1 ? 5 : rank === 2 ? 4 : rank <= 4 ? 3 : rank <= 8 ? 2 : 1;
    return target ? [{ kind: 'team' as const, format, target }] : [];
  });
}

/**
 * Target musim dari posisi awal negara: top 10 = pertahankan jumlah saat ini (min 1 bila punya atlet top 20);
 * gelar = gelar musim lalu, atau perkiraan 1,5 per entri top 10 di musim pertama. (ASUMSI)
 */
export function seasonGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  const top10 = top10Of(state, rs, countryId);
  const lastYear = titlesOf(state, rs, countryId, state.date.year - 1);
  const hadSeason = state.champions.some((c) => c.year === state.date.year - 1);
  const titles = hadSeason ? lastYear : Math.round(top10 * 1.5);
  return [
    { kind: 'titles', target: Math.max(1, titles) },
    { kind: 'top10', target: Math.max(top10 > 0 ? 1 : 0, top10) },
    ...teamGoals(state, rs, countryId),
  ];
}

/** Capaian terkini suatu target (dipakai Dashboard & rapor). */
export function goalProgress(state: SeasonState, rs: Ruleset, countryId: string, g: FederationGoal) {
  const year = state.date.year;
  return g.kind === 'titles' ? titlesOf(state, rs, countryId, year) : g.kind === 'top10' ? top10Of(state, rs, countryId) : teamLevel(state, countryId, year, g.format!);
}

const GRADES = ['A', 'B', 'C', 'D', 'E'];

/** Rapor akhir musim: rata-rata pencapaian (maks 150% per target) → nilai; ≥ 3 pelanggaran turun satu nilai. */
export function seasonReport(state: SeasonState, rs: Ruleset, countryId: string, goals: FederationGoal[]): SeasonReport {
  const year = state.date.year;
  const achieved = goals.map((g) => ({
    ...g,
    achieved: goalProgress(state, rs, countryId, g),
  }));
  const ratio = achieved.reduce((s, g) => s + Math.min(1.5, g.achieved / Math.max(1, g.target)), 0) / achieved.length;
  const violations = state.violations.filter((v) => v.year === year && v.countryId === countryId).length;
  let idx = ratio >= 1 ? 0 : ratio >= 0.8 ? 1 : ratio >= 0.6 ? 2 : ratio >= 0.4 ? 3 : 4;
  if (violations >= 3) idx = Math.min(4, idx + 1);
  const grade = GRADES[idx];
  return { year, countryId, goals: achieved, violations, grade, reputationChange: rs.career.gradeReputation[grade] ?? 0 };
}

/**
 * Perkiraan potensi (bintang 0,5–5) yang makin akurat seiring usia & jumlah laga.
 * Galat tetap per atlet (dari id) agar tidak berubah-ubah tiap dibuka. (ASUMSI: sd 15 → 2 poin PA)
 */
export function potentialStars(p: Player, date: { year: number; week: number }, matchesPlayed: number) {
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const unit = ((h >>> 0) % 1000) / 1000 - 0.5; // −0,5..0,5
  const sd = Math.max(2, 15 - (ageAt(p.birth, date) - 15) * 1.2 - matchesPlayed / 30);
  const est = p.pa + unit * 2 * sd * 1.5;
  return Math.max(0.5, Math.min(5, Math.round(est / 10) / 2));
}

const PAIR_GENDERS: Record<Pair['discipline'], string> = { MD: 'MM', WD: 'FF', XD: 'FM' };

/** Bentuk pasangan baru. Mengembalikan pesan galat, atau pasangan baru bila sah. */
export function formPair(
  state: Pick<SeasonState, 'players' | 'pairs' | 'date'>, discipline: Pair['discipline'], aId: string, bId: string, rng: Rng, trial = false,
): Pair | string {
  const a = state.players.find((p) => p.id === aId), b = state.players.find((p) => p.id === bId);
  if (!a || !b || a === b) return t('err_pickTwo');
  if (a.retired !== undefined || b.retired !== undefined) return t('err_retired');
  if (a.countryId !== b.countryId) return t('err_sameCountry');
  if ([a.gender, b.gender].sort().join('') !== PAIR_GENDERS[discipline]) return t('err_gender', { d: discipline });
  const active = state.pairs.filter((p) => p.discipline === discipline && !p.dissolved && !p.adHoc);
  if (active.some((p) => p.playerIds.includes(aId) && p.playerIds.includes(bId))) return t('err_samePair', { d: discipline });
  // Pasangan utama: tiap atlet hanya satu. Pasangan percobaan boleh dibentuk walau atletnya sudah punya pasangan utama.
  if (!trial && active.some((p) => !p.trial && p.playerIds.some((id) => id === aId || id === bId))) return t('err_hasPair', { d: discipline });
  const pair: Pair = {
    id: `${a.countryId}-${discipline}-${state.date.year}w${state.date.week}-${state.pairs.length}`,
    discipline, playerIds: [aId, bId], chemistry: 30 + Math.floor(rng() * 20), matchesTogether: 0, formed: { ...state.date },
    ...(trial ? { trial: true } : {}),
  };
  state.pairs.push(pair);
  return pair;
}

/** Jadikan pasangan percobaan pasangan utama: pasangan utama lama kedua atletnya di nomor ini dibubarkan. */
export function promoteTrial(state: SeasonState, pairId: string) {
  const pair = state.pairs.find((p) => p.id === pairId);
  if (!pair?.trial || pair.dissolved) return;
  for (const p of state.pairs)
    if (p !== pair && p.discipline === pair.discipline && !p.dissolved && !p.trial && p.playerIds.some((id) => pair.playerIds.includes(id)))
      p.dissolved = { ...state.date };
  delete pair.trial;
}

/** Promosikan junior ke pelatnas utama (ikut didaftarkan otomatis ke turnamen senior). */
export function promoteJunior(state: Pick<SeasonState, 'players'>, playerId: string) {
  const p = state.players.find((x) => x.id === playerId);
  if (p) p.promoted = true;
}

export function dissolvePair(state: SeasonState, pairId: string) {
  const pair = state.pairs.find((p) => p.id === pairId);
  if (pair && !pair.dissolved) pair.dissolved = { ...state.date };
}
