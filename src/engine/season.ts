import { seasonGoals, seasonReport } from './career';
import { applySevereInjury, developQuarter, newJuniors, retirementChance, rollInjury } from './development';
import { applyCountryQuota, type Candidate } from './entry';
import { ageAt, currentAbility, generateWorld, isJuniorAge, isPratama } from './generator';
import { absWeek, computeRace, computeRanking, knockoutResults, rankMap } from './ranking';
import { makeRng, shuffle, type Rng } from './rng';
import type { Standing } from './groups';
import { each, type MatchRound, type PlayFn } from './knockout';
import { juniorEntries, juniorTeamEntrants } from './junior';
import { AD_HOC, adHocEntrants, autoLineup, autoSquad, lineupError, playTie, runTeamEvent, squadError, squadPool, type Lineup, type TeamEntrant } from './team';
import { runEvent, simPlay, toRecord, type DrawHook, type EventRecord, type LiveHook } from './tournament';
import { roundGate, type RoundHook } from './gate';
import { makeScouting, recruit, SCOUTING_DEADLINE_WEEK, type Scouting } from './scouting';
import {
  DISCIPLINES, isDoubles, isJuniorFormat, ROUNDS, type Career, type City, type Confederation, type Discipline, type DrawStep, type EntrantId, type GameDate, type Match, type Pair,
  type Player, type RankingEntry, type Round, type Ruleset, type Tier, type TeamEventDef, type TeamFormat, type TierId, type TournamentDef, type World,
} from './types';

// Loop musim: tiap minggu AI tiap negara memilih turnamen, turnamen dimainkan, ranking & kelelahan diperbarui.

export interface Champion {
  tournamentId: string;
  year: number;
  discipline: Discipline;
  winner: EntrantId;
}

export interface Violation {
  entrantId: EntrantId;
  countryId: string;
  tournamentId: string;
  year: number;
}

export interface SeasonState {
  date: GameDate;
  players: Player[];
  pairs: Pair[];
  results: RankingEntry[];
  matches: Match[];
  champions: Champion[];
  /** Poin turnamen junior (ranking junior dunia), terpisah dari ranking senior. */
  juniorResults: RankingEntry[];
  /** Sistem promosi junior aktif (save lama dimigrasi sekali saat dimuat). */
  juniorPromotion?: true;
  /** Top Committed Players musim ini: entrantId → id turnamen wajib. */
  commitments: Record<EntrantId, string[]>;
  commitmentsYear?: number;
  violations: Violation[];
  /** Laga berbobot per atlet di kuartal berjalan (untuk bonus perkembangan). */
  experience: Record<string, number>;
  /** Negara yang pasangannya diatur manajer (AI tidak membentuk pasangan baru di sana). */
  managedCountryId?: string | null;
  career?: Career;
  /** Keputusan entry manajer: "tahun-minggu" → entrantId → eventId atau 'rest'. Tanpa keputusan = saran AI. */
  manualEntries: Record<string, Record<string, string>>;
  /** Prioritas tier entry otomatis negara manajer: entrantId (atlet tunggal / pasangan) → tier yang diikuti. Kosong = AI bebas. */
  tierPrefs?: Record<string, TierId[]>;
  /** Pencarian bakat junior negara manajer yang belum diputuskan (kandidat akhir musim). */
  scouting?: Scouting;
  /** Turnamen yang entry-nya sudah di-submit manajer: "tahun:eventId" (hanya status di Kalender). */
  entriesSubmitted?: Record<string, true>;
  /** Snapshot ranking tiap 4 minggu (top 300 per nomor) untuk grafik riwayat peringkat. */
  rankSnapshots: { absWeek: number; discipline: Discipline; ids: string[] }[];
  /** Hasil kejuaraan beregu (kontinental & final). */
  teamResults: TeamResult[];
  /** Line-up beregu pilihan manajer per format; tidak sah (cedera, pasangan bubar) → line-up otomatis. */
  teamLineups: Partial<Record<TeamFormat, Lineup>>;
  /** Skuad beregu pilihan manajer per format (dipakai bila manajer tidak memilih saat turnamen dimulai). */
  teamSquads: Partial<Record<TeamFormat, string[]>>;
  /** Hadiah uang (USD) per tahun per atlet; ganda dibagi dua per atlet. */
  earnings: Record<string, Record<string, number>>;
  /** Catatan turnamen (entry, kualifikasi, undian, bagan) 2 musim terakhir, untuk halaman turnamen. */
  eventRecords: EventRecord[];
}

/** Keputusan beregu manajer. Kembalikan Promise untuk menunggu pilihan di UI, atau null untuk otomatis. */
export interface TeamHook {
  squad: (req: { eventId: string; format: TeamFormat; pool: Record<string, TeamEntrant[]>; suggested: string[] }) => Promise<string[]> | null;
  lineup: (req: { eventId: string; format: TeamFormat; round: MatchRound; opponent: string; pool: Record<string, TeamEntrant[]>; squad: string[]; suggested: Lineup }) => Promise<Lineup> | null;
}

/** `matchIds`: laga per partai berurutan (partai walkover tidak punya laga). Save lama: tidak ada. */
export interface TeamTie { round: MatchRound; sides: [string, string]; score: [number, number]; matchIds?: string[] }

export interface TeamResult {
  eventId: string;
  year: number;
  format: TeamFormat;
  confederation?: Confederation;
  teams: string[]; // id negara, urut unggulan
  groups?: string[][];
  standings?: Standing[][]; // gameDiff = selisih partai, pointDiff = selisih game
  reached: Record<string, MatchRound | 'W'>; // babak gugur terakhir; tim yang tersingkir di grup tidak ada di sini
  ties: TeamTie[];
  squads: Record<string, string[]>; // skuad terdaftar per negara
  drawSteps?: DrawStep[]; // undian pot putaran final (untuk putar ulang)
}

export const weekKey = (d: GameDate) => `${d.year}-${d.week}`;

export const isHeld = (e: { everyYears?: TournamentDef['everyYears'] }, year: number) =>
  !e.everyYears || (year % e.everyYears.interval === e.everyYears.offset) !== !!e.everyYears.invert;

