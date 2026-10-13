import { createContext, useContext } from 'react';
import { writeSave } from '../db/saves';
import { PRESETS, withDefaults } from '../engine/pack';
import { BWF_2026 } from '../engine/presets/bwf2026';
import { dataName } from '../i18n';
import { makeRng, type Rng } from '../engine/rng';
import { playWeek, teamFormatsIn, type SeasonState, type WeekHooks } from '../engine/season';
import type { Ruleset, SaveMeta, World } from '../engine/types';

// Satu permainan aktif (save yang sedang dimainkan). Engine mengubah `state` di tempat; `version` memicu render ulang.

export interface Game {
  meta: SaveMeta;
  state: SeasonState;
  ruleset: Ruleset;
  world: World;
  rng: Rng;
}

/** Pengaturan yang belum ada di save lama diisi nilai preset (Ruleset bertambah tiap fase). */
export function gameFromBlob(meta: SaveMeta, blob: { state: SeasonState; ruleset: Ruleset; world: World; rngState: number }): Game {
  const preset = PRESETS.find((r) => r.id === blob.ruleset.id) ?? BWF_2026;
  blob.state.teamResults ??= []; // save sebelum Fase 9
  blob.state.teamLineups ??= {};
  blob.state.teamSquads ??= {};
  blob.state.earnings ??= {};
  blob.state.eventRecords ??= []; // save sebelum halaman turnamen: bagan disusun dari daftar laga
  // ponytail: save sebelum nama resmi kejuaraan kontinental → ambil nama dari preset (hanya nama lama bawaan "Kejuaraan Beregu …").
  for (const e of blob.ruleset.team?.events ?? []) {
    const p = preset.team.events.find((x) => x.id === e.id);
    if (p && e.name.startsWith('Kejuaraan Beregu ')) Object.assign(e, { name: p.name, nameMixed: p.nameMixed });
    if (p && e.qualifiers === undefined && p.qualifiers) e.qualifiers = p.qualifiers; // kuota kontinental (Asia & Eropa 4)
  }
  for (const r of blob.state.teamResults) r.squads ??= {};
  if (!blob.state.juniorPromotion) {
    // Save sebelum promosi junior: junior yang sudah pernah main di turnamen senior langsung pelatnas utama.
    const pairIds = new Map(blob.state.pairs.map((p) => [p.id, p.playerIds]));
    const played = new Set(blob.state.matches.flatMap((m) => m.sides.flatMap((x) => pairIds.get(x) ?? [x])));
    for (const p of blob.state.players) if (played.has(p.id)) p.promoted = true;
    blob.state.juniorPromotion = true;
  }
  return { meta, state: blob.state, ruleset: withDefaults(blob.ruleset, preset), world: blob.world, rng: makeRng(blob.rngState) };
}

export async function saveGame(g: Game) {
  g.meta = { ...g.meta, date: { ...g.state.date }, countryId: g.state.career?.countryId ?? null, updatedAt: Date.now() };
  await writeSave(g.meta, { id: g.meta.id, state: g.state, ruleset: g.ruleset, world: g.world, rngState: g.rng.state() });
}

export { JUNIOR_MAX_AGE } from '../engine/generator';

export async function advance(g: Game, weeks: number, hooks: WeekHooks = {}) {
  for (let i = 0; i < weeks; i++) await playWeek(g.state, g.ruleset, g.world, g.rng, hooks);
}

export interface GameCtx {
  game: Game;
  version: number;
  /** Panggil setelah mengubah state (entry manual, pasangan, ...) agar UI diperbarui & disimpan. */
  changed: () => void;
}

export const GameContext = createContext<GameCtx | null>(null);
export const useGame = () => useContext(GameContext)!;

const lookups = new WeakMap<SeasonState, { n: number; players: Map<string, SeasonState['players'][number]>; pairs: Map<string, SeasonState['pairs'][number]> }>();

/** Peta id → atlet/pasangan, di-cache per state (dibuat ulang bila jumlahnya berubah). */
export function lookup(state: SeasonState) {
  let c = lookups.get(state);
  const n = state.players.length + state.pairs.length;
  if (!c || c.n !== n) {
    c = { n, players: new Map(state.players.map((p) => [p.id, p])), pairs: new Map(state.pairs.map((p) => [p.id, p])) };
    lookups.set(state, c);
  }
  return c;
}

/** Nama turnamen individu atau kejuaraan beregu (kejuaraan kontinental bernama lain di tahun Sudirman Cup). */
export function eventName(ruleset: Ruleset, id: string, year?: number) {
  const team = ruleset.team.events.find((e) => e.id === id);
  if (!team) return dataName(ruleset.calendar.find((e) => e.id === id)?.name);
  const mixed = year !== undefined && teamFormatsIn(ruleset, year).includes('sudirman');
  return (mixed && team.nameMixed) || team.name;
}

/** Nama tampilan peserta (atlet atau pasangan) + negaranya. */
export function entrantLabel(state: SeasonState, id: string) {
  const { players, pairs } = lookup(state);
  const ps = (pairs.get(id)?.playerIds ?? [id]).map((x) => players.get(x));
  if (!ps[0]) return { name: id, country: '' };
  return { name: ps.map((p) => p?.name).join(' / '), country: ps[0].countryId };
}
