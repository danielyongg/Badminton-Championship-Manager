import { isHeld, weekOf, type SeasonState } from './season';
import type { Rng } from './rng';
import type { Discipline, EntrantId, Ruleset } from './types';

/**
 * BWF Player of the Year Awards: pemain terbaik tunggal putra & putri, pasangan terbaik tiap nomor ganda, dan Eddy Choong
 * Rising Star (≤ 21 tahun, nomor mana pun). Nominasi AWARD_LEAD minggu sebelum World Tour Finals, pemenang (salah satu
 * nominasi) di akhir minggu WTF. ASUMSI: skor = poin ranking senior musim itu + bonus gelar besar; ±5% acak saat memilih pemenang.
 */
export const AWARD_CATS = ['MS', 'WS', 'MD', 'WD', 'XD', 'rising'] as const;
export type AwardCat = typeof AWARD_CATS[number];
export interface AwardYear {
  year: number;
  nominees: Record<AwardCat, EntrantId[]>;
  winners?: Record<AwardCat, EntrantId>;
}
export const AWARD_LEAD = 3, AWARD_NOMINEES = 4, RISING_MAX_AGE = 21, AWARD_NOISE = 0.05;
export const TITLE_BONUS: Record<string, number> = { OG: 20000, WC: 20000, WTF: 10000, S1000: 5000, S750: 2500 };
const DISC: Discipline[] = ['MS', 'WS', 'MD', 'WD', 'XD'];

/** Minggu WTF tahun ini (undefined = tidak digelar). */
export function wtfWeek(rs: Ruleset, year: number) {
  const e = rs.calendar.find((x) => x.tierId === 'WTF' && isHeld(x, year));
  return e && weekOf(e, year);
}

/** Skor musim per entrant di satu nomor: poin ranking senior yang diraih tahun itu + bonus gelar besar. */
export function seasonScores(state: SeasonState, rs: Ruleset, year: number, d: Discipline) {
  const out = new Map<EntrantId, number>();
  for (const r of state.results) if (r.year === year && r.discipline === d) out.set(r.entrantId, (out.get(r.entrantId) ?? 0) + r.points);
  const tier = new Map(rs.calendar.map((e) => [e.id, e.tierId]));
  for (const c of state.champions) {
    const bonus = TITLE_BONUS[tier.get(c.tournamentId) ?? ''];
    if (c.year === year && c.discipline === d && bonus) out.set(c.winner, (out.get(c.winner) ?? 0) + bonus);
  }
  return out;
}

/** Skor semua kategori; Rising Star = gabungan nomor, hanya entrant yang semua atletnya ≤ 21 tahun (tahun − tahun lahir). */
function scores(state: SeasonState, rs: Ruleset, year: number): Record<AwardCat, Map<EntrantId, number>> {
  const byD = Object.fromEntries(DISC.map((d) => [d, seasonScores(state, rs, year, d)])) as Record<Discipline, Map<EntrantId, number>>;
  const birth = new Map(state.players.map((p) => [p.id, p.birth.year]));
  const members = new Map(state.pairs.map((p) => [p.id, p.playerIds as string[]]));
  const young = (id: EntrantId) => (members.get(id) ?? [id]).every((x) => year - (birth.get(x) ?? 0) <= RISING_MAX_AGE);
  const rising = new Map(DISC.flatMap((d) => [...byD[d]].filter(([id]) => young(id))));
  return { ...byD, rising };
}

const top = (m: Map<EntrantId, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);

/** Dipanggil di akhir tiap minggu: nominasi di minggu WTF − AWARD_LEAD, pemenang di minggu WTF. */
export function updateAwards(state: SeasonState, rs: Ruleset, rng: Rng) {
  const { year, week } = state.date;
  const w = wtfWeek(rs, year);
  if (w === undefined) return;
  const list = (state.awards ??= []);
  let cur = list.find((a) => a.year === year);
  if (week === Math.max(1, w - AWARD_LEAD) && !cur) {
    const s = scores(state, rs, year);
    cur = { year, nominees: Object.fromEntries(AWARD_CATS.map((c) => [c, top(s[c], AWARD_NOMINEES)])) as AwardYear['nominees'] };
    list.push(cur);
  }
  if (week === w && cur && !cur.winners) {
    const s = scores(state, rs, year);
    cur.winners = Object.fromEntries(AWARD_CATS.map((c) => {
      const noisy = new Map(cur!.nominees[c].map((id) => [id, (s[c].get(id) ?? 0) * (1 + (rng() * 2 - 1) * AWARD_NOISE)]));
      return [c, top(noisy, 1)[0]];
    })) as AwardYear['winners'];
  }
}

/** Penghargaan & nominasi entrant-entrant ini (profil atlet: id atlet + pasangannya). */
export function awardsOf(state: SeasonState, ids: EntrantId[]) {
  const set = new Set(ids);
  return (state.awards ?? []).flatMap((a) => AWARD_CATS.flatMap((c) => {
    if (a.winners && set.has(a.winners[c])) return [{ year: a.year, cat: c, won: true }];
    return a.nominees[c].some((id) => set.has(id)) ? [{ year: a.year, cat: c, won: false }] : [];
  }));
}