/** Kota tuan rumah event di tahun tertentu: `hosts` (asli) → `rotation` (bergilir) → `cityId`. */
export const hostCityId = (e: Pick<TournamentDef, 'cityId' | 'hosts' | 'rotation'>, year: number) =>
  e.hosts?.[year] ?? (e.rotation?.length ? e.rotation[year % e.rotation.length] : e.cityId);

export interface Entrant { id: EntrantId; countryId: string; playerIds: string[]; trial?: boolean }

/** Atlet yang sudah keluar pelatnas negara manajer (tetap aktif, diatur AI). */
export const releasedIds = (state: Pick<SeasonState, 'players'>) => new Set(state.players.filter((p) => p.released !== undefined).map((p) => p.id));

/** Peserta yang dikelola manajer: negara manajer & tidak ada atletnya yang keluar pelatnas. */
export const isManaged = (state: Pick<SeasonState, 'managedCountryId'>, released: Set<string>, e: { countryId: string; playerIds: string[] }) =>
  !!state.managedCountryId && e.countryId === state.managedCountryId && !e.playerIds.some((id) => released.has(id));

/** Semua peserta potensial suatu nomor: atlet (tunggal) atau pasangan aktif (ganda). */
export function entrantsFor(state: SeasonState, d: Discipline): Entrant[] {
  const country = new Map(state.players.map((p) => [p.id, p.countryId]));
  if (isDoubles(d))
    return state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.adHoc)
      .map((p) => ({ id: p.id, countryId: country.get(p.playerIds[0])!, playerIds: [...p.playerIds], trial: p.trial }));
  const gender = d === 'MS' ? 'M' : 'F';
  return state.players.filter((p) => p.gender === gender && p.retired === undefined && p.focus !== 'D') // spesialis ganda: tidak di nomor tunggal
    .map((p) => ({ id: p.id, countryId: p.countryId, playerIds: [p.id] }));
}

/**
 * Ranking awal dunia fiktif: tiap peserta diberi 10 hasil "musim lalu" yang tersebar di 52 minggu terakhir,
 * besarnya menurut urutan kekuatan. Hasil ini kedaluwarsa bertahap dan digantikan hasil nyata.
 * ASUMSI: total poin peringkat r ≈ 110.000 × 0,985^r (≈ #1 110rb, #50 51rb, #100 24rb).
 */
export function bootstrapResults(state: SeasonState, ruleset: Ruleset): RankingEntry[] {
  const ca = new Map(state.players.map((p) => [p.id, currentAbility(p.attrs)]));
  // Pemain ganda (punya pasangan) di ranking tunggal awal ditaruh di bawah spesialis tunggal setara.
  // ASUMSI: penalti 10 poin CA; hanya urutan awal, hasil turnamen sesudahnya yang menentukan.
  const doubles = new Set(state.pairs.filter((p) => !p.dissolved && !p.trial && !p.adHoc).flatMap((p) => p.playerIds));
  const out: RankingEntry[] = [];
  const start = absWeek(state.date);
  for (const d of DISCIPLINES) {
    const single = !isDoubles(d);
    const list = entrantsFor(state, d)
      .map((e) => ({ ...e, s: e.playerIds.reduce((sum, id) => sum + ca.get(id)! - (single && doubles.has(id) ? 10 : 0), 0) / e.playerIds.length }))
      .sort((a, b) => b.s - a.s);
    list.forEach((e, r) => {
      const each = Math.round((110000 * 0.985 ** r) / 10);
      for (let k = 0; k < 10; k++) {
        const w = start - 52 + Math.round(((k + 0.5) * 52) / 10);
        out.push({
          entrantId: e.id, discipline: d, tournamentId: 'pra-musim', tierId: 'PRE',
          year: Math.floor((w - 1) / 52), week: ((w - 1) % 52) + 1, points: each, expiresAbsWeek: w + ruleset.ranking.windowWeeks,
        });
      }
    });
  }
  return out;
}

/**
 * Dunia baru siap dimainkan (minggu 1). countryId = negara manajer; null = Mode Pengamat.
 * `roster` (dari paket data): atlet & pasangan buatan sendiri; generator menambah atlet fiktif bila suatu negara kurang.
 */
export function newSeason(
  world: World, ruleset: Ruleset, seed: number, date: GameDate = { year: 2026, week: 1 }, countryId: string | null = null,
  roster?: { players: Player[]; pairs: Pair[] },
): SeasonState {
  const w = generateWorld(makeRng(seed), ruleset.generator, world.countries, date, roster?.players);
  const state: SeasonState = {
    date, players: [...structuredClone(roster?.players ?? []), ...w.players], pairs: [...structuredClone(roster?.pairs ?? []), ...w.pairs],
    results: [], juniorResults: [], matches: [], champions: [], commitments: {}, violations: [],
    juniorPromotion: true, experience: {}, manualEntries: {}, rankSnapshots: [], teamResults: [], teamLineups: {}, teamSquads: {}, eventRecords: [], earnings: {}, managedCountryId: null,
    career: { countryId, goals: [], reports: [], reputation: 50 },
  };
  if (roster?.players.length) {
    // Negara roster yang belum punya cukup pasangan. Ranking awal dulu agar spesialis tunggal tidak ikut dipasangkan.
    state.results = bootstrapResults(state, ruleset);
    formPairs(state, ruleset, world, makeRng(seed + 2));
  }
  state.managedCountryId = countryId;
  state.results = bootstrapResults(state, ruleset);
  startYear(state, ruleset, makeRng(seed + 1));
  return state;
}

/** Ganti negara di tengah karier: target musim dihitung ulang untuk negara baru. */
export function switchCountry(state: SeasonState, rs: Ruleset, countryId: string | null) {
  state.managedCountryId = countryId;
  state.career = { ...(state.career ?? { reports: [], reputation: 50 }), countryId, goals: countryId ? seasonGoals(state, rs, countryId) : [] };
}

const tierOf = (rs: Ruleset, e: TournamentDef) => rs.tiers.find((t) => t.id === e.tierId)!;

/**
 * Top Committed Players: snapshot ranking akhir tahun → top 15 tunggal / top 10 ganda wajib ikut
 * semua turnamen tier 'all' dan N turnamen tier bernilai angka (dipilih acak di awal musim).
 * WTF ditambahkan saat kualifikasi WTF ditentukan.
 */
