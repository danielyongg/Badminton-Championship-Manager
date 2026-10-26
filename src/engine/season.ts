import { bumpForm, HOME_BONUS, hitTarget, REST_RECOVERY, TARGET_HIT, TARGET_MISS } from './boosts';
import { makeChallenges, seasonGoals, seasonReport } from './career';
import { contingentOf, inContingent, lockContingents } from './contingent';
import { olympicField } from './olympics';
import { applySevereInjury, developQuarter, newJuniors, retirementChance, rollInjury } from './development';
import { applyCountryQuota, type Candidate, type EntryList } from './entry';
import { ageAt, currentAbility, generateWorld, isJuniorAge, isPratama } from './generator';
import { archiveStats, type StatAcc } from './careerStats';
import { absWeek, computeRace, computeRanking, knockoutResults, rankMap } from './ranking';
import { makeRng, shuffle, type Rng } from './rng';
import type { Standing } from './groups';
import { each, type MatchRound, type PlayFn } from './knockout';
import { juniorEntries, juniorTeamEntrants } from './junior';
import { AD_HOC, adHocEntrants, autoLineup, rankOrder, autoSquad, lineupError, playTie, runTeamEvent, squadError, squadPool, type Lineup, type TeamEntrant } from './team';
import { runEvent, simPlay, toRecord, type HotForm, type DrawHook, type DrawShow, type EntriesHook, type EntriesShow, type EventRecord, type LiveHook } from './tournament';
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

export interface RankWeeks { r: number; run: number; at: Record<number, number> }
/** Total minggu hanya disimpan untuk peringkat teratas ini (hemat ukuran save). */
export const RANK_WEEKS_TOP = 100;

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
  /** Koreksi tradisi atlet junior asli sudah diterapkan (save lama disesuaikan sekali saat dimuat). */
  juniorCalibrated?: true;
  /** Turnamen kecil di negara yang sama sudah disebar (`spreadHosts`). Save lama: tidak ada. */
  hostsSpread?: true | 2 | 3; // 2 = juga tier yang sama tidak sepekan, 3 = World Tour sebelum Finals
  /** Top Committed Players musim ini: entrantId → id turnamen wajib. */
  commitments: Record<EntrantId, string[]>;
  commitmentsYear?: number;
  violations: Violation[];
  /** Laga berbobot per atlet di kuartal berjalan (untuk bonus perkembangan). */
  experience: Record<string, number>;
  /** Target babak manajer per entrant: kunci "tahun:eventId". */
  targets?: Record<string, Record<string, Round>>;
  /** Negara yang pasangannya diatur manajer (AI tidak membentuk pasangan baru di sana). */
  managedCountryId?: string | null;
  career?: Career;
  /** Keputusan entry manajer: "tahun-minggu" → entrantId → eventId atau 'rest'. Tanpa keputusan = saran AI. */
  manualEntries: Record<string, Record<string, string>>;
  /** Prioritas tier entry otomatis negara manajer: entrantId (atlet tunggal / pasangan) → tier yang diikuti. Kosong = AI bebas. */
  tierPrefs?: Record<string, TierId[]>;
  /** Pencarian bakat junior negara manajer yang belum diputuskan (kandidat akhir musim). */
  scouting?: Scouting;
  /**
   * Turnamen yang entry-nya sudah di-submit manajer: "tahun:eventId". `true` = pilihan manajer (atlet sendiri yang tidak
   * dicentang tidak diisi AI ke turnamen itu); 'ai' = diserahkan ke asisten AI lewat tombol Otomatis.
   */
  entriesSubmitted?: Record<string, true | 'ai'>;
  /** Submit lama (sebelum 'ai') sudah dipilah sekali saat save dimuat. */
  entriesSubmittedKinds?: true;
  /** Snapshot ranking tiap 4 minggu (top 300 per nomor) untuk grafik riwayat peringkat. */
  rankSnapshots: { absWeek: number; discipline: Discipline; ids: string[] }[];
  /**
   * Minggu di peringkat (ranking senior, dicatat tiap akhir minggu): per nomor → peserta → peringkat terakhir (`r`, 0 = di
   * luar 300 besar), minggu beruntun di peringkat itu (`run`), total minggu per peringkat (`at`, hanya peringkat 1–100).
   * Save lama diisi awal dari snapshot 4-mingguan (perkiraan).
   */
  rankWeeks?: Partial<Record<Discipline, Record<string, RankWeeks>>>;
  /** Peserta putaran final beregu yang sudah ditetapkan: "tahun:format" → negara. */
  teamQualifiers?: Record<string, string[]>;
  /** Kontingen multi-event: "tahun:eventId" (nomor perorangan) → negara → atlet. */
  contingents?: Record<string, Record<string, string[]>>;
  /** Hasil kejuaraan beregu (kontinental & final). */
  teamResults: TeamResult[];
  /** Kondisi hari itu yang terbawa antar laga minggu ini (on fire); diganti baru tiap minggu. */
  hotForm?: { absWeek: number; by: HotForm };
  /** Line-up beregu pilihan manajer per format; tidak sah (cedera, pasangan bubar) → line-up otomatis. */
  teamLineups: Partial<Record<TeamFormat, Lineup>>;
  /** Skuad beregu pilihan manajer per format (dipakai bila manajer tidak memilih saat turnamen dimulai). */
  teamSquads: Partial<Record<TeamFormat, string[]>>;
  /** Hadiah uang (USD) per tahun per atlet; ganda dibagi dua per atlet. */
  earnings: Record<string, Record<string, number>>;
  /** Catatan turnamen (entry, kualifikasi, undian, bagan) 2 musim terakhir, untuk halaman turnamen. */
  eventRecords: EventRecord[];
  /** Statistik laga yang sudah dibuang, dijumlahkan per peserta (statistik karier). Save lama: tidak ada. */
  statArchive?: Record<EntrantId, StatAcc>;
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
  /** Beregu multi-event (Asian Games dll.): bukan final / kualifikasi. */
  games?: true;
  teams: string[]; // id negara, urut unggulan
  groups?: string[][];
  standings?: Standing[][]; // gameDiff = selisih partai, pointDiff = selisih game
  reached: Record<string, MatchRound | 'W'>; // babak gugur terakhir; tim yang tersingkir di grup tidak ada di sini
  ties: TeamTie[];
  squads: Record<string, string[]>; // skuad terdaftar per negara
  drawSteps?: DrawStep[]; // undian pot putaran final (untuk putar ulang)
  /** Bagan gugur: bracket[0] = posisi awal, terakhir = [juara]. Save lama: tidak ada (bagan disusun dari daftar pertandingan). */
  bracket?: (string | null)[][];
}

export const weekKey = (d: GameDate) => `${d.year}-${d.week}`;

