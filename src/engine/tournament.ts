import { makeDraw, type DrawResult } from './draw';
import { acceptEntries, qualifyingSections, type Candidate, type EntryList } from './entry';
import { groupDraw, groupEliminatedRound, knockoutFromGroups, playGroup, type GroupStageResult } from './groups';
import { each, fillQualifiers, playKnockout, qualRoundName, slotField, type KnockoutResult, type PlayFn } from './knockout';
import { roundOrder } from './gate';
import { emptyStats, matchConfigFor, simulateMatch, type MatchResult, type SideInput } from './match';
import type { DayPlan } from './schedule';
import { hasTrait, QUICK_RECOVERY } from './traits';
import { normal, type Rng } from './rng';
import type { Discipline, DrawSlot, DrawStep, EntrantId, Match, MatchConfig, Pair, Player, Ruleset, TeamFormat, Tier, TournamentDef } from './types';
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
  /** Beregu: format (Thomas/Uber/…) & undian babak gugur setelah fase grup. */
  format?: TeamFormat;
  ko?: true;
}
/** Daftar entry semua nomor satu turnamen (ditampilkan sekaligus sebelum undian). */
export interface EntriesShow { tournamentId: string; lists: { discipline: Discipline; entry: EntryList }[] }
/** Kembalikan Promise (selesai saat daftar ditutup) untuk menampilkan daftar entry, atau null untuk langsung lanjut. */
export type EntriesHook = (e: EntriesShow) => Promise<void> | null;
/** Kembalikan Promise (selesai saat undian ditutup) untuk menampilkan undian, atau null untuk langsung lanjut. */
export type DrawHook = (d: DrawShow) => Promise<void> | null;

/**
 * World Tour 6.4.2 (Level 2–4): tuan rumah tanpa entri di `wildcardTop` besar (ranking) semua nomor → maks `tier.wildcards`
 * wildcard untuk seluruh turnamen; satu entri → satu kurang; dst. Satu per nomor, ke wakil tuan rumah terbaik yang tidak
 * masuk `wildcardTop` besar. ASUMSI: tuan rumah memilih nomor dengan wakil berperingkat terbaik.
 */
export function tournamentWildcards(tier: Tier, byDiscipline: [Discipline, Candidate[]][], hostCountryId: string): Map<Discipline, EntrantId[]> {
  const top = tier.wildcardTop ?? 0;
  const byRank = (a: Candidate, b: Candidate) => (a.rank ?? Infinity) - (b.rank ?? Infinity);
  let inTop = 0;
  const options: { d: Discipline; c: Candidate }[] = [];
  for (const [d, cands] of byDiscipline) {
    const order = [...cands].sort(byRank);
    inTop += order.slice(0, top).filter((c) => c.countryId === hostCountryId).length;
    const best = order.length > top ? order.slice(top).find((c) => c.countryId === hostCountryId) : undefined;
    if (best) options.push({ d, c: best });
  }
  const picked = options.sort((a, b) => byRank(a.c, b.c)).slice(0, Math.max(0, tier.wildcards - inTop));
  return new Map(picked.map(({ d, c }) => [d, [c.id]]));
}