export function startYear(state: SeasonState, rs: Ruleset, rng: Rng) {
  const { year } = state.date;
  const now = absWeek(state.date);
  const tc = rs.topCommitted;
  const held = rs.calendar.filter((e) => isHeld(e, year));
  state.commitments = {};
  for (const d of DISCIPLINES) {
    const top = computeRanking(state.results, d, now, rs).filter((r) => r.rank <= (isDoubles(d) ? tc.doubles : tc.singles));
    for (const r of top) {
      const required: string[] = [];
      for (const [tierId, rule] of Object.entries(tc.mustPlay)) {
        if (tierId === 'WTF') continue;
        const evs = held.filter((e) => e.tierId === tierId && tierOf(rs, e).drawSize[d] > 0);
        required.push(...(rule === 'all' ? evs : shuffle(rng, evs).slice(0, rule)).map((e) => e.id));
      }
      state.commitments[r.entrantId] = required;
    }
  }
  state.commitmentsYear = year;
  if (state.career?.countryId) state.career.goals = seasonGoals(state, rs, state.career.countryId);
}

/** Kualifikasi WTF: 8 teratas Race, maks 2 per negara; juara dunia tahun ini otomatis (menggantikan yang terbawah). */
export function wtfQualifiers(state: SeasonState, d: Discipline, rs: Ruleset): Candidate[] {
  const country = new Map(entrantsFor(state, d).map((e) => [e.id, e.countryId]));
  const race = computeRace(state.results, d, state.date.year, rs);
  const perCountry: Record<string, number> = {};
  const out: Candidate[] = [];
  for (const r of race) {
    if (out.length === rs.wtf.qualifiers) break;
    const c = country.get(r.entrantId);
    if (!c || (perCountry[c] ?? 0) >= rs.wtf.maxPerCountry) continue;
    perCountry[c] = (perCountry[c] ?? 0) + 1;
    out.push({ id: r.entrantId, countryId: c, rank: r.rank });
  }
  const wcIds = new Set(rs.calendar.filter((e) => e.tierId === 'WC').map((e) => e.id));
  const champ = state.champions.find((c) => c.year === state.date.year && c.discipline === d && wcIds.has(c.tournamentId))?.winner;
  if (rs.wtf.worldChampAuto && champ && country.has(champ) && !out.some((c) => c.id === champ)) {
    // ASUMSI: juara dunia menggantikan peringkat terbawah, walau kuota negaranya jadi 3.
    if (out.length === rs.wtf.qualifiers) out.pop();
    out.push({ id: champ, countryId: country.get(champ)!, rank: race.find((r) => r.entrantId === champ)?.rank ?? 999 });
  }
  return out;
}