export const isHeld = (e: { everyYears?: TournamentDef['everyYears']; skipYears?: number[]; years?: TournamentDef['years'] }, year: number) =>
  (!e.everyYears || (year % e.everyYears.interval === e.everyYears.offset) !== !!e.everyYears.invert) && !e.skipYears?.includes(year)
  && year >= (e.years?.from ?? -Infinity) && year <= (e.years?.to ?? Infinity);

/** Kota tuan rumah event di tahun tertentu: `hosts` (asli) → `rotation` (bergilir) → `cityId`. */
export const hostCityId = (e: Pick<TournamentDef, 'cityId' | 'hosts' | 'rotation'>, year: number) =>
  e.hosts?.[year] ?? (e.rotation?.length ? e.rotation[year % e.rotation.length] : e.cityId);

/** Event yang terbuka untuk negara: multi-event hanya anggotanya, kejuaraan kontinental hanya negara konfederasinya. */
export const openTo = (e: { countries?: string[]; confederation?: Confederation }, countryId: string, world: World) =>
  (!e.countries || e.countries.includes(countryId))
  && (!e.confederation || world.countries.find((c) => c.id === countryId)?.confederation === e.confederation);

/** Minggu event di tahun tertentu: jadwal per tahun (`weeks`) atau minggu bawaan. */
export const weekOf = (e: Pick<TournamentDef, 'week' | 'weeks'>, year: number) => e.weeks?.[year] ?? e.week;

/** Event besar & tetap (patokan kalender): tidak digeser oleh `scheduleYear`. */
const ANCHOR_TIERS = new Set(['OG', 'WC', 'WTF']);
const BIG_TIERS = new Set(['S1000', 'S750', 'S500']);

/**
 * Kalender musim baru (per save): turnamen yang belum punya jadwal tahun ini bergeser −1/0/+1 minggu dari minggu
 * bawaannya (ASUMSI, meniru pergeseran tanggal antarmusim). Super 500 ke atas tidak sepekan dengan Super 500+ lain,
 * Olimpiade/Kejuaraan Dunia, atau final beregu. Event besar, multi-event, beregu & junior tetap.
 */
export function scheduleYear(rs: Ruleset, year: number, rng: Rng, world?: World) {
  const auto = new Set(rs.calendar.filter((e) => isHeld(e, year) && e.weeks?.[year] === undefined).map((e) => e.id));
  scheduleShift(rs, year, rng);
  if (world) spreadHosts(rs, year, rng, world, (e) => auto.has(e.id) || afterFinals(rs, e, year));
}

/** Minggu World Tour Finals tahun itu (53 bila tidak ada). */
const finalsWeek = (rs: Ruleset, year: number) =>
  Math.min(...rs.calendar.filter((e) => e.tierId === 'WTF' && isHeld(e, year)).map((e) => weekOf(e, year)), 53);

/** Turnamen World Tour (tier Race) yang jadwalnya sepekan/sesudah World Tour Finals: harus dipindah ke sebelumnya. */
export const afterFinals = (rs: Ruleset, e: TournamentDef, year: number) =>
  rs.race.tiers.includes(e.tierId) && weekOf(e, year) >= finalsWeek(rs, year);

/** Jarak minimal (minggu) antar turnamen di negara yang sama. ASUMSI: kalibrasi, docs/ASUMSI.md. */
export const HOST_GAP = 4;

/**
 * Sebar turnamen kecil (Super 300 ke bawah, grade 3, junior internasional) yang `movable` agar turnamen di negara yang
 * sama berjarak ≥ HOST_GAP minggu dan sebisa mungkin tidak sepekan dengan turnamen tier yang sama; minggu terdekat dari
 * jadwalnya yang tidak bentrok (bila mustahil: bentrok paling sedikit, jarak senegara lebih diutamakan). Turnamen junior internasional tetap satu per minggu & tidak sepekan dengan event junior lain.
 */
export function spreadHosts(rs: Ruleset, year: number, rng: Rng, world: World, movable: (e: TournamentDef) => boolean, fromWeek = 1) {
  const cityCountry = new Map(world.cities.map((c) => [c.id, c.countryId]));
  const juniorTier = new Set(rs.tiers.filter((x) => x.junior).map((x) => x.id));
  const smallTier = (e: TournamentDef) => !ANCHOR_TIERS.has(e.tierId) && !BIG_TIERS.has(e.tierId) && e.tierId !== 'WJC';
  const held = rs.calendar.filter((e) => isHeld(e, year));
  const moving = shuffle(rng, held.filter((e) => movable(e) && smallTier(e) && !e.countries && !e.confederation));
  const placed: { country?: string; week: number; junior: boolean; tier?: string }[] = [
    ...held.filter((e) => !moving.includes(e)).map((e) => ({ country: cityCountry.get(hostCityId(e, year)), week: weekOf(e, year), junior: juniorTier.has(e.tierId), tier: e.tierId })),
    ...rs.team.events.filter((e) => isHeld(e, year)).map((e) => ({ country: cityCountry.get(hostCityId(e, year)), week: weekOf(e, year), junior: !!e.formats?.some(isJuniorFormat) })),
  ];
  const wtf = finalsWeek(rs, year);
  // Dua putaran: putaran kedua menempatkan ulang tiap turnamen dengan semua yang lain sudah terpasang (greedy satu putaran
  // bisa terjebak urutan acak).
  const mine = new Map<TournamentDef, (typeof placed)[number]>();
  for (let pass = 0; pass < 2; pass++) for (const e of moving) {
    const country = cityCountry.get(hostCityId(e, year)), w0 = e.weeks?.[year] ?? e.week, junior = juniorTier.has(e.tierId);
    const others = placed.filter((p) => p !== mine.get(e));
    let best = w0, bestScore = Infinity;
    // World Tour selalu sebelum Finals; selain itu boleh tetap di minggunya bila sesudah Finals (grade 3 Desember).
    for (let w = fromWeek; w <= (rs.race.tiers.includes(e.tierId) ? wtf - 1 : Math.max(wtf - 1, w0)); w++) {
      if (junior && others.some((p) => p.junior && p.week === w)) continue;
      const clash = others.reduce((s, p) => s + (p.country === country ? Math.max(0, HOST_GAP - Math.abs(p.week - w)) : 0), 0);
      const sameTier = others.filter((p) => p.tier === e.tierId && p.week === w).length;
      const score = clash * 1000 + sameTier * 30 + Math.abs(w - w0);
      if (score < bestScore) [best, bestScore] = [w, score];
    }
    (e.weeks ??= {})[year] = best;
    const entry = mine.get(e);
    if (entry) entry.week = best;
    else { const p = { country, week: best, junior, tier: e.tierId }; mine.set(e, p); placed.push(p); }
  }
}

