import { makeDraw, type DrawResult } from './draw';
import { acceptEntries, qualifyingSections, type Candidate, type EntryList } from './entry';
import { groupDraw, groupEliminatedRound, knockoutFromGroups, playGroup, type GroupStageResult } from './groups';
import { each, fillQualifiers, playKnockout, qualRoundName, slotField, type KnockoutResult, type PlayFn } from './knockout';
import { matchConfigFor, simulateMatch, type MatchResult, type SideInput } from './match';
import type { Rng } from './rng';
import type { Discipline, DrawSlot, DrawStep, EntrantId, Match, MatchConfig, Pair, Player, Ruleset, TournamentDef } from './types';
import type { MatchRound } from './knockout';

// Satu nomor (mis. MS) dalam satu turnamen: entry → kualifikasi → drawing → main draw.
// Semua tahap dikembalikan agar Wizard bisa menampilkannya satu per satu.

export interface EventRun {
  entry: EntryList;
  qualSections: (Candidate | null)[][];
  qualResults: KnockoutResult[];
  draw: DrawResult; // sebelum qualifier diisi (sesuai urutan GCR: drawing sebelum kualifikasi selesai)
  slots: DrawSlot[]; // setelah qualifier diisi
  main: KnockoutResult; // untuk format grup: `reached` juga berisi peserta yang tersingkir di grup
  groups?: GroupStageResult;
}

/** Undian yang siap ditampilkan (live drawing). Bagan gugur: `size` posisi; format grup: `groups` grup. */
export interface DrawShow {
  tournamentId: string;
  discipline?: Discipline; // kosong = beregu (peserta = negara)
  entrants: EntrantId[];
  steps: DrawStep[];
  size?: number;
  groups?: number;
  /** Bagan kualifikasi per nomor (ditampilkan sebelum undian babak utama); turnamen dimainkan: semua nomor di undian pertama. */
  quals?: { discipline: Discipline; sections: (Candidate | null)[][] }[];
}
/** Daftar entry semua nomor satu turnamen (ditampilkan sekaligus sebelum undian). */
export interface EntriesShow { tournamentId: string; lists: { discipline: Discipline; entry: EntryList }[] }
/** Kembalikan Promise (selesai saat daftar ditutup) untuk menampilkan daftar entry, atau null untuk langsung lanjut. */
export type EntriesHook = (e: EntriesShow) => Promise<void> | null;
/** Kembalikan Promise (selesai saat undian ditutup) untuk menampilkan undian, atau null untuk langsung lanjut. */
export type DrawHook = (d: DrawShow) => Promise<void> | null;

export async function runEvent(opts: {
  tournament: TournamentDef; discipline: Discipline; year: number; hostCountryId: string;
  candidates: Candidate[]; ruleset: Ruleset; rng: Rng; play: PlayFn; onDraw?: DrawHook;
  /** Laga satu babak dimulai bersamaan (untuk gerbang babak). */
  parallel?: boolean;
  /** Dipanggil setelah entry diterima, sebelum undian (menunggu daftar entry semua nomor ditampilkan). */
  onEntries?: (entry: EntryList) => Promise<void>;
  /** Catatan sementara setelah undian; diisi terus selama turnamen berjalan (bagan gugur saja). */
  onRecord?: (rec: EventRecord) => void;
}): Promise<EventRun> {
  const { tournament, discipline, ruleset, rng, candidates, parallel } = opts;
  const tier = ruleset.tiers.find((t) => t.id === tournament.tierId)!;
  const size = tier.drawSize[discipline];

  // Wildcard tuan rumah: entri terbaik dari negara tuan rumah yang tidak lolos langsung
  // (GCR 7.11, `wildcardOnlyIfHostAbsent`: hanya bila tuan rumah belum punya wakil di bagan utama nomor itu).
  const prelim = acceptEntries(candidates, [], tier, size, ruleset, rng);
  const direct = new Set(prelim.main.map((c) => c.id));
  const hostInMain = prelim.main.some((c) => c.countryId === opts.hostCountryId);
  const wildcardIds = tier.wildcardOnlyIfHostAbsent && hostInMain ? [] : candidates
    .filter((c) => c.countryId === opts.hostCountryId && !direct.has(c.id))
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .slice(0, tier.wildcards)
    .map((c) => c.id);

  const entry = acceptEntries(candidates, wildcardIds, tier, size, ruleset, rng);
  await opts.onEntries?.(entry);
  const gs = tier.groupStage?.[discipline];
  if (gs) {
    // Fase grup: tanpa kualifikasi; semua yang diterima (langsung + wildcard) masuk undian pot.
    const all = [...entry.main, ...entry.wildcards.map((w) => ({ ...w, wildcard: true }))]
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const drawn = groupDraw(all, gs, rng);
    const groups = drawn.groups.map((g) => g.map((e) => e.id));
    await opts.onDraw?.({ tournamentId: tournament.id, discipline, entrants: all.map((e) => e.id), steps: drawn.steps, groups: gs.groups });
    const standings = await each(parallel, groups, (g) => playGroup(g, opts.play, parallel));
    const field = knockoutFromGroups(standings, gs.advance, rng);
    const main = await playKnockout(field, opts.play, undefined, parallel);
    standings.forEach((s) => s.forEach((row, place) => {
      if (place >= gs.advance) main.reached.set(row.id, groupEliminatedRound(field.length, place + 1, gs.advance));
    }));
    const slots = field.map((id, i) => ({ pos: i + 1, entrant: id ?? undefined, bye: !id }));
    return { entry, qualSections: [], qualResults: [], draw: { slots, steps: drawn.steps }, slots, main, groups: { groups, standings, steps: drawn.steps } };
  }

  const qualSections = entry.qualifierSlots ? qualifyingSections(entry.qualifying, entry.qualifierSlots, tier.qualifyingPerSlot, rng, tier.grade === 3) : [];
  const drawEntrants = [...entry.main, ...entry.wildcards.map((w) => ({ ...w, wildcard: true }))]
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const draw = makeDraw(drawEntrants, entry.qualifierSlots, tier.grade, ruleset, rng);
  const qualRounds = qualSections.map(() => [] as (EntrantId | null)[][]);
  const rec: EventRecord = { tournamentId: tournament.id, year: opts.year, discipline, entry, qualRounds, steps: draw.steps, slots: draw.slots, rounds: [slotField(draw.slots)] };
  qualSections.forEach((sec, i) => qualRounds[i].push(sec.map((c) => c?.id ?? null)));
  opts.onRecord?.(rec);
  await opts.onDraw?.({ tournamentId: tournament.id, discipline, entrants: drawEntrants.map((e) => e.id), steps: draw.steps, size: draw.slots.length, quals: qualSections.length ? [{ discipline, sections: qualSections }] : [] });

  qualRounds.forEach((r) => { r.length = 0; }); // diisi ulang babak demi babak oleh playKnockout
  const qualResults = await each(parallel, qualSections, (sec, i) => playKnockout(sec.map((c) => c?.id ?? null), opts.play, qualRoundName, parallel, qualRounds[i]));
  const slots = fillQualifiers(draw.slots, qualResults.map((r) => r.rounds.at(-1)![0]), rng);
  rec.slots = slots;
  rec.rounds = [];
  const main = await playKnockout(slotField(slots), opts.play, undefined, parallel, rec.rounds);
  return { entry, qualSections, qualResults, draw, slots, main };
}