/** Jarak lingkaran besar (km). */
function distanceKm(a: City, b: City) {
  const rad = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Pilihan turnamen AI untuk semua peserta minggu ini.
 * Urutan nomor MS→XD: turnamen pertama yang dipilih seorang atlet mengikat nomor lainnya (satu turnamen per minggu).
 * Turnamen wajib (Top Committed) selalu dipilih; lainnya menurut rentang peringkat, peluang ikut & kelelahan.
 */
function chooseEntries(state: SeasonState, events: TournamentDef[], rs: Ruleset, rng: Rng, ranks: Map<Discipline, Map<string, number>>, busy = new Set<string>()) {
  const entries = new Map(events.map((e) => [e.id, new Map<Discipline, Candidate[]>(DISCIPLINES.map((d) => [d, []]))]));
  const playerEvent = new Map<string, string>();
  const fatigue = new Map(state.players.map((p) => [p.id, p.fatigue]));
  const injured = new Set(state.players.filter((p) => p.injury).map((p) => p.id));
  const manual = state.manualEntries[weekKey(state.date)] ?? {};
  // Junior pratama negara manajer: tidak didaftarkan otomatis (manual tetap bisa).
  const pratama = new Set(state.players.filter((p) => p.countryId === state.managedCountryId && p.released === undefined && isPratama(p, state.date)).map((p) => p.id));
  const released = releasedIds(state);
  const mine = (e: Entrant) => isManaged(state, released, e);

  const wtf = events.find((e) => e.tierId === 'WTF');
  if (wtf)
    for (const d of DISCIPLINES) {
      const q = wtfQualifiers(state, d, rs);
      entries.get(wtf.id)!.set(d, q);
      const pids = new Map(entrantsFor(state, d).map((e) => [e.id, e.playerIds]));
      for (const c of q) {
        pids.get(c.id)!.forEach((id) => playerEvent.set(id, wtf.id));
        (state.commitments[c.id] ??= []).push(wtf.id);
      }
    }

  // Keputusan manual manajer diproses lebih dulu (tidak didahului pilihan AI yang mengikat atletnya ke turnamen lain).
  // Satu atlet: satu turnamen per minggu, dan satu pasangan per nomor (pasangan utama ATAU percobaan).
  const playerDisc = new Set<string>();
  const all = DISCIPLINES.flatMap((d) => entrantsFor(state, d).map((e) => ({ e, d })));
  const isManual = (x: { e: Entrant }) => mine(x.e) && manual[x.e.id] !== undefined;
  for (const { e, d } of [...all.filter(isManual), ...all.filter((x) => !isManual(x))]) {
    const taken = wtf ? entries.get(wtf.id)!.get(d)!.some((c) => c.id === e.id) : false;
    if (taken || e.playerIds.some((id) => injured.has(id) || playerDisc.has(`${id}:${d}`))) continue;
    const rank = ranks.get(d)!.get(e.id);
    const fixed = e.playerIds.map((id) => playerEvent.get(id)).find(Boolean);
    const options = events.filter((ev) => ev.tierId !== 'WTF' && tierOf(rs, ev).drawSize[d] > 0 && (!fixed || ev.id === fixed));
    const decision = mine(e) ? manual[e.id] : undefined;
    if (!decision && e.playerIds.some((id) => pratama.has(id) || busy.has(id))) continue;
    let choice = decision ? options.find((ev) => ev.id === decision) : options.find((ev) => state.commitments[e.id]?.includes(ev.id));
    if (!choice && !decision && !e.trial) { // pasangan percobaan tidak pernah didaftarkan AI
      const tired = Math.max(...e.playerIds.map((id) => fatigue.get(id)!));
      const prefs = mine(e) ? state.tierPrefs?.[e.id] : undefined;
      const ev = aiEventChoice(options, rs, rank, prefs);
      // prioritas manajer: selalu diikuti (kecuali lelah); tanpa prioritas: peluang ikut per tier & kelelahan
      if (ev && tired <= rs.ai.restAbove && (prefs?.length || rng() < (rs.ai.playProb[ev.tierId] ?? 0.5) * (1 - tired / 150))) choice = ev;
    }
    if (!choice) continue;
    entries.get(choice.id)!.get(d)!.push({ id: e.id, countryId: e.countryId, rank });
    e.playerIds.forEach((id) => { playerEvent.set(id, choice.id); playerDisc.add(`${id}:${d}`); });
  }
  return entries;
}

/**
 * Turnamen pilihan AI sebelum peluang ikut & kelelahan (`options` urut tier tertinggi dulu):
 * prioritas tier manajer bila ada, selain itu turnamen pertama yang rentang rankingnya cocok.
 */
export function aiEventChoice<T extends { tierId: string }>(options: T[], rs: Ruleset, rank: number | undefined, prefs?: string[]) {
  if (prefs?.length) return options.find((x) => prefs.includes(x.tierId));
  const r = rank ?? 9999;
  return options.find((x) => { const [lo, hi] = rs.ai.rankRange[x.tierId] ?? [1, 9999]; return r >= lo && r <= hi; });
}

/** Pilihan turnamen minggu ini: id turnamen yang dimainkan manajer, atau null = simulasikan sisanya. */
export type ChooseEvent = (req: { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[] }) => Promise<string | null>;

/**
 * Titik keputusan UI selama satu minggu (semua opsional). Dengan `chooseEvent`: turnamen yang dipilih dimainkan
 * interaktif per babak (gerbang babak; `draw`, `round`, `live`, `team` aktif), sisanya otomatis tanpa hook.
 * Tanpa `chooseEvent`: semua turnamen berurutan dengan hook yang diberikan.
 */
export interface WeekHooks { live?: LiveHook; team?: TeamHook; draw?: DrawHook; round?: RoundHook; chooseEvent?: ChooseEvent }

/** Satu minggu kalender. Hook yang mengembalikan Promise membuat simulasi menunggu keputusan di UI. */
export async function playWeek(state: SeasonState, rs: Ruleset, world: World, rng: Rng, hooks: WeekHooks = {}) {
  const { year, week } = state.date;
  if (state.commitmentsYear !== year) startYear(state, rs, rng);
  if (state.scouting && week > SCOUTING_DEADLINE_WEEK) recruit(state, []); // batas memilih lewat: isi otomatis
  const events = rs.calendar.filter((e) => e.week === week && isHeld(e, year)).sort((a, b) => tierOf(rs, b).points[0] - tierOf(rs, a).points[0]);
  const teamEvents = rs.team.events.filter((e) => e.week === week && isHeld(e, year));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const cities = new Map(world.cities.map((c) => [c.id, c]));
  const cutoff = absWeek(state.date) - rs.ranking.entryCutoffWeeks;
  const ranks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, cutoff, rs))]));

  for (const p of state.players) {
    p.fatigue = Math.max(0, p.fatigue - rs.fatigue.recoveryPerWeek);
    if (p.injury && --p.injury.weeksLeft <= 0) p.injury = undefined;
  }
  const isJunior = (e: TournamentDef) => !!tierOf(rs, e).junior;
  // Pilihan pertama diminta sebelum entry dihitung: manajer masih bisa mengisi entry dari layar minggu.
  const all = [...events.map((e) => ({ id: e.id, kind: 'individual' as const })), ...teamEvents.map((e) => ({ id: e.id, kind: 'team' as const }))];
  const played: string[] = [];
  const ask = () => (hooks.chooseEvent && played.length < all.length ? hooks.chooseEvent({ week, events: all, played }) : null);
  let pick = await ask();
  // Turnamen junior lebih dulu: atlet yang ikut tidak didaftarkan ke turnamen senior minggu ini.
  const juniorRanks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.juniorResults, d, cutoff, rs))]));
  const junior = juniorEntries(state, events.filter(isJunior), rs, world, juniorRanks, state.manualEntries[weekKey(state.date)] ?? {}, rng);
  state.pairs.push(...junior.created);
  for (const p of junior.created) pairs.set(p.id, p);
  // Minggu beregu junior (Suhandinata Cup): semua junior disiapkan untuk timnya, tidak didaftarkan otomatis ke turnamen senior.
  if (teamEvents.some((e) => e.formats?.some(isJuniorFormat)))
    for (const p of state.players) if (isJuniorAge(p, state.date)) junior.busy.add(p.id);
  const entries = chooseEntries(state, events.filter((e) => !isJunior(e)), rs, rng, ranks, junior.busy);
  for (const [id, byD] of junior.entries) entries.set(id, byD);

  /** Satu turnamen individu; `gated` = kelima nomor bersamaan lewat gerbang babak. */
  const playEvent = async (event: TournamentDef, h: WeekHooks, gated: boolean) => {
    const tier = tierOf(rs, event);
    const city = cities.get(hostCityId(event, year))!;
    const firstMatch = state.matches.length;
    const gate = gated ? roundGate(event.id, DISCIPLINES, h.round) : undefined;
    const draw: DrawHook | undefined = gate && h.draw ? (d) => gate.serial(async () => { await h.draw!(d); }) : h.draw;
    const ds = DISCIPLINES.filter((d) => tier.drawSize[d] > 0 && entries.get(event.id)!.get(d)!.length >= 2);
    const runs = await each(gated, ds, (d) => {
      let candidates = entries.get(event.id)!.get(d)!;
      if (tier.countryQuota) candidates = applyCountryQuota(candidates, tier.countryQuota);
      const sim = simPlay({ players, pairs, cfg: rs.match, rng, tournamentId: event.id, year, discipline: d, matches: state.matches, live: h.live });
      const play = gate ? gate.wrap(d, sim) : sim;
      return runEvent({ tournament: event, discipline: d, year, hostCountryId: city.countryId, candidates, ruleset: rs, rng, play, onDraw: draw, parallel: gated });
    });
    ds.forEach((d, i) => {
      const run = runs[i];
      (tier.junior ? state.juniorResults : state.results).push(...knockoutResults(run.main, run.slots, event, tier, d, state.date, rs));
      state.eventRecords.push(toRecord(event.id, year, d, run));
      awardPrizes(state, event, tier, d, run.main.reached, pairs);
      state.champions.push({ tournamentId: event.id, year, discipline: d, winner: run.main.rounds.at(-1)![0]! });
    });
    applyEventLoad(state, rs, rng, firstMatch, city, tier.grade === 1 || tier.points[0] >= 9000, cities);
  };
  const playAny = (id: string, h: WeekHooks, gated: boolean) => {
    const ev = events.find((e) => e.id === id);
    return ev ? playEvent(ev, h, gated) : playTeamEvent(state, rs, world, rng, teamEvents.find((e) => e.id === id)!, h, gated);
  };

  for (; pick; pick = await ask()) {
    if (played.includes(pick) || !all.some((e) => e.id === pick)) continue;
    played.push(pick);
    await playAny(pick, hooks, true);
  }
  for (const e of all) if (!played.includes(e.id)) await playAny(e.id, hooks.chooseEvent ? {} : hooks, false);

  // Top Committed: absen dari turnamen wajib minggu ini = pelanggaran (cedera dikecualikan mulai Fase 7).
  for (const event of events)
    for (const d of DISCIPLINES) {
      const inEvent = new Set(entries.get(event.id)!.get(d)!.map((c) => c.id));
      for (const e of entrantsFor(state, d))
        if (state.commitments[e.id]?.includes(event.id) && !inEvent.has(e.id) && !e.playerIds.some((id) => players.get(id)!.injury)) {
          state.violations.push({ entrantId: e.id, countryId: e.countryId, tournamentId: event.id, year });
          if (state.career && e.countryId === state.career.countryId && !e.playerIds.some((id) => players.get(id)!.released !== undefined))
            state.career.reputation = Math.max(0, state.career.reputation - rs.career.violationPenalty);
        }
    }

  if (week % 4 === 0)
    for (const d of DISCIPLINES)
      state.rankSnapshots.push({ absWeek: absWeek(state.date), discipline: d, ids: computeRanking(state.results, d, absWeek(state.date), rs).slice(0, 300).map((r) => r.entrantId) });

  if (week % 13 === 0) endQuarter(state, rs, rng);
  if (week >= 52) endYear(state, rs, world, rng);
  state.date = week >= 52 ? { year: year + 1, week: 1 } : { year, week: week + 1 };
  if (week >= 52) startYear(state, rs, rng); // target & Top Committed musim baru langsung terlihat di minggu 1
}