function scheduleShift(rs: Ruleset, year: number, rng: Rng) {
  const junior = new Set(rs.tiers.filter((x) => x.junior).map((x) => x.id));
  const held = rs.calendar.filter((e) => isHeld(e, year));
  const blocked = new Set([
    ...held.filter((e) => ANCHOR_TIERS.has(e.tierId) && e.tierId !== 'WTF').map((e) => weekOf(e, year)),
    ...rs.team.events.filter((e) => isHeld(e, year) && !e.confederation && e.formats?.every((f) => !isJuniorFormat(f))).map((e) => weekOf(e, year)),
  ]);
  const wtf = Math.min(...held.filter((e) => e.tierId === 'WTF').map((e) => weekOf(e, year)), 53);
  const big = new Set(held.filter((e) => BIG_TIERS.has(e.tierId) && e.weeks?.[year] !== undefined).map((e) => e.weeks![year]));
  for (const e of shuffle(rng, held.filter((x) => x.weeks?.[year] === undefined && !ANCHOR_TIERS.has(x.tierId) && !junior.has(x.tierId) && !x.countries && !x.confederation))) {
    const isBig = BIG_TIERS.has(e.tierId);
    const options = shuffle(rng, [-1, 0, 0, 1]).map((d) => e.week + d)
      .filter((w) => w >= 1 && w < wtf && (!isBig || (!big.has(w) && !blocked.has(w))));
    const w = options[0] ?? e.week;
    (e.weeks ??= {})[year] = w;
    if (isBig) big.add(w);
  }
}

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
    juniorPromotion: true, juniorCalibrated: true, hostsSpread: 3, entriesSubmittedKinds: true, experience: {}, manualEntries: {}, rankSnapshots: [], teamResults: [], teamLineups: {}, teamSquads: {}, eventRecords: [], earnings: {}, managedCountryId: null,
    career: { countryId, goals: [], reports: [], reputation: 50 },
  };
  if (roster?.players.length) {
    // Negara roster yang belum punya cukup pasangan. Ranking awal dulu agar spesialis tunggal tidak ikut dipasangkan.
    state.results = bootstrapResults(state, ruleset);
    formPairs(state, ruleset, world, makeRng(seed + 2));
  }
  state.managedCountryId = countryId;
  state.results = bootstrapResults(state, ruleset);
  startYear(state, ruleset, makeRng(seed + 1), world);
  ensureRankWeeks(state, ruleset);
  return state;
}

/** Ganti negara di tengah karier: target musim dihitung ulang untuk negara baru. */
export function switchCountry(state: SeasonState, rs: Ruleset, countryId: string | null) {
  state.managedCountryId = countryId;
  // Siklus Olimpiade & tantangan milik negara lama tidak dibawa (tantangan baru muncul musim depan).
  state.career = { ...(state.career ?? { reports: [], reputation: 50 }), countryId, goals: [], olympicCycle: undefined, challengeOptions: undefined, challenge: undefined };
  if (countryId) state.career.goals = seasonGoals(state, rs, countryId);
}

const tierOf = (rs: Ruleset, e: TournamentDef) => rs.tiers.find((t) => t.id === e.tierId)!;

/**
 * Top Committed Players: snapshot ranking akhir tahun → top 15 tunggal / top 10 ganda wajib ikut
 * semua turnamen tier 'all' dan N turnamen tier bernilai angka (dipilih acak di awal musim).
 * WTF ditambahkan saat kualifikasi WTF ditentukan.
 */