export async function runEvent(opts: {
  tournament: TournamentDef; discipline: Discipline; year: number; hostCountryId: string;
  candidates: Candidate[]; ruleset: Ruleset; rng: Rng; play: PlayFn; onDraw?: DrawHook;
  /** Wildcard nomor ini yang sudah ditentukan untuk seluruh turnamen (`tournamentWildcards`). */
  wildcardIds?: EntrantId[];
  /** Laga satu babak dimulai bersamaan (untuk gerbang babak). */
  parallel?: boolean;
  /** Dipanggil setelah entry diterima, sebelum undian (menunggu daftar entry semua nomor ditampilkan). */
  onEntries?: (entry: EntryList) => Promise<void>;
  /** Catatan sementara sejak undian; diisi terus selama turnamen berjalan (grup & bagan gugur). */
  onRecord?: (rec: EventRecord) => void;
}): Promise<EventRun> {
  const { tournament, discipline, ruleset, rng, candidates, parallel } = opts;
  const tier = ruleset.tiers.find((t) => t.id === tournament.tierId)!;
  const size = tier.drawSize[discipline];

  // Wildcard tuan rumah: entri terbaik dari negara tuan rumah yang tidak lolos langsung
  // (GCR 7.11, `wildcardOnlyIfHostAbsent`: hanya bila tuan rumah belum punya wakil di bagan utama nomor itu).
  // World Tour Level 2–4 (`wildcardTop`): jatah dibagi per turnamen lewat `tournamentWildcards`; tanpa `wildcardIds`
  // (Test Lab, satu nomor) dihitung dari nomor ini saja.
  const prelim = acceptEntries(candidates, [], tier, size, ruleset, rng, discipline);
  const direct = new Set(prelim.main.map((c) => c.id));
  const hostInMain = prelim.main.some((c) => c.countryId === opts.hostCountryId);
  const wildcardIds = opts.wildcardIds
    ?? (tier.wildcardTop ? tournamentWildcards(tier, [[discipline, candidates]], opts.hostCountryId).get(discipline) ?? []
    : tier.wildcardOnlyIfHostAbsent && hostInMain ? [] : candidates
      .filter((c) => c.countryId === opts.hostCountryId && !direct.has(c.id))
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
      .slice(0, tier.wildcards)
      .map((c) => c.id));

  const entry = acceptEntries(candidates, wildcardIds, tier, size, ruleset, rng, discipline);
  await opts.onEntries?.(entry);
  const gs = tier.groupStage?.[discipline];
  if (gs) {
    // Fase grup: tanpa kualifikasi; semua yang diterima (langsung + wildcard) masuk undian pot.
    const all = [...entry.main, ...entry.wildcards.map((w) => ({ ...w, wildcard: true }))]
      .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
    const drawn = groupDraw(all, gs, rng);
    const groups = drawn.groups.map((g) => g.map((e) => e.id));
    // Catatan sementara: klasemen grup diisi per grup yang selesai, lalu bagan gugur babak demi babak.
    const rec: EventRecord = { tournamentId: tournament.id, year: opts.year, discipline, entry, qualRounds: [], steps: drawn.steps, slots: [], rounds: [], groups: { groups, standings: [], steps: drawn.steps } };
    opts.onRecord?.(rec);
    await opts.onDraw?.({ tournamentId: tournament.id, discipline, entrants: all.map((e) => e.id), steps: drawn.steps, groups: gs.groups });
    const standings = await each(parallel, groups, async (g, i) => (rec.groups!.standings[i] = await playGroup(g, (a, b, r, at) => opts.play(a, b, r, { ...at!, i, n: groups.length }), parallel)));
    const field = knockoutFromGroups(standings, gs.advance, rng);
    const slots = field.map((id, i) => ({ pos: i + 1, entrant: id ?? undefined, bye: !id }));
    rec.slots = slots;
    const main = await playKnockout(field, opts.play, undefined, parallel, rec.rounds);
    standings.forEach((s) => s.forEach((row, place) => {
      if (place >= gs.advance) main.reached.set(row.id, groupEliminatedRound(field.length, place + 1, gs.advance));
    }));
    return { entry, qualSections: [], qualResults: [], draw: { slots, steps: drawn.steps }, slots, main, groups: { groups, standings, steps: drawn.steps } };
  }

  const qualSections = entry.qualifierSlots ? qualifyingSections(entry.qualifying, entry.qualifierSlots, tier.qualifyingPerSlot, rng, tier.grade === 3) : [];
  const drawEntrants = [...entry.main, ...entry.wildcards.map((w) => ({ ...w, wildcard: true }))]
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const draw = makeDraw(drawEntrants, entry.qualifierSlots, tier.grade, ruleset, rng, !tier.noCountrySeparation);
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
  /** Laga memakai Instant Review (Hawk-Eye). */
  review?: boolean;
}
/** Kembalikan Promise hasil laga untuk memainkannya Live, atau null untuk Auto. */
export type LiveHook = (req: LiveRequest) => Promise<MatchResult> | null;