/**
 * Hadiah uang menurut babak yang dicapai di main draw: hadiah turnamen × persentase babak (tabel tier).
 * Ganda: hadiah per pasangan dibagi dua. (ASUMSI: babak kualifikasi tanpa hadiah.)
 */
function awardPrizes(state: SeasonState, event: TournamentDef, tier: Tier, d: Discipline, reached: Map<string, string>, pairs: Map<string, Pair>) {
  const split = isDoubles(d) ? tier.prizeSplit.doubles : tier.prizeSplit.singles;
  const year = (state.earnings[state.date.year] ??= {});
  for (const [id, round] of reached) {
    const usd = (event.prizeUsd * (split[ROUNDS.indexOf(round as Round)] ?? 0)) / 100;
    if (!usd) continue;
    const ids = pairs.get(id)?.playerIds ?? [id];
    for (const p of ids) year[p] = (year[p] ?? 0) + usd / ids.length;
  }
}

/**
 * Beban satu turnamen pada atlet yang bermain: kelelahan (tiap laga + jarak perjalanan), pengalaman
 * (menang & turnamen besar bernilai lebih), chemistry pasangan, dan cedera.
 */
function applyEventLoad(state: SeasonState, rs: Ruleset, rng: Rng, firstMatch: number, city: City, big: boolean, cities: Map<string, City>) {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const played = new Set<string>();
  for (const m of state.matches.slice(firstMatch))
    m.sides.forEach((side, i) => {
      const pair = pairs.get(side);
      if (pair) { pair.matchesTogether++; pair.chemistry += (100 - pair.chemistry) * 0.01; } // ASUMSI: naik makin lambat mendekati 100
      for (const id of pair?.playerIds ?? [side]) {
        players.get(id)!.fatigue += rs.fatigue.perMatch;
        state.experience[id] = (state.experience[id] ?? 0) + (m.winner === i ? 1.5 : 1) * (big ? 1.3 : 1);
        played.add(id);
      }
    });
  // Cedera: peluang per laga naik tajam bila lelah. (ASUMSI: atlet menyelesaikan turnamen, absen mulai minggu depan)
  const inj = rs.injury;
  for (const m of state.matches.slice(firstMatch))
    for (const side of m.sides)
      for (const id of pairs.get(side)?.playerIds ?? [side]) {
        const p = players.get(id)!;
        if (p.injury || rng() >= inj.base + inj.fatigueFactor * (p.fatigue / 100) ** 2) continue;
        const r = rollInjury(inj, rng);
        p.injury = r.injury;
        (p.injuryHistory ??= []).push({ ...state.date, level: r.injury.level, type: r.injury.type, weeks: r.injury.weeksLeft });
        if (r.paLoss) applySevereInjury(p, rs.development, rng, r.paLoss);
        if (r.retire) { // cedera parah: langsung pensiun, pasangannya bubar
          p.retired = state.date.year;
          for (const pair of state.pairs) if (!pair.dissolved && pair.playerIds.includes(p.id)) pair.dissolved = { ...state.date };
        }
      }
  for (const id of played) {
    const p = players.get(id)!;
    const from = p.location && cities.get(p.location);
    if (from) p.fatigue += (distanceKm(from, city) / 1000) * rs.fatigue.per1000Km;
    p.fatigue = Math.min(100, p.fatigue);
    p.location = city.id;
  }
}

/** Poin ranking terkini per nomor (untuk line-up & kekuatan tim beregu). */
function rankingPoints(state: SeasonState, rs: Ruleset, results = state.results) {
  const now = absWeek(state.date);
  return new Map(DISCIPLINES.map((d) => [d, new Map(computeRanking(results, d, now, rs).map((r) => [r.entrantId, r.points]))]));
}