export function startYear(state: SeasonState, rs: Ruleset, rng: Rng, world?: World) {
  const { year } = state.date;
  if (year > rs.startYear) scheduleYear(rs, year, rng, world); // musim pertama = kalender asli preset
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
  if (state.career?.countryId) {
    state.career.goals = seasonGoals(state, rs, state.career.countryId, world);
    delete state.career.challenge;
    state.career.challengeOptions = world ? makeChallenges(state, rs, world, state.career.countryId, rng) : undefined;
  }
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
function chooseEntries(state: SeasonState, events: TournamentDef[], rs: Ruleset, rng: Rng, ranks: Map<Discipline, Map<string, number>>, busy = new Set<string>(), world?: World) {
  const entries = new Map(events.map((e) => [e.id, new Map<Discipline, Candidate[]>(DISCIPLINES.map((d) => [d, []]))]));
  const playerEvent = new Map<string, string>();
  const fatigue = new Map(state.players.map((p) => [p.id, p.fatigue]));
  const injured = new Set(state.players.filter((p) => p.injury).map((p) => p.id));
  const manual = state.manualEntries[weekKey(state.date)] ?? {};
  const submitted = (ev: TournamentDef) => state.entriesSubmitted?.[`${state.date.year}:${ev.id}`] === true;
  // Junior pratama negara manajer: tidak didaftarkan otomatis (manual tetap bisa).
  const pratama = new Set(state.players.filter((p) => p.countryId === state.managedCountryId && p.released === undefined && isPratama(p, state.date)).map((p) => p.id));
  const released = releasedIds(state);
  const mine = (e: Entrant) => isManaged(state, released, e);
  const conf = new Map(world?.countries.map((c) => [c.id, c.confederation as string]));
  const confOf = (country: string) => conf.get(country);
  const hostCity = new Map(world?.cities.map((c) => [c.id, c.countryId]));
  const hostCountryOf = (ev: TournamentDef) => hostCity.get(hostCityId(ev, state.date.year)) ?? '';
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const strengthOf = (e: Entrant) => e.playerIds.reduce((sum, id) => sum + currentAbility(playerById.get(id)!.attrs), 0) / e.playerIds.length;

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

  // Olimpiade: peserta dari ranking Olimpiade & kuota (otomatis, seperti WTF).
  const og = events.find((e) => e.tierId === 'OG');
  if (og)
    for (const d of DISCIPLINES) {
      const q = olympicField(state, rs, d, state.date.year, world);
      entries.get(og.id)!.set(d, q);
      const pids = new Map(entrantsFor(state, d).map((e) => [e.id, e.playerIds]));
      for (const c of q) pids.get(c.id)?.forEach((id) => playerEvent.set(id, og.id));
    }

  // Keputusan manual manajer diproses lebih dulu (tidak didahului pilihan AI yang mengikat atletnya ke turnamen lain).
  // Satu atlet: satu turnamen per minggu, dan satu pasangan per nomor (pasangan utama ATAU percobaan).
  const playerDisc = new Set<string>();
  const all = DISCIPLINES.flatMap((d) => entrantsFor(state, d).map((e) => ({ e, d })));
  // Lalu entrant Top Committed yang wajib main minggu ini, agar nomor lain atletnya tidak lebih dulu mengikatnya ke turnamen lain.
  const isManual = (x: { e: Entrant }) => mine(x.e) && manual[x.e.id] !== undefined;
  const isCommitted = (x: { e: Entrant }) => !isManual(x) && events.some((ev) => state.commitments[x.e.id]?.includes(ev.id));
  for (const { e, d } of [...all.filter(isManual), ...all.filter(isCommitted), ...all.filter((x) => !isManual(x) && !isCommitted(x))]) {
    const taken = [wtf, og].some((x) => x && entries.get(x.id)!.get(d)!.some((c) => c.id === e.id));
    if (taken || e.playerIds.some((id) => injured.has(id) || playerDisc.has(`${id}:${d}`))) continue;
    const rank = ranks.get(d)!.get(e.id);
    const fixed = e.playerIds.map((id) => playerEvent.get(id)).find(Boolean);
    const options = events.filter((ev) => ev.tierId !== 'WTF' && ev.tierId !== 'OG' && tierOf(rs, ev).drawSize[d] > 0 && (!fixed || ev.id === fixed)
      && (!ev.countries || ev.countries.includes(e.countryId)) && (!ev.confederation || confOf(e.countryId) === ev.confederation)
      && inContingent(state, ev.id, e.countryId, e.playerIds)
      // Turnamen yang entry-nya sudah di-submit manajer: atlet sendiri yang tidak dicentang tidak diisi AI ke sana (wajib tetap).
      && (!mine(e) || manual[e.id] === ev.id || !submitted(ev) || !!state.commitments[e.id]?.includes(ev.id)));
    const decision = mine(e) ? manual[e.id] : undefined;
    if (!decision && e.playerIds.some((id) => pratama.has(id) || busy.has(id))) continue;
    let choice = decision ? options.find((ev) => ev.id === decision) : options.find((ev) => state.commitments[e.id]?.includes(ev.id));
    if (!choice && !decision && !e.trial) { // pasangan percobaan tidak pernah didaftarkan AI
      const tired = Math.max(...e.playerIds.map((id) => fatigue.get(id)!));
      const prefs = mine(e) ? state.tierPrefs?.[e.id] : undefined;
      // IC/IS/FS: AI terutama mendaftar di benuanya sendiri (sesekali ke luar).
      const local = !world || rng() < (rs.ai.awayGrade3 ?? 1) ? options
        : options.filter((ev) => tierOf(rs, ev).grade !== 3 || confOf(hostCountryOf(ev)) === confOf(e.countryId));
      const ev = aiEventChoice(local, rs, rank, prefs, rng);
      // prioritas manajer: selalu diikuti (kecuali lelah); tanpa prioritas: peluang ikut per tier & kelelahan
      if (ev && tired <= rs.ai.restAbove && (prefs?.length || rng() < (rs.ai.playProb[ev.tierId] ?? 0.5) * (1 - tired / 150))) choice = ev;
    }
    if (!choice) continue;
    entries.get(choice.id)!.get(d)!.push({ id: e.id, countryId: e.countryId, rank, ...(rank === undefined && { strength: strengthOf(e) }) });
    e.playerIds.forEach((id) => { playerEvent.set(id, choice.id); playerDisc.add(`${id}:${d}`); });
  }
  return entries;
}

/**
 * Turnamen pilihan AI sebelum peluang ikut & kelelahan (`options` urut tier tertinggi dulu):
 * prioritas tier manajer bila ada, selain itu turnamen pertama yang rentang rankingnya cocok. Dengan `rng`: bila yang
 * pertama grade 3 dan ada grade 3 lain yang juga cocok minggu itu (mis. IC & FS di benua yang sama), dipilih acak di
 * antaranya — tanpa ini turnamen grade 3 yang lebih rendah kosong. Tanpa `rng` (Saran, rencana musim): yang pertama.
 */
export function aiEventChoice<T extends { tierId: string }>(options: T[], rs: Ruleset, rank: number | undefined, prefs?: string[], rng?: Rng) {
  if (prefs?.length) return options.find((x) => prefs.includes(x.tierId));
  const r = rank ?? 9999;
  const fits = options.filter((x) => { const [lo, hi] = rs.ai.rankRange[x.tierId] ?? [1, 9999]; return r >= lo && r <= hi; });
  const grade3 = (x: T) => rs.tiers.find((t) => t.id === x.tierId)?.grade === 3;
  const same = rng && fits[0] && grade3(fits[0]) ? fits.filter(grade3) : [];
  return same.length > 1 ? same[Math.floor(rng!() * same.length)] : fits[0];
}

/** Pilihan turnamen minggu ini: id turnamen yang dimainkan manajer, atau null = simulasikan sisanya. */
export type ChooseEvent = (req: { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[] }) => Promise<string | null>;

/**
 * Titik keputusan UI selama satu minggu (semua opsional). Dengan `chooseEvent`: turnamen yang dipilih dimainkan
 * interaktif per babak (gerbang babak; `draw`, `round`, `live`, `team` aktif), sisanya otomatis tanpa hook.
 * Tanpa `chooseEvent`: semua turnamen berurutan dengan hook yang diberikan.
 */
export interface WeekHooks { live?: LiveHook; team?: TeamHook; draw?: DrawHook; entries?: EntriesHook; round?: RoundHook; chooseEvent?: ChooseEvent }

/** Satu minggu kalender. Hook yang mengembalikan Promise membuat simulasi menunggu keputusan di UI. */
/**
 * Morale setelah laga minggu ini: tiap laga menggeser morale atlet sebesar k × (hasil − peluang menang menurut
 * selisih ability), jadi kemenangan atas lawan lebih kuat menaikkan banyak & kekalahan dari lawan lebih lemah
 * menurunkan banyak. Juara (& finalis turnamen individu) mendapat bonus.
 */
/** Kondisi terbawa minggu berjalan (dibuat baru saat minggu berganti: efek on fire hanya dalam satu turnamen). */
export function hotFormOf(state: SeasonState): HotForm {
  const w = absWeek(state.date);
  if (state.hotForm?.absWeek !== w) state.hotForm = { absWeek: w, by: {} };
  return state.hotForm.by;
}

function updateMorale(state: SeasonState, rs: Ruleset, fromMatch: number, fromChampion: number) {
  const cfg = rs.match.morale;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const members = (id: string) => (pairs.get(id)?.playerIds ?? [id]).map((x) => players.get(x)).filter((p): p is Player => !!p);
  const ability = (ps: Player[]) => ps.reduce((s, p) => s + currentAbility(p.attrs), 0) / Math.max(1, ps.length);
  const add = (ps: Player[], d: number) => { for (const p of ps) bumpForm(p, d); };
  for (const m of state.matches.slice(fromMatch)) {
    if (m.walkover) continue;
    const sides = m.sides.map(members);
    if (sides.some((ps) => !ps.length)) continue;
    const p0 = 1 / (1 + Math.exp((ability(sides[1]) - ability(sides[0])) / cfg.scale)); // peluang sisi 0 menang
    const d = cfg.k * ((m.winner === 0 ? 1 : 0) - p0);
    add(sides[0], d);
    add(sides[1], -d);
    if (m.round === 'F') add(sides[1 - m.winner], cfg.finalBonus);
  }
  for (const c of state.champions.slice(fromChampion)) add(members(c.winner), cfg.titleBonus);
}

export async function playWeek(state: SeasonState, rs: Ruleset, world: World, rng: Rng, hooks: WeekHooks = {}) {
  const { year, week } = state.date;
  if (state.commitmentsYear !== year) startYear(state, rs, rng, world);
  if (state.scouting && week > SCOUTING_DEADLINE_WEEK) recruit(state, []); // batas memilih lewat: isi otomatis
  lockContingents(state, rs);
  lockFinalsQualifiers(state, rs, world, false);
  // Multi-event lebih dulu: negara anggota mengirim atlet terbaiknya (tanpa poin ranking, jadi tidak diurutkan dari poin).
  const events = rs.calendar.filter((e) => weekOf(e, year) === week && isHeld(e, year))
    .sort((a, b) => Number(!!b.countries) - Number(!!a.countries) || tierOf(rs, b).points[0] - tierOf(rs, a).points[0]);
  const teamEvents = rs.team.events.filter((e) => weekOf(e, year) === week && isHeld(e, year));
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const cities = new Map(world.cities.map((c) => [c.id, c]));
  const cutoff = absWeek(state.date) - rs.ranking.entryCutoffWeeks;
  const ranks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, cutoff, rs))]));

  for (const p of state.players) {
    p.fatigue = Math.max(0, p.fatigue - rs.fatigue.recoveryPerWeek);
    if (p.injury && --p.injury.weeksLeft <= 0) p.injury = undefined;
    p.form *= rs.match.morale.weeklyDecay; // morale perlahan kembali ke Normal
  }
  const weekMatches = state.matches.length, weekChampions = state.champions.length;
  const isJunior = (e: TournamentDef) => !!tierOf(rs, e).junior;
  // Pilihan pertama diminta sebelum entry dihitung: manajer masih bisa mengisi entry dari layar minggu.
  const all = [...events.map((e) => ({ id: e.id, kind: 'individual' as const })), ...teamEvents.map((e) => ({ id: e.id, kind: 'team' as const }))];
  const played: string[] = [];
  // Negara manajer hanya bisa memilih event yang terbuka untuknya; event lain disimulasikan otomatis.
  const managed = state.managedCountryId;
  const choosable = all.filter((x) => !managed || openTo([...events, ...teamEvents].find((e) => e.id === x.id)!, managed, world));
  const ask = () => (hooks.chooseEvent && choosable.some((e) => !played.includes(e.id)) ? hooks.chooseEvent({ week, events: choosable, played }) : null);
  let pick = await ask();
  // Turnamen junior lebih dulu: atlet yang ikut tidak didaftarkan ke turnamen senior minggu ini.
  const juniorRanks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.juniorResults, d, cutoff, rs))]));
  const junior = juniorEntries(state, events.filter(isJunior), rs, world, juniorRanks, state.manualEntries[weekKey(state.date)] ?? {}, rng);
  state.pairs.push(...junior.created);
  for (const p of junior.created) pairs.set(p.id, p);
  // Minggu beregu junior (Suhandinata Cup): semua junior disiapkan untuk timnya, tidak didaftarkan otomatis ke turnamen senior.
  if (teamEvents.some((e) => e.formats?.some(isJuniorFormat)))
    for (const p of state.players) if (isJuniorAge(p, state.date)) junior.busy.add(p.id);
  const entries = chooseEntries(state, events.filter((e) => !isJunior(e)), rs, rng, ranks, junior.busy, world);
  for (const [id, byD] of junior.entries) entries.set(id, byD);

  /** Satu turnamen individu; `gated` = kelima nomor bersamaan lewat gerbang babak. */
  const playEvent = async (event: TournamentDef, h: WeekHooks, gated: boolean) => {
    const tier = tierOf(rs, event);
    const city = cities.get(hostCityId(event, year))!;
    const firstMatch = state.matches.length;
    const gate = gated ? roundGate(event.id, DISCIPLINES, h.round) : undefined;
    const ds = DISCIPLINES.filter((d) => tier.drawSize[d] > 0 && entries.get(event.id)!.get(d)!.length >= 2);
    // Undian semua nomor dikumpulkan dulu: bagan kualifikasi kelima nomor tampil sekaligus, lalu undian babak utama per nomor.
    const shows: DrawShow[] = [];
    let drawn: () => void = () => {};
    const allDrawn = new Promise<void>((r) => { drawn = r; });
    const draw: DrawHook | undefined = gate && h.draw ? async (d) => {
      shows.push(d);
      if (shows.length === ds.length) {
        shows.sort((a, b) => DISCIPLINES.indexOf(a.discipline!) - DISCIPLINES.indexOf(b.discipline!));
        const quals = shows.flatMap((s) => s.quals ?? []);
        for (const [i, s] of shows.entries()) await gate.serial(async () => { await h.draw!({ ...s, quals: i ? [] : quals }); });
        drawn();
      }
      await allDrawn;
    } : h.draw;
    // Daftar entry semua nomor ditampilkan sekaligus: tiap nomor menunggu sampai entry nomor terakhir diterima & daftarnya ditutup.
    const lists: EntriesShow['lists'] = [];
    let listed: () => void = () => {};
    const allListed = new Promise<void>((r) => { listed = r; });
    const onEntries = (d: Discipline) => gate && h.entries ? async (entry: EntryList) => {
      lists.push({ discipline: d, entry });
      if (lists.length === ds.length) {
        lists.sort((a, b) => DISCIPLINES.indexOf(a.discipline) - DISCIPLINES.indexOf(b.discipline));
        await gate.serial(async () => { await h.entries!({ tournamentId: event.id, lists }); });
        listed();
      }
      await allListed;
    } : undefined;
    // Main di kandang: atlet tuan rumah yang ikut turnamen ini mendapat dorongan morale.
    const home = new Set(ds.flatMap((d) => entries.get(event.id)!.get(d)!).flatMap((c) => pairs.get(c.id)?.playerIds ?? [c.id]));
    for (const id of home) { const p = players.get(id); if (p?.countryId === city.countryId) bumpForm(p, HOME_BONUS); }
    const runs = await each(gated, ds, (d) => {
      let candidates = entries.get(event.id)!.get(d)!;
      if (tier.countryQuota) candidates = applyCountryQuota(candidates, tier.countryQuota);
      const sim = simPlay({ players, pairs, cfg: rs.match, rng, tournamentId: event.id, year, discipline: d, matches: state.matches, live: h.live, hot: hotFormOf(state) });
      const play = gate ? gate.wrap(d, sim) : sim;
      // Catatan sementara sejak undian: halaman turnamen bisa dibuka selagi turnamen dimainkan.
      const onRecord = (rec: EventRecord) => {
        state.eventRecords = state.eventRecords.filter((r) => !(r.tournamentId === event.id && r.year === year && r.discipline === d));
        state.eventRecords.push(rec);
      };
      return runEvent({ tournament: event, discipline: d, year, hostCountryId: city.countryId, candidates, ruleset: rs, rng, play, onDraw: draw, onEntries: onEntries(d), parallel: gated, onRecord });
    });
    ds.forEach((d, i) => {
      const run = runs[i];
      (tier.junior ? state.juniorResults : state.results).push(...knockoutResults(run.main, run.slots, event, tier, d, state.date, rs));
      const rec = toRecord(event.id, year, d, run);
      const live = state.eventRecords.find((r) => r.tournamentId === event.id && r.year === year && r.discipline === d);
      if (live) Object.assign(live, rec); else state.eventRecords.push(rec);
      awardPrizes(state, event, tier, d, run.main.reached, pairs);
      // Target manajer: tercapai → morale naik, meleset ≥ 2 babak → turun.
      for (const [id, target] of Object.entries(state.targets?.[`${year}:${event.id}`] ?? {})) {
        if (!entries.get(event.id)!.get(d)!.some((c) => c.id === id)) continue; // bukan nomor ini / tidak masuk entry
        const res = hitTarget(run.main.reached.get(id) as Round | undefined, target);
        if (res !== 'none') for (const x of pairs.get(id)?.playerIds ?? [id]) { const p = players.get(x); if (p) bumpForm(p, res === 'hit' ? TARGET_HIT : -TARGET_MISS); }
      }
      state.champions.push({ tournamentId: event.id, year, discipline: d, winner: run.main.rounds.at(-1)![0]! });
    });
    applyEventLoad(state, rs, rng, firstMatch, city, tier.grade === 1 || tier.points[0] >= 9000, cities);
  };
  const playAny = (id: string, h: WeekHooks, gated: boolean) => {
    const ev = events.find((e) => e.id === id);
    return ev ? playEvent(ev, h, gated) : playTeamEvent(state, rs, world, rng, teamEvents.find((e) => e.id === id)!, h, gated);
  };

  for (; pick; pick = await ask()) {
    if (played.includes(pick) || !choosable.some((e) => e.id === pick)) continue;
    played.push(pick);
    await playAny(pick, hooks, true);
  }
  for (const e of all) if (!played.includes(e.id)) await playAny(e.id, hooks.chooseEvent ? {} : hooks, false);
  lockFinalsQualifiers(state, rs, world, true); // kejuaraan kontinental minggu ini selesai → peserta final langsung ditetapkan
  updateMorale(state, rs, weekMatches, weekChampions);
  // Istirahat: atlet yang tidak bertanding minggu ini memulihkan morale negatif lebih cepat.
  const busy = new Set(state.matches.slice(weekMatches).flatMap((m) => m.sides.flatMap((s) => pairs.get(s)?.playerIds ?? [s])));
  for (const p of state.players) if (p.form < 0 && !busy.has(p.id)) p.form *= REST_RECOVERY;

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
  if (week >= 52) startYear(state, rs, rng, world); // target & Top Committed musim baru langsung terlihat di minggu 1
  updateRankWeeks(state, rs); // ranking yang berlaku selama minggu baru (poin kedaluwarsa sudah lepas)
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