/** Kondisi hari itu per peserta selama satu minggu turnamen: bagian acak yang terbawa (`v`) & jumlah kemenangan. */
export type HotForm = Record<EntrantId, { v: number; wins: number }>;

/** Kondisi hari itu (termasuk bonus kemenangan) untuk laga berikutnya peserta; `hot` diperbarui. */
export function nextDayForm(hot: HotForm, id: EntrantId, cfg: MatchConfig, rng: Rng) {
  const { sd, carry, winBonus, winCap } = cfg.dayForm;
  const h = hot[id];
  // Sebaran tetap `sd`: carry·v + acak baru dengan simpangan sd·√(1 − carry²).
  const v = h ? carry * h.v + normal(rng, 0, sd * Math.sqrt(1 - carry ** 2)) : normal(rng, 0, sd);
  hot[id] = { v, wins: h?.wins ?? 0 };
  return v + Math.min(winCap, (h?.wins ?? 0) * winBonus);
}

/**
 * Beban turnamen bersama semua nomor satu turnamen: laga tiap atlet (hari & sisa energi yang ditinggalkan), atlet yang cedera,
 * dan peserta yang ditarik manajer dari satu nomor (`nomor:peserta`).
 */
export interface TourState { log: Map<string, { day: number; cost: number }[]>; out: Set<string>; withdrawn: Set<string> }
export const newTour = (): TourState => ({ log: new Map(), out: new Set(), withdrawn: new Set() });
/** Bawaan `MatchConfig.energy.tour` (save lama). */
export const TOUR_LOAD = { perMinute: 0.25, night: 0.4, sameDay: 0.85 };

/**
 * PlayFn berbasis mesin pertandingan; setiap laga dicatat ke `matches`. `hot`: kondisi terbawa antar laga (on fire).
 * Jadwal harian: `plan` menentukan hari laga; `tour` membawa beban antar hari (energi awal lebih rendah setelah laga panjang,
 * apalagi laga kedua di hari yang sama) & atlet cedera (walkover di sisa laganya). `injury`: undian cedera sebelum laga.
 * ponytail: simulasi otomatis memainkan nomor berurutan (MS…XD), jadi atlet dua nomor hanya terbebani laga nomor yang
 * sudah disimulasikan (tepat untuk nomor kedua, kurang untuk yang pertama); turnamen yang dimainkan manajer tepat urut hari.
 */
