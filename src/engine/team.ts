import { groupDraw, knockoutFromGroups, playGroup, type Standing } from './groups';
import { playKnockout, type MatchRound, type PlayFn, type PlayResult } from './knockout';
import type { Rng } from './rng';
import type { Discipline, DrawStep, EntrantId, GroupStage } from './types';
import { t } from '../i18n';

// Beregu (Thomas/Uber/Sudirman): line-up, satu pertandingan beregu (5 partai), dan format grup + gugur.
// Tidak tahu soal atribut: partai dimainkan lewat PlayFn per nomor (mesin pertandingan / Live).

/** Peserta per partai, sejajar dengan urutan partai (`team.order[format]`). null = tidak bisa diisi (walkover). */
export type Lineup = (EntrantId | null)[];

/** Calon pengisi partai: atlet (tunggal) atau pasangan (ganda) beserta atletnya. */
export interface TeamEntrant { id: EntrantId; playerIds: string[] }

/**
 * Aturan line-up: tiap atlet maksimal `max` partai dan tidak boleh dua kali di nomor yang sama
 * (Thomas/Uber: satu tunggal + satu ganda; Sudirman: dua nomor berbeda).
 * ASUMSI: kewajiban urutan tunggal 1–3 menurut ranking tidak diperiksa untuk line-up manajer.
 */
export function lineupError(lineup: Lineup, order: Discipline[], pool: Map<EntrantId, TeamEntrant>, max: number): string | null {
  const count = new Map<string, number>();
  const seen = new Set<string>();
  for (let i = 0; i < order.length; i++) {
    const e = lineup[i] ? pool.get(lineup[i]!) : undefined;
    if (!e) return t('err_slot', { i: i + 1, d: order[i] });
    for (const p of e.playerIds) {
      const key = `${order[i]}:${p}`;
      if (seen.has(key)) return t('err_twice', { d: order[i] });
      seen.add(key);
      count.set(p, (count.get(p) ?? 0) + 1);
      if (count.get(p)! > max) return t('err_max', { max });
    }
  }
  return null;
}

/** Peserta yang semua atletnya ada di skuad. */
export function squadPool(pool: Record<string, TeamEntrant[]>, squad: Iterable<string>): Record<string, TeamEntrant[]> {
  const s = new Set(squad);
  return Object.fromEntries(Object.entries(pool).map(([d, list]) => [d, list.filter((e) => e.playerIds.every((id) => s.has(id)))]));
}

/**
 * Skuad otomatis (AI): atlet line-up terbaik dulu, lalu bergiliran peserta terbaik tiap nomor sampai `size` atlet
 * (cadangan bila ada yang cedera / untuk rotasi).
 */
export function autoSquad(order: Discipline[], pool: Record<string, TeamEntrant[]>, max: number, size: number): string[] {
  const out = new Set<string>();
  const add = (ids: string[]) => { if (out.size + ids.filter((id) => !out.has(id)).length <= size) ids.forEach((id) => out.add(id)); };
  for (const id of autoLineup(order, pool, max)) if (id) add(Object.values(pool).flat().find((e) => e.id === id)!.playerIds);
  const lists = [...new Set(order)].map((d) => pool[d] ?? []);
  for (let i = 0; out.size < size && lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) add(l[i].playerIds);
  return [...out];
}

/** Aturan skuad: jumlah atlet min–maks, semua atlet tersedia (negara, gender & sehat), dan kelima partai bisa diisi. */
export function squadError(squad: string[], order: Discipline[], pool: Record<string, TeamEntrant[]>, max: number, size: { min: number; max: number }): string | null {
  if (squad.length < size.min || squad.length > size.max) return t('err_squadSize', { min: size.min, max: size.max, n: squad.length });
  const available = new Set(Object.values(pool).flat().flatMap((e) => e.playerIds));
  if (squad.some((id) => !available.has(id))) return t('err_squadUnavailable');
  if (autoLineup(order, squadPool(pool, squad), max).some((x) => !x)) return t('err_squadShort');
  return null;
}

/** Ganda dadakan di line-up: dua atlet skuad yang belum tentu berpasangan, ditulis `adhoc:a+b`. */
export const AD_HOC = 'adhoc:';
export const adHocId = (a: string, b: string) => `${AD_HOC}${a}+${b}`; // urutan pilihan dipertahankan (XD: putra / putri)
const GENDERS: Record<string, string> = { MD: 'MM', WD: 'FF', XD: 'FM' };