/**
 * Kekuatan peserta beregu untuk urutan line-up (besar = lebih kuat), dipakai mesin & layar line-up.
 */
export function lineupStrength(state: SeasonState, rs: Ruleset, format: TeamFormat): (id: EntrantId, d: Discipline) => number {
  // Urutan kekuatan BWF (Statuta 5.2.1 kl. 13; GCR 11.6): tunggal = poin World Ranking tunggal; pasangan berperingkat =
  // poin pasangan (main < 8 turnamen → adjusted: ×10/5, ×10/6, ×10/7); pasangan tanpa ranking (mis. ganda dadakan) =
  // notional: rata-rata poin-per-turnamen terbaik tiap atlet bersama pasangan lain × 10 × 80%.
  const now = absWeek(state.date);
  const rows = new Map(DISCIPLINES.map((d) => [d, new Map(computeRanking(isJuniorFormat(format) ? state.juniorResults ?? [] : state.results, d, now, rs)
    .map((r) => [r.entrantId, r]))]));
  const perEvent = (d: Discipline, pairId: string) => { const r = rows.get(d)!.get(pairId); return r ? r.points / Math.min(r.tournamentsPlayed, rs.ranking.bestOf) : 0; };
  const strength = (id: string, d: Discipline) => {
    const row = rows.get(d)!.get(id);
    if (d === 'MS' || d === 'WS') return row?.points ?? 0;
    if (row) return row.tournamentsPlayed < 8 ? row.points * 10 / Math.max(5, row.tournamentsPlayed) : row.points;
    const ids = state.pairs.find((p) => p.id === id)?.playerIds ?? id.slice(AD_HOC.length).split('+');
    const best = ids.map((x) => Math.max(0, ...state.pairs.filter((p) => p.discipline === d && p.id !== id && p.playerIds.includes(x)).map((p) => perEvent(d, p.id))));
    return (best.reduce((s, x) => s + x, 0) / ids.length) * 10 * 0.8;
  };
  return strength;
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
  winnerOf(state.teamResults.filter((r) => r.format === format && !r.confederation && !r.games).at(-1));

/** Format yang dimainkan tahun ini (dari putaran final yang digelar). */
/** Format beregu senior yang putaran finalnya digelar tahun ini (juga format kejuaraan kontinental & target musim). */
export const teamFormatsIn = (rs: Ruleset, year: number) =>
  rs.team.events.filter((e) => !e.confederation && !e.countries && isHeld(e, year)).flatMap((e) => e.formats ?? []).filter((f) => !isJuniorFormat(f));

/**
 * Peserta putaran final (aturan BWF Thomas & Uber / Sudirman): tuan rumah, juara bertahan, `qualifiers` tim teratas
 * tiap kejuaraan kontinental tahun ini (Asia & Eropa: 4 semifinalis; lainnya juara). Kursi kontinental milik tim yang
 * sudah lolos sebagai tuan rumah/juara bertahan jatuh ke tim berperingkat tertinggi berikutnya dari benua itu;
 * sisanya menurut ranking tim (poin line-up terbaik). Urutan hasil = urutan unggulan (kekuatan tim).
 * `conf` (negara → konfederasi); tanpa itu "benua" = peserta kejuaraan kontinentalnya.
 */
export function finalsTeams(state: SeasonState, rs: Ruleset, format: TeamFormat, hostCountryId: string, all: TeamStrength[], size = rs.team.finals.teams, conf?: Map<string, string>) {
  const eligible = new Set(all.map((t) => t.countryId));
  const picked = new Set([hostCountryId, teamHolder(state, format)].filter((c): c is string => !!c && eligible.has(c)));
  const vacant: TeamResult[] = [];
  for (const r of state.teamResults.filter((x) => x.year === state.date.year && x.format === format && x.confederation)) {
    const quota = rs.team.events.find((e) => e.id === r.eventId)?.qualifiers ?? 1;
    const depth = (c: string) => { const i = ROUNDS.indexOf(r.reached[c] as Round); return i < 0 ? ROUNDS.length : i; };
    const finish = [...r.teams].sort((a, b) => depth(a) - depth(b)); // sort stabil: seri → urutan unggulan
    for (const c of finish.slice(0, quota)) if (picked.has(c) || !eligible.has(c)) vacant.push(r); else picked.add(c);
  }
  for (const r of vacant) {
    const next = all.find((t) => !picked.has(t.countryId) && (conf ? conf.get(t.countryId) === r.confederation : r.teams.includes(t.countryId)));
    if (next) picked.add(next.countryId);
  }
  for (const t of all) if (picked.size < size) picked.add(t.countryId);
  return all.filter((t) => picked.has(t.countryId)).map((t) => t.countryId);
}

/**
 * Peserta putaran final ditetapkan begitu kejuaraan kontinental format itu tahun ini selesai (batas ranking = saat itu),
 * sehingga status lolos langsung terlihat (target musim). `after` = dipanggil setelah turnamen minggu ini dimainkan.
 */
export function lockFinalsQualifiers(state: SeasonState, rs: Ruleset, world: World, after: boolean) {
  const { year, week } = state.date;
  const conf = new Map(world.countries.map((c) => [c.id, c.confederation as string]));
  for (const ev of rs.team.events.filter((e) => !e.confederation && !e.countries && isHeld(e, year) && weekOf(e, year) >= week)) {
    for (const format of (ev.formats ?? teamFormatsIn(rs, year)).filter((f) => !isJuniorFormat(f))) {
      const key = `${year}:${format}`;
      if (state.teamQualifiers?.[key]) continue;
      const last = Math.max(-1, ...rs.team.events.filter((e) => e.confederation && isHeld(e, year) && (e.formats ?? teamFormatsIn(rs, year)).includes(format)).map((e) => weekOf(e, year)));
      if (last > week || (last === week && !after)) continue;
      const host = world.cities.find((c) => c.id === hostCityId(ev, year))!.countryId;
      (state.teamQualifiers ??= {})[key] = finalsTeams(state, rs, format, host, teamStrengths(state, rs, format), ev.finals?.teams ?? rs.team.finals.teams, conf);
    }
  }
}

/**
 * Hasil beregu yang sedang dimainkan (diisi selama turnamen berjalan) untuk halaman turnamen. Terpisah dari
 * `teamResults` (tidak disimpan) agar target, gelar & kualifikasi tidak membaca hasil yang belum selesai.
 */
export const liveTeamResults = new WeakMap<SeasonState, TeamResult[]>();
/** Penghubung hasil sementara dengan runTeamEvent: klasemen & bagan gugur langsung tercatat begitu tersedia. */
const liveStages = (r: TeamResult) => ({
  set standings(v: Standing[][] | undefined) { r.standings = v; }, get standings() { return r.standings; },
  set rounds(v: (string | null)[][] | undefined) { r.bracket = v; }, get rounds() { return r.bracket; },
});

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
  const conf = new Map(world.countries.map((c) => [c.id, c.confederation as string]));
  /**
   * Peserta final: daftar yang sudah ditetapkan (tim yang kini tak bisa turun diganti tim berikutnya dari konfederasi
   * yang sama, lalu ranking berikutnya), atau dihitung sekarang.
   */
  const finalsField = (format: TeamFormat, all: TeamStrength[]) => {
    const fixed = state.teamQualifiers?.[`${year}:${format}`];
    if (!fixed) return finalsTeams(state, rs, format, city.countryId, all, finals.teams, conf);
    const can = (c: string) => all.some((t) => t.countryId === c);
    const picked = new Set(fixed.filter(can));
    for (const c of fixed.filter((x) => !can(x))) {
      const next = all.find((t) => !picked.has(t.countryId) && conf.get(t.countryId) === conf.get(c));
      if (next) picked.add(next.countryId);
    }
    for (const t of all) if (picked.size < finals.teams) picked.add(t.countryId);
    return all.filter((t) => picked.has(t.countryId)).map((t) => t.countryId);
  };
  await each(gated, formats, async (format) => {
    const order = rs.team.order[format];
    // Multi-event: pilihan atlet hanya dari kontingen; negara yang kontingennya tidak cukup untuk lima partai tidak ikut beregu.
    const all = teamStrengths(state, rs, format).map((x) => { const c = contingentOf(state, ev.id, x.countryId); return c ? { ...x, pool: squadPool(x.pool, c) } : x; })
      .filter((x) => autoLineup(order, x.pool, max).every(Boolean));
    const teams = ev.countries ? all.filter((t) => ev.countries!.includes(t.countryId)).slice(0, ev.finals?.teams).map((t) => t.countryId) // multi-event: anggota (terkuat bila dibatasi)
      : ev.confederation
      ? all.filter((t) => confederation.get(t.countryId) === ev.confederation).slice(0, ev.finals?.teams ?? rs.team.continentalTeams).map((t) => t.countryId)
      : finalsField(format, all);
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
    // Posisi ranking per nomor. Atlet di ganda = posisi pasangan terbaiknya; ganda dadakan = rata-rata posisi kedua atlet.
    const strength = lineupStrength(state, rs, format);
    const ranked = (l: Lineup) => rankOrder(l, order, strength);
    const lineupOf = async (c: string, opponent: string, round: MatchRound): Promise<Lineup> => {
      const pool = pools.get(c)!;
      const real = (l: Lineup) => l.map((id, i) => (id?.startsWith(AD_HOC) ? adHocPair(c, order[i], id) : id)); // ganda dadakan → pasangan
      const auto = ranked(autoLineup(order, pool, max));
      if (c !== state.managedCountryId) return real(auto);
      // Line-up manajer boleh memakai ganda dadakan (adhoc:a+b) dari atlet skuad.
      const squad = new Set(squads[c]);
      const ok = (l: Lineup | undefined) => {
        if (!l) return undefined;
        const byId = new Map([...Object.values(pool).flat(), ...adHocEntrants(l, order, squad, (id) => players.get(id)?.gender)].map((e) => [e.id, e]));
        return lineupError(l, order, byId, max) ? undefined : l;
      };
      const asked = team?.lineup({ eventId: ev.id, format, round, opponent, pool, squad: squads[c], suggested: ranked(ok(state.teamLineups[format]) ?? auto) });
      const picked = ok(asked ? await asked : state.teamLineups[format]);
      const chosen = picked && ranked(picked);
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
      players, pairs, cfg: rs.match, rng, tournamentId: ev.id, year, discipline: d, matches: state.matches, live, hot: hotFormOf(state),
    })).get(d)!;
    const ties: TeamTie[] = [];
    const current: TeamResult = {
      eventId: ev.id, year, format, confederation: ev.confederation, ...(ev.countries && { games: true as const }), teams, reached: {}, ties, squads,
    };
    const lives = liveTeamResults.get(state) ?? [];
    liveTeamResults.set(state, [...lives.filter((r) => !(r.eventId === ev.id && r.year === year && r.format === format)), current]);
    const tie: PlayFn = async (a, b, round) => {
      const lineups: [Lineup, Lineup] = [await lineupOf(a, b, round), await lineupOf(b, a, round)];
      const from = state.matches.length;
      const r = await playTie(lineups, order, round, playOf, round === 'G');
      const won = r.scores.filter(([x, y]) => x > y).length;
      ties.push({ round, sides: [a, b], score: [won, r.scores.length - won], matchIds: state.matches.slice(from).map((m) => m.id) });
      return r;
    };
    const run = await runTeamEvent(teams, ev.confederation || ev.countries ? ev.finals?.groups : finals.groups, gate ? gate.wrap(format, tie) : tie, rng,
      (steps, groups) => {
        Object.assign(current, { groups, drawSteps: steps });
        return draw?.({ tournamentId: ev.id, entrants: teams, steps, groups: finals.groups.groups }) ?? null;
      }, gated, liveStages(current));
    liveTeamResults.set(state, (liveTeamResults.get(state) ?? []).filter((r) => r !== current));
    state.teamResults.push({
      eventId: ev.id, year, format, confederation: ev.confederation, ...(ev.countries && { games: true as const }), teams,
      groups: run.groups, standings: run.standings, reached: Object.fromEntries(run.reached), ties, squads, drawSteps: run.steps, bracket: run.rounds,
    });
  });
  applyEventLoad(state, rs, rng, firstMatch, city, true, cities);
}