export function simPlay(opts: {
  players: Map<string, Player>; pairs: Map<string, Pair>; cfg: MatchConfig; rng: Rng;
  tournamentId: string; year: number; discipline: Discipline; matches: Match[]; live?: LiveHook; hot?: HotForm;
  /** Turnamen besar: semua laganya "laga besar" (sifat mental); selain itu hanya SF/F. */
  big?: boolean;
  /** Instant Review (Hawk-Eye) dipakai di semua laga turnamen ini. */
  review?: boolean;
  plan?: DayPlan;
  tour?: TourState;
  /** Undian cedera atlet sebelum laga (`played` = laganya di turnamen ini sejauh ini); true = cedera (sudah dicatat). */
  injury?: (p: Player, played: number) => boolean;
  /** Laga siaran (Hawk-Eye hanya di laga siaran); kosong = semua laga. */
  tv?: (sides: [EntrantId, EntrantId], round: MatchRound) => boolean;
}): PlayFn {
  const cfg = matchConfigFor(opts.cfg, opts.year);
  const load = cfg.energy.tour ?? TOUR_LOAD;
  const idsOf = (id: EntrantId) => opts.pairs.get(id)?.playerIds ?? [id];
  const log = (id: string) => opts.tour?.log.get(id) ?? [];
  // Energi yang belum pulih pada hari `day`: laga hari-hari sebelumnya meluruh tiap malam (pulih cepat: lebih banyak).
  const debt = (p: Player, day: number) => log(p.id).reduce((t, x) => t + (x.day < day
    ? x.cost * (hasTrait(p, 'quickRecovery') ? load.night ** QUICK_RECOVERY : load.night) ** (day - x.day)
    : x.day === day ? x.cost * load.sameDay : 0), 0);
  const side = (id: EntrantId, big: boolean, day: number): SideInput => {
    const pair = opts.pairs.get(id);
    const form = opts.hot && nextDayForm(opts.hot, id, opts.cfg, opts.rng);
    const players = idsOf(id).map((p) => opts.players.get(p)!);
    const age = players.reduce((t, p) => t + opts.year - p.birth.year, 0) / players.length;
    const extra = opts.tour && {
      load: players.reduce((t, p) => t + debt(p, day), 0) / players.length,
      today: Math.max(...players.map((p) => log(p.id).filter((x) => x.day === day).length)),
    };
    return { players, ...(pair && { chemistry: pair.chemistry }), day: form, big, age, ...extra };
  };
  const record = (a: EntrantId, b: EntrantId, round: MatchRound, r: MatchResult) => {
    const won = opts.hot?.[r.winner === 0 ? a : b];
    if (won) won.wins++;
    opts.matches.push({
      ...r, id: `${opts.tournamentId}-${opts.year}-${opts.discipline}-${opts.matches.length + 1}`,
      tournamentId: opts.tournamentId, year: opts.year, discipline: opts.discipline, round, sides: [a, b],
    });
    return r;
  };
  return (a, b, round, at) => {
    const ids = [idsOf(a), idsOf(b)];
    // Atlet cedera di turnamen ini: walkover di sisa laganya (semua nomor); peserta yang ditarik: walkover di nomor ini.
    const gone = opts.tour ? [a, b].findIndex((id, k) => opts.tour!.withdrawn.has(`${opts.discipline}:${id}`) || ids[k].some((p) => opts.tour!.out.has(p))) : -1;
    if (gone >= 0) return record(a, b, round, { winner: (1 - gone) as 0 | 1, scores: [], stats: emptyStats(), walkover: true });
    // Tanpa jadwal (beregu): satu babak = satu hari, matchday grup berurutan.
    const day = opts.plan?.day(opts.discipline, round, at) ?? (round === 'G' ? 50 + (at?.md ?? 0) : roundOrder(round));
    const big = !!opts.big || round === 'SF' || round === 'F';
    const sides: [SideInput, SideInput] = [side(a, big, day), side(b, big, day)];
    // Cedera: sisi yang cedera mundur di tengah laga (reli acak; laga yang lebih pendek selesai biasa), lalu walkover di sisa laganya.
    const hurt: string[] = [];
    ids.forEach((ps, k) => ps.forEach((p) => {
      if (opts.injury?.(opts.players.get(p)!, log(p).length)) {
        hurt.push(p);
        sides[k].retireAt ??= 1 + Math.floor(opts.rng() * 120);
      }
    }));
    const done = (r: MatchResult) => {
      const cost = load.perMinute * r.stats.sec / 60;
      if (opts.tour) for (const p of ids.flat()) opts.tour.log.set(p, [...log(p), { day, cost }]);
      for (const p of hurt) opts.tour?.out.add(p);
      return record(a, b, round, r);
    };
    const review = opts.review && (opts.tv?.([a, b], round) ?? true);
    const live = opts.live?.({ sides, entrants: [a, b], round, tournamentId: opts.tournamentId, discipline: opts.discipline, review });
    if (live) return live.then(done);
    return done(simulateMatch(sides, cfg, opts.rng, undefined, review));
  };
}