/**
 * Catatan satu nomor turnamen untuk halaman turnamen di karier (disimpan di save; skor diambil dari daftar laga).
 * Sama dengan EventRun tanpa Map & data sementara, agar bisa disimpan sebagai JSON.
 */
export interface EventRecord {
  tournamentId: string;
  year: number;
  discipline: Discipline;
  entry: EntryList;
  qualRounds: (EntrantId | null)[][][]; // per seksi kualifikasi: babak demi babak
  steps: DrawStep[]; // langkah undian bagan utama (format grup: undian pot)
  slots: DrawSlot[]; // posisi bagan utama setelah qualifier diisi (unggulan, bye, WC, Q)
  rounds: (EntrantId | null)[][]; // bagan utama: rounds[0] = posisi awal, terakhir = [juara]
  groups?: GroupStageResult;
}

export const toRecord = (tournamentId: string, year: number, discipline: Discipline, run: EventRun): EventRecord => ({
  tournamentId, year, discipline, entry: run.entry, qualRounds: run.qualResults.map((r) => r.rounds),
  steps: run.draw.steps, slots: run.slots, rounds: run.main.rounds, groups: run.groups,
});

/** Informasi laga untuk Live Match. */
export interface LiveRequest {
  sides: [SideInput, SideInput];
  entrants: [EntrantId, EntrantId];
  round: MatchRound;
  tournamentId: string;
  discipline: Discipline;
}
/** Kembalikan Promise hasil laga untuk memainkannya Live, atau null untuk Auto. */
export type LiveHook = (req: LiveRequest) => Promise<MatchResult> | null;

/** PlayFn berbasis mesin pertandingan; setiap laga dicatat ke `matches`. */
export function simPlay(opts: {
  players: Map<string, Player>; pairs: Map<string, Pair>; cfg: MatchConfig; rng: Rng;
  tournamentId: string; year: number; discipline: Discipline; matches: Match[]; live?: LiveHook;
}): PlayFn {
  const side = (id: EntrantId): SideInput => {
    const pair = opts.pairs.get(id);
    return pair
      ? { players: pair.playerIds.map((p) => opts.players.get(p)!), chemistry: pair.chemistry }
      : { players: [opts.players.get(id)!] };
  };
  const record = (a: EntrantId, b: EntrantId, round: MatchRound, r: MatchResult) => {
    opts.matches.push({
      ...r, id: `${opts.tournamentId}-${opts.year}-${opts.discipline}-${opts.matches.length + 1}`,
      tournamentId: opts.tournamentId, year: opts.year, discipline: opts.discipline, round, sides: [a, b],
    });
    return r;
  };
  return (a, b, round) => {
    const sides: [SideInput, SideInput] = [side(a), side(b)];
    const live = opts.live?.({ sides, entrants: [a, b], round, tournamentId: opts.tournamentId, discipline: opts.discipline });
    if (live) return live.then((r) => record(a, b, round, r));
    return record(a, b, round, simulateMatch(sides, matchConfigFor(opts.cfg, opts.year), opts.rng));
  };
}