export interface TeamStrength { countryId: string; strength: number; lineup: Lineup; pool: Record<string, TeamEntrant[]> }

/**
 * Negara yang bisa menurunkan tim lengkap untuk format ini, terkuat dulu.
 * Kekuatan = jumlah poin ranking line-up otomatis (mirip ranking beregu BWF). Atlet cedera tidak tersedia.
 */
export function teamStrengths(state: SeasonState, rs: Ruleset, format: TeamFormat): TeamStrength[] {
  const order = rs.team.order[format];
  // Format junior (Suhandinata): atlet U19 & ranking junior; ganda boleh ganda dadakan junior.
  const junior = isJuniorFormat(format);
  const points = rankingPoints(state, rs, junior ? state.juniorResults ?? [] : state.results);
  // Atlet cedera & yang keluar pelatnas tidak bisa dipilih untuk tim nasional.
  const injured = new Set(state.players.filter((p) => p.injury || p.released !== undefined).map((p) => p.id));
  const ca = new Map(state.players.map((p) => [p.id, currentAbility(p.attrs)]));
  const pools = new Map<string, Record<string, TeamEntrant[]>>();
  for (const d of new Set(order)) {
    const pts = points.get(d)!;
    const score = (e: Entrant) => e.playerIds.reduce((s, id) => s + ca.get(id)!, 0);
    const list = (junior ? juniorTeamEntrants(state, d) : entrantsFor(state, d)).filter((e) => !e.playerIds.some((id) => injured.has(id)))
      .sort((a, b) => (pts.get(b.id) ?? 0) - (pts.get(a.id) ?? 0) || score(b) - score(a));
    for (const e of list) {
      const pool = pools.get(e.countryId) ?? pools.set(e.countryId, {}).get(e.countryId)!;
      (pool[d] ??= []).push({ id: e.id, playerIds: e.playerIds });
    }
  }
  return [...pools].map(([countryId, pool]) => {
    const lineup = autoLineup(order, pool, rs.team.maxMatchesPerPlayer);
    const strength = lineup.reduce((s, id, i) => s + (id ? points.get(order[i])!.get(id) ?? 0 : 0), 0);
    return { countryId, strength, lineup, pool };
  }).filter((t) => t.lineup.every(Boolean)).sort((a, b) => b.strength - a.strength);
}

const winnerOf = (r: TeamResult | undefined) => r && Object.keys(r.reached).find((c) => r.reached[c] === 'W');

/** Juara bertahan suatu format (putaran final terakhir). */
export const teamHolder = (state: SeasonState, format: TeamFormat) =>
  winnerOf(state.teamResults.filter((r) => r.format === format && !r.confederation).at(-1));

/** Format yang dimainkan tahun ini (dari putaran final yang digelar). */
/** Format beregu senior yang putaran finalnya digelar tahun ini (juga format kejuaraan kontinental & target musim). */
export const teamFormatsIn = (rs: Ruleset, year: number) =>
  rs.team.events.filter((e) => !e.confederation && isHeld(e, year)).flatMap((e) => e.formats ?? []).filter((f) => !isJuniorFormat(f));

/**
 * Peserta putaran final: tuan rumah, juara bertahan, lalu `qualifiers` tim teratas tiap kejuaraan kontinental
 * tahun ini (urutan finis: juara, finalis, semifinalis, …; tim yang sudah lolos sebagai tuan rumah/juara bertahan
 * dilewati dan kursinya jatuh ke tim berikutnya dari benua itu), lalu tim terkuat sampai kuota terpenuhi.
 * Urutan hasil = urutan unggulan (kekuatan tim).
 */
export function finalsTeams(state: SeasonState, rs: Ruleset, format: TeamFormat, hostCountryId: string, all: TeamStrength[], size = rs.team.finals.teams) {
  const eligible = new Set(all.map((t) => t.countryId));
  const picked = new Set([hostCountryId, teamHolder(state, format)].filter((c): c is string => !!c && eligible.has(c)));
  for (const r of state.teamResults.filter((x) => x.year === state.date.year && x.format === format && x.confederation)) {
    const quota = rs.team.events.find((e) => e.id === r.eventId)?.qualifiers ?? 1;
    const depth = (c: string) => { const i = ROUNDS.indexOf(r.reached[c] as Round); return i < 0 ? ROUNDS.length : i; };
    const finish = [...r.teams].sort((a, b) => depth(a) - depth(b)); // sort stabil: seri → urutan unggulan
    let added = 0;
    for (const c of finish) {
      if (added >= quota) break;
      if (picked.has(c) || !eligible.has(c)) continue;
      picked.add(c);
      added++;
    }
  }
  for (const t of all) if (picked.size < size) picked.add(t.countryId);
  return all.filter((t) => picked.has(t.countryId)).map((t) => t.countryId);
}

/**
 * Satu kejuaraan beregu (kontinental atau final). Partai dicatat sebagai laga biasa (H2H, Live, kelelahan).
 * Tiap tim mendaftarkan skuad sebelum turnamen; line-up tiap pertandingan diambil dari skuad itu.
 * Manajer memilih lewat `team` (hook UI); tanpa hook / pilihan tidak sah → pilihan tersimpan, lalu otomatis.
 */