/** Riwayat peringkat dari snapshot (tiap 4 minggu). */
/** Satu minggu (atau `weeks` minggu dari snapshot) di peringkat `rank` untuk peserta `id`. */
function addRankWeeks(byId: Record<string, RankWeeks>, id: string, rank: number, weeks: number) {
  const e = (byId[id] ??= { r: 0, run: 0, at: {} });
  e.run = e.r === rank ? e.run + weeks : weeks;
  e.r = rank;
  if (rank <= RANK_WEEKS_TOP) e.at[rank] = (e.at[rank] ?? 0) + weeks;
}

/** Akhir minggu: catat peringkat senior tiap peserta (300 besar); yang keluar dari 300 besar rentetannya berhenti. */
/** Minggu di peringkat tersedia sejak awal (karier baru / save lama saat dimuat): catat minggu berjalan bila belum ada. */
export function ensureRankWeeks(state: SeasonState, rs: Ruleset) {
  if (!state.rankWeeks) updateRankWeeks(state, rs);
}

/** Catat ranking minggu berjalan (dipanggil saat minggu baru dimulai). */
function updateRankWeeks(state: SeasonState, rs: Ruleset) {
  if (!state.rankWeeks) {
    // Save lama: isi awal dari snapshot 4-mingguan (tiap snapshot ≈ 4 minggu di peringkat itu).
    state.rankWeeks = {};
    for (const s of state.rankSnapshots) {
      const byId = (state.rankWeeks[s.discipline] ??= {});
      const seen = new Set(s.ids);
      s.ids.forEach((id, i) => addRankWeeks(byId, id, i + 1, 4));
      for (const [id, e] of Object.entries(byId)) if (!seen.has(id)) { e.r = 0; e.run = 0; }
    }
  }
  const now = absWeek(state.date);
  for (const d of DISCIPLINES) {
    const byId = (state.rankWeeks[d] ??= {});
    const ranked = computeRanking(state.results, d, now, rs).slice(0, 300);
    const seen = new Set<string>();
    for (const r of ranked) { addRankWeeks(byId, r.entrantId, r.rank, 1); seen.add(r.entrantId); }
    for (const [id, e] of Object.entries(byId)) {
      if (seen.has(id)) continue;
      e.r = 0; e.run = 0;
      if (!Object.keys(e.at).length) delete byId[id]; // tidak pernah di 100 besar: tidak perlu disimpan
    }
  }
}