/** Peserta dadakan yang sah di line-up: kedua atlet di skuad, berbeda, dan gendernya cocok dengan nomor partainya. */
export function adHocEntrants(lineup: Lineup, order: Discipline[], squad: Set<string>, gender: (id: string) => string | undefined): TeamEntrant[] {
  return lineup.flatMap((id, i) => {
    if (!id?.startsWith(AD_HOC)) return [];
    const ids = id.slice(AD_HOC.length).split('+');
    const ok = ids.length === 2 && ids[0] !== ids[1] && ids.every((x) => squad.has(x)) && ids.map(gender).sort().join('') === GENDERS[order[i]];
    return ok ? [{ id, playerIds: ids }] : [];
  });
}

/** Line-up otomatis: tiap partai diisi peserta terbaik (urutan `pool`) yang masih memenuhi aturan. */
export function autoLineup(order: Discipline[], pool: Record<string, TeamEntrant[]>, max: number): Lineup {
  const count = new Map<string, number>();
  const seen = new Set<string>();
  return order.map((d) => {
    const e = (pool[d] ?? []).find((x) => x.playerIds.every((p) => !seen.has(`${d}:${p}`) && (count.get(p) ?? 0) < max));
    if (!e) return null;
    for (const p of e.playerIds) { seen.add(`${d}:${p}`); count.set(p, (count.get(p) ?? 0) + 1); }
    return e.id;
  });
}

/**
 * Satu pertandingan beregu. `scores` berisi [game menang A, game menang B] per partai, sehingga klasemen grup
 * (`playGroup`) otomatis memakai urutan beregu: kemenangan → head-to-head → selisih partai → selisih game.
 * Babak gugur berhenti begitu satu tim memastikan kemenangan; fase grup memainkan semua partai.
 */
export async function playTie(
  lineups: [Lineup, Lineup], order: Discipline[], round: MatchRound, play: (d: Discipline) => PlayFn, allMatches: boolean,
): Promise<PlayResult> {
  const wins = [0, 0];
  const scores: [number, number][] = [];
  for (let i = 0; i < order.length; i++) {
    if (!allMatches && Math.max(...wins) > order.length / 2) break;
    const a = lineups[0][i], b = lineups[1][i];
    if (!a || !b) {
      if (!a && !b) continue;
      const w = a ? 0 : 1; // walkover: dihitung 2–0 game
      wins[w]++;
      scores.push(w === 0 ? [2, 0] : [0, 2]);
      continue;
    }
    const r = await play(order[i])(a, b, round);
    wins[r.winner]++;
    const games = r.scores.filter(([x, y]) => x > y).length;
    scores.push([games, r.scores.length - games]);
  }
  return { winner: wins[0] >= wins[1] ? 0 : 1, scores };
}

export interface TeamEventRun {
  groups?: string[][];
  steps?: DrawStep[]; // undian pot (format grup)
  standings?: Standing[][];
  rounds: (string | null)[][];
  reached: Map<string, MatchRound | 'W'>;
}

/**
 * Turnamen beregu antar-negara. `teams` urut unggulan (terkuat dulu).
 * Dengan `groups` (dan tim cukup): undian pot → round-robin → gugur; tanpa itu: sistem gugur berunggulan.
 * `tie` = PlayFn tingkat negara (memainkan 5 partai); id peserta = id negara.
 */
export async function runTeamEvent(
  teams: string[], groups: GroupStage | undefined, tie: PlayFn, rng: Rng, onDraw?: (steps: DrawStep[]) => Promise<void> | null,
): Promise<TeamEventRun> {
  const standing = (id: string): Standing => ({ id, wins: 0, gameDiff: 0, pointDiff: 0 });
  if (groups && teams.length > groups.groups * groups.advance) {
    const drawn = groupDraw(teams.map((id, i) => ({ id, countryId: id, rank: i + 1 })), groups, rng);
    const ids = drawn.groups.map((g) => g.map((e) => e.id));
    await onDraw?.(drawn.steps);
    const standings: Standing[][] = [];
    for (const g of ids) standings.push(await playGroup(g, tie));
    const ko = await playKnockout(knockoutFromGroups(standings, groups.advance, rng), tie);
    return { groups: ids, standings, steps: drawn.steps, ...ko };
  }
  // ponytail: unggulan sebagai "juara grup" berisi 1 tim → posisi unggulan & bye dari knockoutFromGroups.
  const ko = await playKnockout(knockoutFromGroups(teams.map((id) => [standing(id)]), 1, rng), tie);
  return ko;
}

/** Tingkat hasil beregu untuk target federasi: 0 tidak lolos, 1 fase grup, 2 QF, 3 SF, 4 final, 5 juara. */
export function levelOf(played: boolean, reached: MatchRound | 'W' | undefined) {
  if (!played) return 0;
  return ({ W: 5, F: 4, SF: 3, QF: 2 } as Record<string, number>)[reached ?? ''] ?? 1;
}