async function playTeamEvent(state: SeasonState, rs: Ruleset, world: World, rng: Rng, ev: TeamEventDef, h: WeekHooks, gated: boolean) {
  const { year } = state.date;
  const { live, team } = h;
  const cities = new Map(world.cities.map((c) => [c.id, c]));
  const confederation = new Map(world.countries.map((c) => [c.id, c.confederation]));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const max = rs.team.maxMatchesPerPlayer;
  const city = cities.get(hostCityId(ev, year))!;
  const firstMatch = state.matches.length;
  const finals = ev.finals ?? rs.team.finals;
  const formats = ev.formats ?? teamFormatsIn(rs, year);
  const gate = gated ? roundGate(ev.id, formats, h.round) : undefined;
  const draw: DrawHook | undefined = gate && h.draw ? (d) => gate.serial(async () => { await h.draw!(d); }) : h.draw;
  await each(gated, formats, async (format) => {
    const order = rs.team.order[format];
    const all = teamStrengths(state, rs, format);
    const teams = ev.confederation
      ? all.filter((t) => confederation.get(t.countryId) === ev.confederation).slice(0, rs.team.continentalTeams).map((t) => t.countryId)
      : finalsTeams(state, rs, format, city.countryId, all, finals.teams);
    if (teams.length < 2) {
      // Satu-satunya tim di konfederasinya menjadi juara kontinental tanpa bertanding (tetap lolos ke final).
      if (ev.confederation && teams.length === 1)
        state.teamResults.push({ eventId: ev.id, year, format, confederation: ev.confederation, teams, reached: { [teams[0]]: 'W' }, ties: [], squads: {} });
      return;
    }
    const byCountry = new Map(all.map((t) => [t.countryId, t]));
    const size = rs.team.squadSize[format];
    const valid = (s: string[] | undefined, pool: Record<string, TeamEntrant[]>) => s && !squadError(s, order, pool, max, size) ? s : undefined;
    // Pendaftaran skuad (sebelum pertandingan pertama).
    const squads: Record<string, string[]> = {};
    const pools = new Map<string, Record<string, TeamEntrant[]>>();
    for (const c of teams) {
      const { pool } = byCountry.get(c)!;
      const suggested = autoSquad(order, pool, max, size.max);
      let squad = suggested;
      if (c === state.managedCountryId) {
        const ask = () => team?.squad({ eventId: ev.id, format, pool, suggested: valid(state.teamSquads[format], pool) ?? suggested });
        const asked = await (gate ? gate.serial(ask) : ask()); // pop-up skuad satu per satu (Thomas & Uber bersamaan)
        squad = valid(asked ?? state.teamSquads[format], pool) ?? suggested;
        state.teamSquads[format] = squad;
      }
      squads[c] = squad;
      pools.set(c, squadPool(pool, squad));
    }
    const lineupOf = async (c: string, opponent: string, round: MatchRound): Promise<Lineup> => {
      const pool = pools.get(c)!;
      const real = (l: Lineup) => l.map((id, i) => (id?.startsWith(AD_HOC) ? adHocPair(c, order[i], id) : id)); // ganda dadakan → pasangan
      const auto = autoLineup(order, pool, max);
      if (c !== state.managedCountryId) return real(auto);
      // Line-up manajer boleh memakai ganda dadakan (adhoc:a+b) dari atlet skuad.
      const squad = new Set(squads[c]);
      const ok = (l: Lineup | undefined) => {
        if (!l) return undefined;
        const byId = new Map([...Object.values(pool).flat(), ...adHocEntrants(l, order, squad, (id) => players.get(id)?.gender)].map((e) => [e.id, e]));
        return lineupError(l, order, byId, max) ? undefined : l;
      };
      const asked = team?.lineup({ eventId: ev.id, format, round, opponent, pool, squad: squads[c], suggested: ok(state.teamLineups[format]) ?? auto });
      const chosen = ok(asked ? await asked : state.teamLineups[format]);
      if (chosen && asked) state.teamLineups[format] = chosen; // jadi saran untuk pertandingan berikutnya
      return real(chosen ?? auto);
    };
    /** Pasangan nyata untuk ganda dadakan: pakai pasangan aktif dengan atlet yang sama, atau buat pasangan khusus beregu. */
    const adHocPair = (c: string, d: Discipline, token: string) => {
      const ids = token.slice(AD_HOC.length).split('+');
      const same = (p: Pair) => p.discipline === d && !p.dissolved && ids.every((x) => p.playerIds.includes(x));
      let pair = state.pairs.find(same);
      if (!pair) {
        pair = {
          id: `${c}-${d}-T${year}-${state.pairs.length}`, discipline: d as Pair['discipline'], playerIds: [ids[0], ids[1]],
          chemistry: 25, matchesTogether: 0, formed: { ...state.date }, adHoc: true, ...(isJuniorFormat(format) && { junior: true }), // ASUMSI: chemistry awal rendah
        };
        state.pairs.push(pair);
        pairs.set(pair.id, pair);
      }
      return pair.id;
    };
    const plays = new Map<Discipline, PlayFn>();
    const playOf = (d: Discipline) => plays.get(d) ?? plays.set(d, simPlay({
      players, pairs, cfg: rs.match, rng, tournamentId: ev.id, year, discipline: d, matches: state.matches, live,
    })).get(d)!;
    const ties: TeamTie[] = [];
    const tie: PlayFn = async (a, b, round) => {
      const lineups: [Lineup, Lineup] = [await lineupOf(a, b, round), await lineupOf(b, a, round)];
      const from = state.matches.length;
      const r = await playTie(lineups, order, round, playOf, round === 'G');
      const won = r.scores.filter(([x, y]) => x > y).length;
      ties.push({ round, sides: [a, b], score: [won, r.scores.length - won], matchIds: state.matches.slice(from).map((m) => m.id) });
      return r;
    };
    const run = await runTeamEvent(teams, ev.confederation ? undefined : finals.groups, gate ? gate.wrap(format, tie) : tie, rng,
      (steps) => draw?.({ tournamentId: ev.id, entrants: teams, steps, groups: finals.groups.groups }) ?? null, gated);
    state.teamResults.push({
      eventId: ev.id, year, format, confederation: ev.confederation, teams,
      groups: run.groups, standings: run.standings, reached: Object.fromEntries(run.reached), ties, squads, drawSteps: run.steps,
    });
  });
  applyEventLoad(state, rs, rng, firstMatch, city, true, cities);
}

/** Riwayat peringkat dari snapshot (tiap 4 minggu). */
export function rankFromSnapshots(state: SeasonState, entrantId: string, d: Discipline) {
  return state.rankSnapshots.filter((s) => s.discipline === d).map((s) => {
    const i = s.ids.indexOf(entrantId);
    return { absWeek: s.absWeek, rank: i === -1 ? undefined : i + 1 };
  });
}