/** Id atlet & semua pasangannya (peserta yang mungkin tercatat di riwayat). */
const entrantIdsOf = (state: SeasonState, playerId: string) => new Set([playerId, ...state.pairs.filter((p) => p.playerIds.includes(playerId)).map((p) => p.id)]);

/**
 * Atlet sudah punya riwayat (laga, poin ranking, skuad/line-up beregu): tidak boleh dihapus dari save berjalan agar
 * riwayat tetap utuh. Atlet baru (mis. dibuat di Editor) yang belum pernah main boleh dihapus.
 */
export function hasHistory(state: SeasonState, playerId: string) {
  const ids = entrantIdsOf(state, playerId);
  return state.matches.some((m) => m.sides.some((s) => ids.has(s)))
    || [...state.results, ...(state.juniorResults ?? [])].some((r) => ids.has(r.entrantId))
    || JSON.stringify([state.teamSquads, state.teamLineups, state.teamResults]).includes(`"${playerId}"`);
}

/** Bersihkan referensi atlet (dan pasangannya) yang dihapus dari pilihan entry, kewajiban, prioritas tier & pengalaman. */
export function forgetPlayer(state: SeasonState, playerId: string, pairIds: string[]) {
  for (const id of [playerId, ...pairIds]) {
    for (const week of Object.values(state.manualEntries)) delete week[id];
    delete state.commitments[id];
    delete state.tierPrefs?.[id];
    delete state.experience[id];
  }
}

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
    const report = seasonReport(state, rs, career.countryId, career.goals, world);
    career.reports.push(report);
    career.reputation = Math.max(0, Math.min(100, career.reputation + report.reputationChange));
  }
  // Hemat ukuran save: statistik detail hanya 2 musim terakhir (skor & H2H tetap), hasil ranking > 2 tahun dibuang.
  const dropped = state.matches.filter((m) => m.year < year - 1 && m.stats);
  archiveStats((state.statArchive ??= {}), dropped); // statistik karier tetap utuh
  for (const m of dropped) delete m.stats;
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
  const usedNames = new Set(state.players.map((p) => p.name)); // nama junior baru tidak kembar dengan atlet yang ada
  for (const c of world.countries) {
    const juniors = newJuniors(c, rs.development, rs.generator, next, rng, usedNames);
    // Negara manajer: junior baru dipilih dari kandidat (pencarian bakat), bukan langsung masuk.
    if (c.id === state.managedCountryId) state.scouting = makeScouting(juniors, c, rs.generator, next, rng, usedNames);
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