/** Atlet yang terutama bermain ganda (pasangannya berperingkat lebih baik dari peringkat tunggalnya). */
function doublesPlayers(state: SeasonState, rs: Ruleset) {
  const now = absWeek(state.date);
  const rank = new Map<string, number>();
  for (const d of DISCIPLINES) for (const r of computeRanking(state.results, d, now, rs)) rank.set(r.entrantId, r.rank);
  const out = new Set<string>();
  for (const pair of state.pairs)
    if (!pair.dissolved)
      for (const id of pair.playerIds)
        if ((rank.get(pair.id) ?? 9999) < (rank.get(id) ?? 9999)) out.add(id);
  return out;
}

/** Tiap 13 minggu: perkembangan & penuaan semua atlet aktif. */
function endQuarter(state: SeasonState, rs: Ruleset, rng: Rng) {
  const ctx = { date: state.date, experience: new Map(Object.entries(state.experience)), doublesPlayers: doublesPlayers(state, rs) };
  for (const p of state.players) if (p.retired === undefined) developQuarter(p, rs.development, ctx, rng);
  state.experience = {};
}

/** Akhir musim: riwayat atribut, pensiun, junior baru, pasangan baru oleh AI. */
function endYear(state: SeasonState, rs: Ruleset, world: World, rng: Rng) {
  const { year } = state.date;
  const now = absWeek(state.date);
  const career = state.career;
  if (career?.countryId) {
    const report = seasonReport(state, rs, career.countryId, career.goals);
    career.reports.push(report);
    career.reputation = Math.max(0, Math.min(100, career.reputation + report.reputationChange));
  }
  // Hemat ukuran save: statistik detail hanya 2 musim terakhir (skor & H2H tetap), hasil ranking > 2 tahun dibuang.
  for (const m of state.matches) if (m.year < year - 1) delete m.stats;
  state.eventRecords = state.eventRecords.filter((r) => r.year >= year - 1);
  state.results = state.results.filter((r) => r.expiresAbsWeek > now - 52);
  state.juniorResults = state.juniorResults.filter((r) => r.expiresAbsWeek > now - 52);
  const rank = new Map<string, number>();
  for (const d of ['MS', 'WS'] as const) for (const r of computeRanking(state.results, d, now, rs)) rank.set(r.entrantId, r.rank);
  for (const p of state.players) {
    if (p.retired !== undefined) continue;
    p.attrHistory.push({ year, attrs: { ...p.attrs } });
    if (rng() < retirementChance(p, rs.development, state.date, rank.get(p.id))) p.retired = year;
  }
  const retired = new Set(state.players.filter((p) => p.retired !== undefined).map((p) => p.id));
  for (const pair of state.pairs)
    if (!pair.dissolved && pair.playerIds.some((id) => retired.has(id))) pair.dissolved = { ...state.date };
  const next = { year: year + 1, week: 1 };
  if (state.scouting) recruit(state, []); // pencarian musim lalu belum diputuskan: isi otomatis
  for (const c of world.countries) {
    const juniors = newJuniors(c, rs.development, rs.generator, next, rng);
    // Negara manajer: junior baru dipilih dari kandidat (pencarian bakat), bukan langsung masuk.
    if (c.id === state.managedCountryId) state.scouting = makeScouting(juniors, c, rs.generator, next, rng);
    else state.players.push(...juniors);
  }
  formPairs(state, rs, world, rng);
}

/**
 * AI membentuk pasangan baru bila jumlah pasangan aktif suatu negara di bawah target (dari generator).
 * Kandidat: atlet aktif ≥ 17 th, bukan spesialis tunggal, yang belum punya pasangan di nomor itu, terkuat dulu.
 */
export function formPairs(state: SeasonState, rs: Ruleset, world: World, rng: Rng) {
  const g = rs.generator.pairsPerDiscipline;
  const year = state.date.year;
  // Spesialis tunggal (top 64 dunia) tidak dipasangkan oleh AI.
  const singlesStars = new Set(['MS', 'WS'].flatMap((d) =>
    computeRanking(state.results, d as Discipline, absWeek(state.date), rs).filter((r) => r.rank <= 64).map((r) => r.entrantId)));
  const byId = new Map(state.players.map((p) => [p.id, p]));
  // Dipanggil di awal karier & tiap akhir musim (tahun yang sama) → nomor urut dicari yang belum terpakai.
  const used = new Set(state.pairs.map((p) => p.id));
  for (const c of world.countries) {
    // Negara manajer: pasangan pelatnas dibentuk manajer; AI hanya memasangkan sesama atlet yang keluar pelatnas.
    const managed = c.id === state.managedCountryId;
    const member = (p: Player) => p.countryId === c.id && (!managed || p.released !== undefined);
    const target = Math.round(g.min + (c.traditionStrength / 100) * (g.max - g.min));
    const all = state.players
      .filter((p) => member(p) && p.retired === undefined && ageAt(p.birth, state.date) >= 17)
      .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    const pool = all.filter((p) => !singlesStars.has(p.id));
    const stars = all.filter((p) => singlesStars.has(p.id));
    for (const d of ['MD', 'WD', 'XD'] as const) {
      // Pasangan negara ini dikenali dari negara atletnya, bukan dari `pool` (yang tidak memuat spesialis tunggal).
      const active = state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.trial && !p.adHoc && p.playerIds.every((id) => member(byId.get(id)!)));
      const busy = new Set(active.flatMap((p) => p.playerIds));
      // Spesialis tunggal hanya dipakai bila perlu untuk minimum tim beregu (2 pasangan MD/WD, 1 XD).
      const minPairs = d === 'XD' ? 1 : 2;
      let k = active.length;
      const free = (gender: 'M' | 'F') => [...pool, ...(k < minPairs ? stars : [])].filter((p) => p.gender === gender && !busy.has(p.id));
      for (; k < target; k++) {
        const [a, b] = d === 'MD' ? free('M').slice(0, 2) : d === 'WD' ? free('F').slice(0, 2) : [free('M')[0], free('F')[0]];
        if (!a || !b) break;
        let n = k + 1;
        while (used.has(`${c.id}-${d}${year}-${n}`)) n++;
        const id = `${c.id}-${d}${year}-${n}`;
        used.add(id);
        state.pairs.push({
          id, discipline: d, playerIds: [a.id, b.id],
          chemistry: 30 + Math.floor(rng() * 20), matchesTogether: 0, formed: { ...state.date },
        });
        busy.add(a.id).add(b.id);
      }
    }
  }
}
