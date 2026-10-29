import { EARLY_LOSS, isEarly, isHeldBack, updateReadiness } from './promotion';
import { bumpForm, CAREER_HIGH_BONUS, CLOSE_LOSS_EXP, CLOSE_LOSS_GAP, COMEBACK_CHANCE, COMEBACK_MENTAL, eliteCounts, isCloseLoss, mentorsOf, FIRST_TITLE_BONUS, FIRST_TOP10_WIN_BONUS, HOME_BONUS, hitTarget, PAIR_STREAK_BONUS, PAIR_STREAK_FROM, REST_RECOVERY, SELECT_BONUS, SNUB_PENALTY, snubbed, TARGET_HIT, TARGET_MISS, BREAKTHROUGH_AGE } from './boosts';
import { chemistryMult, ensureTraits, FRAGILE_DOWN, hasTrait, HOME_HERO_BONUS, injuryMult, LEADER_PARTNER, LEADER_SQUAD, QUICK_RECOVERY, TRAVELER_FATIGUE } from './traits';
import { makeChallenges, seasonGoals, seasonReport, suggestJuniorTargets, suggestTargets } from './career';
import { contingentOf, inContingent, lockContingents } from './contingent';
import { olympicField } from './olympics';
import { updateAwards, type AwardYear } from './awards';
import { INDEPENDENT_QUIT, INDEPENDENT_TOP, isCrossNation, pairIndependents, releaseAthletes } from './independents';
import { applySevereInjury, capToPa, developQuarter, injuredFor, newJuniors, retirementChance, rollInjury } from './development';
import { applyCountryQuota, type Candidate, type EntryList } from './entry';
import { ageAt, currentAbility, generateWorld, isJuniorAge, isPratama } from './generator';
import { archiveStats, type StatAcc } from './careerStats';
import { absWeek, computeRace, computeRanking, knockoutResults, rankMap } from './ranking';
import { makeRng, shuffle, type Rng } from './rng';
import type { Standing } from './groups';
import { each, type MatchRound, type PlayFn } from './knockout';
import { juniorEntries, juniorTeamEntrants } from './junior';
import { AD_HOC, adHocEntrants, autoLineup, rankOrder, autoSquad, lineupError, playOrder, playTie, runTeamEvent, squadError, squadPool, type Lineup, type TeamEntrant } from './team';
import { runEvent, simPlay, tournamentWildcards, toRecord, type HotForm, type DrawHook, type DrawShow, type EntriesHook, type EntriesShow, type EventRecord, type LiveHook } from './tournament';
import { roundGate, type RoundHook } from './gate';
import { makeScouting, recruit, SCOUTING_DEADLINE_WEEK, withdrawCandidates, type Scouting, type ScoutFocus } from './scouting';
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
  /** BWF Player of the Year per tahun (nominasi & pemenang). Save lama: tidak ada. */
  awards?: AwardYear[];
  /** Poin turnamen junior (ranking junior dunia), terpisah dari ranking senior. */
  juniorResults: RankingEntry[];
  /** Sistem promosi junior aktif (save lama dimigrasi sekali saat dimuat). */
  juniorPromotion?: true;
  /** Koreksi tradisi atlet junior asli sudah diterapkan (save lama disesuaikan sekali saat dimuat). */
  juniorCalibrated?: true;
  /** Turnamen kecil di negara yang sama sudah disebar (`spreadHosts`). Save lama: tidak ada. */
  /** Sifat atlet sudah diacak untuk semua atlet (save lama: diisi saat dimuat). */
  traitsRolled?: true;
  /** Protected ranking BWF yang masih berlaku (atlet/pasangan 32 besar yang cedera panjang). */
  protectedRanks?: ProtectedRank[];
  /** Hasil undian tuan rumah terakhir (tahun yang diundi, diumumkan di berita awal musim). */
  hostDraw?: { year: number; drawn: { id: string; cityId: string }[] };
  hostsSpread?: true | 2 | 3; // 2 = juga tier yang sama tidak sepekan, 3 = World Tour sebelum Finals
  /** Top Committed Players musim ini: entrantId → id turnamen wajib. */
  commitments: Record<EntrantId, string[]>;
  commitmentsYear?: number;
  violations: Violation[];
  /** Laga berbobot per atlet di kuartal berjalan (untuk bonus perkembangan). */
  experience: Record<string, number>;
  /** Target babak yang diatur manual per entrant (kunci "tahun:eventId"); 'none' = sengaja tanpa target. Tanpa isian = target otomatis. */
  targets?: Record<string, Record<string, Round | 'none'>>;
  /** Hasil target babak manajer (rapor target musim). */
  targetLog?: { year: number; eventId: string; discipline: Discipline; id: string; target: Round; reached?: Round; res: 'hit' | 'miss' | 'none'; auto?: true }[];
  /** Negara yang pasangannya diatur manajer (AI tidak membentuk pasangan baru di sana). */
  managedCountryId?: string | null;
  career?: Career;
  /** Keputusan entry manajer: "tahun-minggu" → entrantId → eventId atau 'rest'. Tanpa keputusan = saran AI. */
  manualEntries: Record<string, Record<string, string>>;
  /** Prioritas tier entry otomatis negara manajer: entrantId (atlet tunggal / pasangan) → tier yang diikuti. Kosong = AI bebas. */
  tierPrefs?: Record<string, TierId[]>;
  /** Pencarian bakat junior negara manajer yang belum diputuskan (kandidat akhir musim). */
  scouting?: Scouting;
  /** Daftar entry yang sudah terbit (batas entry lewat), kunci "tahun:eventId": peserta per nomor, urut seperti saat diterbitkan. */
  entryLists?: Record<string, Partial<Record<Discipline, Candidate[]>>>;
  /** Entrant yang mundur setelah daftar entry terbit (kunci "tahun:eventId"). */
  withdrawn?: Record<string, string[]>;
  /** Fokus pencarian bakat akhir musim berikutnya (kosong = seimbang). */
  scoutFocus?: ScoutFocus;
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

/**
 * Undian tuan rumah: event yang punya kota kandidat (`rotation`) tapi belum punya tuan rumah tahun itu diundi di antara
 * kandidatnya — sebisa mungkin bukan negara yang sudah menggelar event lain dalam HOST_GAP minggu, dan bukan negara
 * (lalu bukan kota) tuan rumah edisi sebelumnya. Hasilnya dipatok ke `hosts`.
 */
export function drawHosts(rs: Ruleset, year: number, rng: Rng, world?: World): { id: string; cityId: string }[] {
  const country = new Map(world?.cities.map((c) => [c.id, c.countryId]) ?? []);
  const drawn: { id: string; cityId: string }[] = [];
  for (const e of [...rs.calendar, ...rs.team.events]) {
    if (!e.rotation?.length || e.hosts?.[year] !== undefined || !isHeld(e, year)) continue;
    let prev: string | undefined;
    for (let y = year - 1; y >= year - 12 && !prev; y--) if (isHeld(e, y)) prev = hostCityId(e, y);
    const all = [...new Set(e.rotation)];
    // Negara yang sudah menggelar event lain dalam HOST_GAP minggu dari event ini (tahun itu) dihindari bila bisa.
    const w = weekOf(e, year);
    const busy = new Set([...rs.calendar, ...rs.team.events].filter((x) => x !== e && isHeld(x, year) && Math.abs(weekOf(x, year) - w) < HOST_GAP)
      .map((x) => country.get(hostCityId(x, year))));
    const newCountry = (c: string) => c !== prev && (!country.has(c) || country.get(c) !== country.get(prev ?? ''));
    const free = (c: string) => !country.has(c) || !busy.has(country.get(c));
    const pool = [all.filter((c) => newCountry(c) && free(c)), all.filter((c) => c !== prev && free(c)), all.filter(newCountry), all.filter((c) => c !== prev), all]
      .find((l) => l.length)!;
    const cityId = pool[Math.floor(rng() * pool.length)];
    (e.hosts ??= {})[year] = cityId;
    drawn.push({ id: e.id, cityId });
  }
  return drawn;
}

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
  scheduleShift(rs, year, rng, world);
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
/** Jarak yang diupayakan (minggu) antar turnamen di kota yang sama. ASUMSI: kalibrasi, docs/ASUMSI.md. */
export const CITY_GAP = 8;

/**
 * Sebar turnamen kecil (Super 300 ke bawah, grade 3, junior internasional) yang `movable` agar turnamen di negara yang
 * sama berjarak ≥ HOST_GAP minggu dan sebisa mungkin tidak sepekan dengan turnamen tier yang sama; minggu terdekat dari
 * jadwalnya yang tidak bentrok (bila mustahil: bentrok paling sedikit, jarak senegara lebih diutamakan). Turnamen junior internasional tetap satu per minggu & tidak sepekan dengan event junior lain.
 */
export function spreadHosts(rs: Ruleset, year: number, rng: Rng, world: World, movable: (e: TournamentDef) => boolean, fromWeek = 1) {
  const cityCountry = new Map(world.cities.map((c) => [c.id, c.countryId]));
  const juniorTier = new Set(rs.tiers.filter((x) => x.junior).map((x) => x.id));
  const smallTier = (e: TournamentDef) => !ANCHOR_TIERS.has(e.tierId) && !BIG_TIERS.has(e.tierId) && e.tierId !== 'WJC' && e.tierId !== 'YOG';
  const held = rs.calendar.filter((e) => isHeld(e, year));
  const moving = shuffle(rng, held.filter((e) => movable(e) && smallTier(e) && !e.countries && !e.confederation));
  const wt = (tier?: string) => !!tier && rs.race.tiers.includes(tier);
  const placed: { city: string; country?: string; week: number; junior: boolean; tier?: string }[] = [
    ...held.filter((e) => !moving.includes(e)).map((e) => ({ city: hostCityId(e, year), country: cityCountry.get(hostCityId(e, year)), week: weekOf(e, year), junior: juniorTier.has(e.tierId), tier: e.tierId })),
    ...rs.team.events.filter((e) => isHeld(e, year)).map((e) => ({ city: hostCityId(e, year), country: cityCountry.get(hostCityId(e, year)), week: weekOf(e, year), junior: !!e.formats?.some(isJuniorFormat) })),
  ];
  const wtf = finalsWeek(rs, year);
  // Dua putaran: putaran kedua menempatkan ulang tiap turnamen dengan semua yang lain sudah terpasang (greedy satu putaran
  // bisa terjebak urutan acak).
  const mine = new Map<TournamentDef, (typeof placed)[number]>();
  for (let pass = 0; pass < 2; pass++) for (const e of moving) {
    const city = hostCityId(e, year), country = cityCountry.get(city), w0 = e.weeks?.[year] ?? e.week, junior = juniorTier.has(e.tierId);
    const others = placed.filter((p) => p !== mine.get(e));
    let best = w0, bestScore = Infinity;
    // World Tour selalu sebelum Finals; selain itu boleh tetap di minggunya bila sesudah Finals (grade 3 Desember).
    for (let w = fromWeek; w <= (rs.race.tiers.includes(e.tierId) ? wtf - 1 : Math.max(wtf - 1, w0)); w++) {
      if (junior && others.some((p) => p.junior && p.week === w)) continue;
      const clash = others.reduce((s, p) => s + (p.country === country ? Math.max(0, HOST_GAP - Math.abs(p.week - w)) : 0), 0);
      // World Tour tidak sepekan dengan World Tour lain; kota yang sama sebisa mungkin berjarak ≥ CITY_GAP minggu.
      const wtClash = wt(e.tierId) ? others.filter((p) => wt(p.tier) && p.week === w).length : 0;
      const sameTier = others.filter((p) => p.tier === e.tierId && p.week === w).length;
      const near = others.reduce((s, p) => s + (p.city === city ? Math.max(0, CITY_GAP - Math.abs(p.week - w)) : 0), 0);
      // Kota yang sama < HOST_GAP minggu: lebih berat dari bentrok tier (jarak minimal sekota wajib, docs/ASUMSI.md).
      const cityClash = others.filter((p) => p.city === city && Math.abs(p.week - w) < HOST_GAP).length;
      const score = wtClash * 10000 + cityClash * 5000 + sameTier * 3000 + clash * 1000 + near * 10 + Math.abs(w - w0);
      if (score < bestScore) [best, bestScore] = [w, score];
    }
    (e.weeks ??= {})[year] = best;
    const entry = mine.get(e);
    if (entry) entry.week = best;
    else { const p = { city, country, week: best, junior, tier: e.tierId }; mine.set(e, p); placed.push(p); }
  }
}

function scheduleShift(rs: Ruleset, year: number, rng: Rng, world?: World) {
  const cityCountry = new Map(world?.cities.map((c) => [c.id, c.countryId]) ?? []);
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
    // Super 500+: bila −1/0/+1 penuh, cari minggu bebas terdekat (±2, ±3, …).
    const options = [...shuffle(rng, [-1, 0, 0, 1]), ...(isBig ? [-2, 2, -3, 3, -4, 4] : [])].map((d) => e.week + d)
      .filter((w) => w >= 1 && w < wtf && (!isBig || (!big.has(w) && !blocked.has(w))));
    // Super 500+ sebisa mungkin tidak dalam HOST_GAP minggu dari event lain di negara yang sama (mis. tuan rumah beregu hasil undian).
    const country = cityCountry.get(hostCityId(e, year));
    const near = (w: number) => !world ? 0 : [...held, ...rs.team.events.filter((x) => isHeld(x, year))]
      .filter((x) => x !== e && cityCountry.get(hostCityId(x, year)) === country && Math.abs(weekOf(x, year) - w) < HOST_GAP).length;
    if (isBig) options.sort((a, b) => near(a) - near(b));
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
    juniorPromotion: true, juniorCalibrated: true, traitsRolled: true, hostsSpread: 3, entriesSubmittedKinds: true, experience: {}, manualEntries: {}, rankSnapshots: [], teamResults: [], teamLineups: {}, teamSquads: {}, eventRecords: [], earnings: {}, managedCountryId: null,
    career: { countryId, goals: [], reports: [], reputation: 50 },
  };
  if (roster?.players.length) {
    // Negara roster yang belum punya cukup pasangan. Ranking awal dulu agar spesialis tunggal tidak ikut dipasangkan.
    state.results = bootstrapResults(state, ruleset);
    formPairs(state, ruleset, world, makeRng(seed + 2));
  }
  ensureTraits(state.players);
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
  // Tuan rumah musim depan diundi di awal musim (diumumkan di berita); musim ini juga bila belum (save lama).
  if (year > rs.startYear) drawHosts(rs, year, rng, world);
  const drawn = drawHosts(rs, year + 1, rng, world);
  if (drawn.length || state.hostDraw?.year !== year + 1) state.hostDraw = { year: year + 1, drawn };
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
 * Batas entry per tier (minggu sebelum minggu turnamen), mengikuti prospektus & regulasi BWF (ASUMSI, dibulatkan ke minggu):
 * Super 1000/750 ±42 hari, Super 500/300 ±35 hari, Super 100 & grade 3 & kejuaraan kontinental 4 minggu, Kejuaraan Dunia
 * ±2 minggu; junior: Kejuaraan Dunia Junior ±3 minggu, lainnya ±4 minggu. Tier lain (WTF, Olimpiade, multi-event) tanpa
 * batas entry: peserta ditetapkan saat turnamen (kualifikasi / kontingen).
 */
export const ENTRY_LEAD: Record<string, number> = {
  S1000: 6, S750: 6, S500: 5, S300: 5, S100: 4, IC: 4, IS: 4, FS: 4, CCA: 4, CCE: 4, CCP: 4, CCI: 4, WC: 2,
  WJC: 3, JC: 4, JC2: 4, JU17: 4, JGP: 4, JIC: 4, JIS: 4,
};
/** Nominasi skuad beregu: 14 hari sebelum turnamen (regulasi Thomas & Uber Cup 9.1). */
export const TEAM_ENTRY_LEAD = 2;
/** Mundur tanpa penalti sampai sebelum minggu W−1 (±seminggu sebelum undian); sesudahnya reputasi −1 (kecuali cedera). */
export const WITHDRAW_FREE_WEEKS = 1, LATE_WITHDRAW_PENALTY = 1;

/** Minggu batas entry (entry terakhir bisa diubah di minggu ini; awal Januari: minggu 1). Tanpa batas → undefined. */
export function entryDeadline(rs: Ruleset, id: string, year: number): number | undefined {
  const ev = rs.calendar.find((e) => e.id === id);
  if (ev) { const lead = ENTRY_LEAD[ev.tierId]; return lead === undefined ? undefined : Math.max(1, weekOf(ev, year) - lead); }
  const team = rs.team.events.find((e) => e.id === id);
  return team && Math.max(1, weekOf(team, year) - TEAM_ENTRY_LEAD);
}
/**
 * Entry turnamen sudah ditutup: minggu batas sudah dimainkan (individu: daftar entry sudah terbit — save lama yang
 * batasnya terlewat tetap bisa diisi sampai daftar terbit di minggu berikutnya).
 */
export const entryClosed = (state: SeasonState, rs: Ruleset, id: string) => {
  const d = entryDeadline(rs, id, state.date.year);
  if (d === undefined || state.date.week <= d) return false;
  return rs.calendar.some((e) => e.id === id) ? !!state.entryLists?.[`${state.date.year}:${id}`] : true;
};

/** Mundur dari daftar entry yang sudah terbit; mundur terlambat tanpa cedera (bukan atlet wajib) → reputasi −1. Hasil: kena penalti. */
export function withdrawEntry(state: SeasonState, rs: Ruleset, eventId: string, entrantId: string) {
  const { year, week } = state.date;
  const key = `${year}:${eventId}`;
  const list = (state.withdrawn ??= {})[key] ??= [];
  if (list.includes(entrantId)) return false;
  list.push(entrantId);
  const ev = rs.calendar.find((e) => e.id === eventId)!;
  const ids = state.pairs.find((p) => p.id === entrantId)?.playerIds ?? [entrantId];
  const injured = ids.some((id) => state.players.find((p) => p.id === id)?.injury);
  const late = week >= weekOf(ev, year) - WITHDRAW_FREE_WEEKS;
  if (!late || injured || state.commitments[entrantId]?.includes(eventId) || !state.career) return false;
  state.career.reputation = Math.max(0, state.career.reputation - LATE_WITHDRAW_PENALTY);
  return true;
}

/**
 * Terbitkan daftar entry turnamen yang batas entrinya sudah tiba (minggu ini atau terlewat, mis. save lama), per minggu
 * turnamen: junior dulu, lalu senior; atlet yang sudah terdaftar di turnamen lain minggu itu tidak didaftarkan lagi.
 */
function publishEntries(state: SeasonState, rs: Ruleset, world: World, rng: Rng, onlyThisWeek = false) {
  const { year, week } = state.date;
  const lists = (state.entryLists ??= {});
  const due = rs.calendar.filter((e) => isHeld(e, year) && (onlyThisWeek ? weekOf(e, year) === week : weekOf(e, year) >= week) && !lists[`${year}:${e.id}`]
    && (entryDeadline(rs, e.id, year) ?? Infinity) <= week);
  if (!due.length) return;
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const ranks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, absWeek(state.date), rs))]));
  const juniorRanks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.juniorResults, d, absWeek(state.date), rs))]));
  const store = (entries: Map<string, Map<Discipline, Candidate[]>>) => {
    for (const [id, byD] of entries) lists[`${year}:${id}`] = Object.fromEntries(byD) as Partial<Record<Discipline, Candidate[]>>;
  };
  for (const w of new Set(due.map((e) => weekOf(e, year)))) {
    const evs = due.filter((e) => weekOf(e, year) === w).sort((a, b) => tierOf(rs, b).points[0] - tierOf(rs, a).points[0]);
    const manual = state.manualEntries[weekKey({ year, week: w })] ?? {};
    // Atlet di daftar entry lain minggu itu (sudah terbit) tidak didaftarkan lagi.
    const busy = new Set(rs.calendar.filter((e) => weekOf(e, year) === w).flatMap((e) => Object.values(lists[`${year}:${e.id}`] ?? {}).flat()
      .flatMap((c) => pairs.get(c!.id)?.playerIds ?? [c!.id])));
    const junior = juniorEntries(state, evs.filter((e) => tierOf(rs, e).junior), rs, world, juniorRanks, manual, rng, busy, w - week);
    state.pairs.push(...junior.created);
    store(junior.entries);
    junior.busy.forEach((id) => busy.add(id));
    // Minggu beregu junior (Suhandinata Cup): junior disiapkan untuk timnya, tidak didaftarkan ke turnamen senior.
    if (rs.team.events.some((e) => isHeld(e, year) && weekOf(e, year) === w && e.formats?.some(isJuniorFormat)))
      for (const p of state.players) if (isJuniorAge(p, state.date)) busy.add(p.id);
    store(chooseEntries(state, evs.filter((e) => !tierOf(rs, e).junior), rs, rng, ranks, busy, world, manual));
  }
}

/**
 * Protected ranking (BWF Player Commitment Regulations): atlet/pasangan 32 besar yang absen ≥ 3 bulan karena cedera
 * dibekukan poinnya. Dipakai pertama kali (debut) paling lambat 12 bulan setelah cedera, lalu berlaku 182 hari; hanya
 * untuk penerimaan entry World Tour, bukan unggulan. ASUMSI: pasangan memakai poin pasangan itu sendiri (pasangan baru
 * dengan atlet yang dilindungi tidak dihitung).
 */
export const PR_TOP = 32, PR_MIN_WEEKS = 13, PR_DEBUT_WEEKS = 52, PR_USE_WEEKS = 26;
export interface ProtectedRank { id: EntrantId; discipline: Discipline; points: number; from: number; debut?: number }
export const prActive = (pr: ProtectedRank, now: number) => pr.debut === undefined ? now <= pr.from + PR_DEBUT_WEEKS : now < pr.debut + PR_USE_WEEKS;

/** Atlet cedera panjang: lindungi poin semua entrant-nya (tunggal/pasangan) yang ada di 32 besar. */
export function protectRanking(state: SeasonState, rs: Ruleset, playerId: string) {
  const now = absWeek(state.date);
  state.protectedRanks = (state.protectedRanks ?? []).filter((x) => prActive(x, now));
  for (const d of DISCIPLINES) {
    const mine = new Set(entrantsFor(state, d).filter((e) => e.playerIds.includes(playerId)).map((e) => e.id));
    if (!mine.size) continue;
    for (const row of computeRanking(state.results, d, now, rs).slice(0, PR_TOP))
      if (mine.has(row.entrantId) && !state.protectedRanks.some((x) => x.id === row.entrantId && x.discipline === d))
        state.protectedRanks.push({ id: row.entrantId, discipline: d, points: row.points, from: now });
  }
}

/**
 * Pilihan turnamen AI untuk semua peserta minggu ini.
 * Urutan nomor MS→XD: turnamen pertama yang dipilih seorang atlet mengikat nomor lainnya (satu turnamen per minggu).
 * Turnamen wajib (Top Committed) selalu dipilih; lainnya menurut rentang peringkat, peluang ikut & kelelahan.
 */
function chooseEntries(state: SeasonState, events: TournamentDef[], rs: Ruleset, rng: Rng, ranks: Map<Discipline, Map<string, number>>, busy = new Set<string>(), world?: World,
  manual: Record<string, string> = state.manualEntries[weekKey(state.date)] ?? {}) {
  const entries = new Map(events.map((e) => [e.id, new Map<Discipline, Candidate[]>(DISCIPLINES.map((d) => [d, []]))]));
  const playerEvent = new Map<string, string>();
  const fatigue = new Map(state.players.map((p) => [p.id, p.fatigue]));
  // Cedera yang sembuh sebelum minggu turnamen tidak menghalangi entry (semua turnamen di sini satu minggu).
  const ahead = events.length ? weekOf(events[0], state.date.year) - state.date.week : 0;
  const injured = new Set(state.players.filter((p) => injuredFor(p, ahead)).map((p) => p.id));
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
  // Pasangan beda negara (pemain independen): hanya turnamen terbuka — World Tour, WTF & grade 3 (IC/IS/FS).
  const openTier = (ev: TournamentDef) => rs.race.tiers.includes(ev.tierId) || ev.tierId === 'WTF' || tierOf(rs, ev).grade === 3;
  const strengthOf = (e: Entrant) => e.playerIds.reduce((sum, id) => sum + currentAbility(playerById.get(id)!.attrs), 0) / e.playerIds.length;
  // Protected ranking: peringkat poin yang dibekukan di ranking saat ini (lebih baik dari peringkat sebenarnya).
  const now = absWeek(state.date);
  const prs = (state.protectedRanks ?? []).filter((x) => prActive(x, now));
  const pointsOf = new Map<Discipline, number[]>();
  const protectedOf = (e: Entrant, d: Discipline, rank?: number) => {
    const pr = prs.find((x) => x.id === e.id && x.discipline === d);
    if (!pr) return undefined;
    if (!pointsOf.has(d)) pointsOf.set(d, computeRanking(state.results, d, now, rs).map((r) => r.points));
    const r = pointsOf.get(d)!.filter((p) => p > pr.points).length + 1;
    return r < (rank ?? Infinity) ? { pr, rank: r } : undefined;
  };

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
    const prot = protectedOf(e, d, rank);
    const fixed = e.playerIds.map((id) => playerEvent.get(id)).find(Boolean);
    const cross = isCrossNation(e.playerIds, (id) => playerById.get(id)?.countryId);
    const options = events.filter((ev) => ev.tierId !== 'WTF' && ev.tierId !== 'OG' && tierOf(rs, ev).drawSize[d] > 0 && (!fixed || ev.id === fixed)
      && (!cross || openTier(ev))
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
      const ev = aiEventChoice(local, rs, prot?.rank ?? rank, prefs, rng);
      // prioritas manajer: selalu diikuti (kecuali lelah); tanpa prioritas: peluang ikut per tier & kelelahan
      if (ev && tired <= rs.ai.restAbove && (prefs?.length || rng() < (rs.ai.playProb[ev.tierId] ?? 0.5) * (1 - tired / 150))) choice = ev;
    }
    if (!choice) continue;
    const usePr = prot && rs.race.tiers.includes(choice.tierId); // hanya World Tour
    if (usePr) prot.pr.debut ??= now;
    entries.get(choice.id)!.get(d)!.push({ id: e.id, countryId: e.countryId, rank, ...(usePr && { entryRank: prot.rank }), ...(rank === undefined && !usePr && { strength: strengthOf(e) }) });
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
export type ChooseEvent = (req: { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[]; deadlines?: string[] }) => Promise<string | null>;

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

function updateMorale(state: SeasonState, rs: Ruleset, fromMatch: number, fromChampion: number, ranks: Map<Discipline, Map<string, number>>) {
  const cfg = rs.match.morale;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const members = (id: string) => (pairs.get(id)?.playerIds ?? [id]).map((x) => players.get(x)).filter((p): p is Player => !!p);
  const ability = (ps: Player[]) => ps.reduce((s, p) => s + currentAbility(p.attrs), 0) / Math.max(1, ps.length);
  // Promosi terlalu cepat: kekalahan di turnamen senior lebih menurunkan morale selama masa "belum siap".
  // ponytail: laga beregu junior (Suhandinata) dihitung senior — jarang, atlet "belum siap" biasanya di kejuaraan individu.
  const now = absWeek(state.date);
  const juniorEv = new Set(rs.calendar.filter((e) => rs.tiers.find((x) => x.id === e.tierId)?.junior).map((e) => e.id));
  const add = (ps: Player[], d: number, senior = false) => {
    for (const p of ps) {
      let x = d < 0 && hasTrait(p, 'fragileMorale') ? d * FRAGILE_DOWN : d;
      if (x < 0 && senior && isEarly(p, now)) x *= EARLY_LOSS;
      bumpForm(p, x);
    }
  };
  for (const m of state.matches.slice(fromMatch)) {
    if (m.walkover) continue;
    const sides = m.sides.map(members);
    if (sides.some((ps) => !ps.length)) continue;
    const p0 = 1 / (1 + Math.exp((ability(sides[1]) - ability(sides[0])) / cfg.scale)); // peluang sisi 0 menang
    const d = cfg.k * ((m.winner === 0 ? 1 : 0) - p0);
    const senior = !juniorEv.has(m.tournamentId);
    add(sides[0], d, senior);
    add(sides[1], -d, senior);
    if (m.round === 'F') add(sides[1 - m.winner], cfg.finalBonus);
    const ws = sides[m.winner];
    // Pemimpin: pasangannya ikut terangkat saat menang.
    if (ws.length > 1) for (const p of ws) if (ws.some((o) => o !== p && hasTrait(o, 'leader'))) bumpForm(p, LEADER_PARTNER);
    // Pasangan kompak: menang beruntun bersama menambah morale keduanya.
    const wp = pairs.get(m.sides[m.winner]), lp = pairs.get(m.sides[1 - m.winner]);
    if (wp) { wp.winStreak = (wp.winStreak ?? 0) + 1; if (wp.winStreak >= PAIR_STREAK_FROM) add(ws, PAIR_STREAK_BONUS); }
    if (lp) lp.winStreak = 0;
    // Menang pertama atas top 10 (ranking sebelum minggu ini).
    if ((ranks.get(m.discipline)?.get(m.sides[1 - m.winner]) ?? 9999) <= 10)
      for (const p of ws) if (!p.beatTop10) { p.beatTop10 = true; bumpForm(p, FIRST_TOP10_WIN_BONUS); }
    // Terobosan: atlet muda negara manajer pertama kali menang atas top 50 senior (berita minggu depan).
    const lr = ranks.get(m.discipline)?.get(m.sides[1 - m.winner]) ?? 9999;
    if (senior && lr <= 50)
      for (const p of ws) if (!p.firstTop50 && p.countryId === state.managedCountryId && ageAt(p.birth, state.date) <= BREAKTHROUGH_AGE) p.firstTop50 = { w: now, opp: m.sides[1 - m.winner], rank: lr };
  }
  const earlier = new Set(state.champions.slice(0, fromChampion).map((c) => c.winner));
  for (const c of state.champions.slice(fromChampion)) {
    add(members(c.winner), cfg.titleBonus);
    if (!earlier.has(c.winner)) { add(members(c.winner), FIRST_TITLE_BONUS); earlier.add(c.winner); } // gelar pertama
  }
}

export async function playWeek(state: SeasonState, rs: Ruleset, world: World, rng: Rng, hooks: WeekHooks = {}) {
  const { year, week } = state.date;
  if (state.commitmentsYear !== year) startYear(state, rs, rng, world);
  if (state.scouting && week >= 2 && week <= SCOUTING_DEADLINE_WEEK) withdrawCandidates(state.scouting, rng);
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
    p.fatigue = Math.max(0, p.fatigue - rs.fatigue.recoveryPerWeek * (hasTrait(p, 'quickRecovery') ? QUICK_RECOVERY : 1));
    if (p.injury && --p.injury.weeksLeft <= 0) {
      // Kembali lebih kuat: sembuh dari cedera berat kadang menaikkan mental.
      if (p.injury.level === 'severe' && rng() < COMEBACK_CHANCE) { p.attrs.mental += COMEBACK_MENTAL; capToPa(p); }
      p.injury = undefined;
    }
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
  // Turnamen (negara manajer) yang batas entrinya minggu ini: tetap bisa di-submit di layar minggu, juga sesudah main turnamen.
  const deadlines = managed ? [...rs.calendar, ...rs.team.events].filter((e) => isHeld(e, year) && weekOf(e, year) > week && openTo(e, managed, world)
    && (entryDeadline(rs, e.id, year) === week || ((entryDeadline(rs, e.id, year) ?? Infinity) < week && 'tierId' in e && !entryClosed(state, rs, e.id))))
    .map((e) => e.id) : [];
  const ask = () => {
    if (!hooks.chooseEvent || (!choosable.some((e) => !played.includes(e.id)) && !deadlines.length)) return null;
    return hooks.chooseEvent({ week, events: choosable, played, deadlines });
  };
  let pick = await ask();
  // Turnamen minggu ini yang daftar entrinya belum terbit (mis. save lama). Batas entry minggu ini: terbit di akhir minggu.
  publishEntries(state, rs, world, rng, true);
  // Kondisi atlet saat batas entry (sebelum turnamen minggu ini): dipakai saat daftar entry terbit di akhir minggu.
  const atDeadline = new Map(state.players.map((p) => [p, { fatigue: p.fatigue, injury: p.injury }]));
  for (const p of state.pairs) if (!pairs.has(p.id)) pairs.set(p.id, p);
  // Daftar entry terbit: tanpa yang mundur, cedera/pensiun, dan atlet AI yang terlalu lelah (mundur tanpa penalti).
  const released = releasedIds(state);
  const fromList = new Map(events.filter((e) => state.entryLists?.[`${year}:${e.id}`]).map((e) => {
    const out = state.withdrawn?.[`${year}:${e.id}`] ?? [];
    const list = state.entryLists![`${year}:${e.id}`];
    return [e.id, new Map(DISCIPLINES.map((d) => [d, (list[d] ?? []).filter((c) => {
      const ids = pairs.get(c.id)?.playerIds ?? [c.id];
      const ps = ids.map((id) => players.get(id));
      if (out.includes(c.id) || ps.some((p) => !p || p.injury || p.retired !== undefined)) return false;
      return isManaged(state, released, { countryId: c.countryId, playerIds: ids }) || !!state.commitments[c.id]?.includes(e.id) // wajib: tetap main
        || Math.max(...ps.map((p) => p!.fatigue)) <= rs.ai.restAbove;
    })]))] as const;
  }));
  const unlisted = events.filter((e) => !fromList.has(e.id));
  // Turnamen tanpa batas entry (WTF, Olimpiade, multi-event): peserta ditetapkan sekarang. Junior lebih dulu.
  const juniorRanks = new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.juniorResults, d, cutoff, rs))]));
  const junior = juniorEntries(state, unlisted.filter(isJunior), rs, world, juniorRanks, state.manualEntries[weekKey(state.date)] ?? {}, rng);
  state.pairs.push(...junior.created);
  for (const p of junior.created) pairs.set(p.id, p);
  for (const byD of fromList.values()) for (const list of byD.values()) for (const c of list) (pairs.get(c.id)?.playerIds ?? [c.id]).forEach((id) => junior.busy.add(id));
  // Minggu beregu junior (Suhandinata Cup): semua junior disiapkan untuk timnya, tidak didaftarkan otomatis ke turnamen senior.
  if (teamEvents.some((e) => e.formats?.some(isJuniorFormat)))
    for (const p of state.players) if (isJuniorAge(p, state.date)) junior.busy.add(p.id);
  const entries = chooseEntries(state, unlisted.filter((e) => !isJunior(e)), rs, rng, ranks, junior.busy, world);
  for (const [id, byD] of junior.entries) entries.set(id, byD);
  for (const [id, byD] of fromList) entries.set(id, byD);

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
    for (const id of home) { const p = players.get(id); if (p?.countryId === city.countryId) bumpForm(p, HOME_BONUS + (hasTrait(p, 'homeHero') ? HOME_HERO_BONUS : 0)); }
    const wildcards = tier.wildcardTop ? tournamentWildcards(tier, ds.map((d) => [d, entries.get(event.id)!.get(d)!]), city.countryId) : undefined;
    const runs = await each(gated, ds, (d) => {
      let candidates = entries.get(event.id)!.get(d)!;
      if (tier.countryQuota) candidates = applyCountryQuota(candidates, tier.countryQuota);
      const sim = simPlay({ players, pairs, cfg: rs.match, rng, tournamentId: event.id, year, discipline: d, matches: state.matches, live: h.live, hot: hotFormOf(state), big: tier.grade === 1 || tier.points[0] >= 9000 });
      const play = gate ? gate.wrap(d, sim) : sim;
      // Catatan sementara sejak undian: halaman turnamen bisa dibuka selagi turnamen dimainkan.
      const onRecord = (rec: EventRecord) => {
        state.eventRecords = state.eventRecords.filter((r) => !(r.tournamentId === event.id && r.year === year && r.discipline === d));
        state.eventRecords.push(rec);
      };
      return runEvent({ tournament: event, discipline: d, year, hostCountryId: city.countryId, candidates, wildcardIds: wildcards && (wildcards.get(d) ?? []), ruleset: rs, rng, play, onDraw: draw, onEntries: onEntries(d), parallel: gated, onRecord });
    });
    // Target babak atlet negara manajer: manual bila diatur, selain itu otomatis (saran realistis menurut perkiraan peserta).
    const manual = state.targets?.[`${year}:${event.id}`] ?? {};
    const released = releasedIds(state);
    const mineIn = (d: Discipline) => entries.get(event.id)!.get(d)!
      .filter((c) => isManaged(state, released, { countryId: c.countryId, playerIds: pairs.get(c.id)?.playerIds ?? [c.id] }));
    const mine = ds.flatMap((d) => mineIn(d).map((c) => ({ id: c.id, d, playerIds: pairs.get(c.id)?.playerIds ?? [c.id] })));
    const auto = tier.junior ? suggestJuniorTargets(state, rs, world, event.id, mine) : suggestTargets(state, rs, world, event.id, mine);
    ds.forEach((d, i) => {
      const run = runs[i];
      (tier.junior ? state.juniorResults : state.results).push(...knockoutResults(run.main, run.slots, event, tier, d, state.date, rs));
      const rec = toRecord(event.id, year, d, run);
      const live = state.eventRecords.find((r) => r.tournamentId === event.id && r.year === year && r.discipline === d);
      if (live) Object.assign(live, rec); else state.eventRecords.push(rec);
      awardPrizes(state, event, tier, d, run.main.reached, pairs);
      // Target: tercapai → morale naik, meleset ≥ 2 babak → turun.
      for (const { id } of mineIn(d)) {
        const target = manual[id] ?? auto.get(id);
        if (!target || target === 'none') continue;
        const reached = run.main.reached.get(id) as Round | undefined;
        const res = hitTarget(reached, target);
        (state.targetLog ??= []).push({ year, eventId: event.id, discipline: d, id, target, reached, res, ...(manual[id] === undefined && { auto: true as const }) });
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
  // Akhir minggu: batas entry tiba → daftar entry terbit; entry negara manajer yang belum di-submit diisi AI.
  // ponytail: kondisi atlet ditukar sementara ke kondisi awal minggu, agar cedera/lelah minggu ini tidak memengaruhi entry.
  const now = new Map(state.players.map((p) => [p, { fatigue: p.fatigue, injury: p.injury }]));
  for (const [p, c] of atDeadline) Object.assign(p, c);
  publishEntries(state, rs, world, rng);
  for (const [p, c] of now) Object.assign(p, c);
  updateMorale(state, rs, weekMatches, weekChampions, ranks);
  updateReadiness(state, rs); // junior Pratama yang baru siap promosi (berita minggu depan)
  // Istirahat: atlet yang tidak bertanding minggu ini memulihkan morale negatif lebih cepat.
  const busy = new Set(state.matches.slice(weekMatches).flatMap((m) => m.sides.flatMap((s) => pairs.get(s)?.playerIds ?? [s])));
  for (const p of state.players) if (p.form < 0 && !busy.has(p.id)) p.form *= REST_RECOVERY;

  // Top Committed: absen dari turnamen wajib minggu ini = pelanggaran (cedera dikecualikan mulai Fase 7).
  for (const event of events)
    for (const d of DISCIPLINES) {
      const inEvent = new Set(entries.get(event.id)!.get(d)!.map((c) => c.id));
      for (const e of entrantsFor(state, d))
        if (state.commitments[e.id]?.includes(event.id) && !inEvent.has(e.id) && !e.playerIds.some((id) => players.get(id)!.injury)
          // Daftar entry terbit: atlet wajib selalu didaftarkan kecuali cedera saat batas entry → hanya keputusan manajer
          // (istirahat / turnamen lain di form entry, atau mundur) yang melanggar.
          && (!fromList.has(event.id) || (isManaged(state, released, e) && (!!state.withdrawn?.[`${year}:${event.id}`]?.includes(e.id)
            || ![undefined, event.id].includes(state.manualEntries[weekKey(state.date)]?.[e.id]))))) {
          state.violations.push({ entrantId: e.id, countryId: e.countryId, tournamentId: event.id, year });
          if (state.career && e.countryId === state.career.countryId && !e.playerIds.some((id) => players.get(id)!.released !== undefined))
            state.career.reputation = Math.max(0, state.career.reputation - rs.career.violationPenalty);
        }
    }

  if (week % 4 === 0)
    for (const d of DISCIPLINES)
      state.rankSnapshots.push({ absWeek: absWeek(state.date), discipline: d, ids: computeRanking(state.results, d, absWeek(state.date), rs).slice(0, 300).map((r) => r.entrantId) });

  updateAwards(state, rs, rng);
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
      // ASUMSI: naik makin lambat mendekati 100; sifat ganda mengubah lajunya (maks 5 %/laga).
      if (pair) { pair.matchesTogether++; pair.chemistry += (100 - pair.chemistry) * Math.min(0.05, 0.01 * chemistryMult(pair.playerIds.map((x) => players.get(x)!))); }
      // Kalah tipis dari lawan yang jauh lebih kuat: pengalaman lebih besar dari kalah biasa.
      const ab = (s: string) => { const ids = pairs.get(s)?.playerIds ?? [s]; return ids.reduce((t, x) => t + currentAbility(players.get(x)!.attrs), 0) / ids.length; };
      const close = m.winner !== i && !m.walkover && ab(m.sides[1 - i]) - ab(side) >= CLOSE_LOSS_GAP && isCloseLoss(m.scores, i as 0 | 1);
      for (const id of pair?.playerIds ?? [side]) {
        players.get(id)!.fatigue += rs.fatigue.perMatch;
        state.experience[id] = (state.experience[id] ?? 0) + (m.winner === i ? 1.5 : close ? CLOSE_LOSS_EXP : 1) * (big ? 1.3 : 1);
        played.add(id);
      }
    });
  // Cedera: peluang per laga naik tajam bila lelah. (ASUMSI: atlet menyelesaikan turnamen, absen mulai minggu depan)
  const inj = rs.injury;
  for (const m of state.matches.slice(firstMatch))
    for (const side of m.sides)
      for (const id of pairs.get(side)?.playerIds ?? [side]) {
        const p = players.get(id)!;
        if (p.injury || rng() >= (inj.base + inj.fatigueFactor * (p.fatigue / 100) ** 2) * injuryMult(p)) continue;
        let r = rollInjury(inj, rng);
        if (hasTrait(p, 'injuryProne')) { // rawan cedera: tingkat = yang terburuk dari dua undian
          const r2 = rollInjury(inj, rng), lvl = (x: typeof r) => inj.levels.findIndex((l) => l.id === x.injury.level);
          if (lvl(r2) > lvl(r)) r = r2;
        }
        p.injury = r.injury;
        (p.injuryHistory ??= []).push({ ...state.date, level: r.injury.level, type: r.injury.type, weeks: r.injury.weeksLeft });
        if (r.injury.weeksLeft >= PR_MIN_WEEKS && !r.retire) protectRanking(state, rs, p.id);
        if (r.paLoss) applySevereInjury(p, rs.development, rng, r.paLoss);
        if (r.retire) { // cedera parah: langsung pensiun, pasangannya bubar
          p.retired = state.date.year;
          for (const pair of state.pairs) if (!pair.dissolved && pair.playerIds.includes(p.id)) pair.dissolved = { ...state.date };
        }
      }
  for (const id of played) {
    const p = players.get(id)!;
    const from = p.location && cities.get(p.location);
    if (from) p.fatigue += (distanceKm(from, city) / 1000) * rs.fatigue.per1000Km * (hasTrait(p, 'traveler') ? TRAVELER_FATIGUE : 1);
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
        // Skuad dinominasikan sebelum batas entry (form entry); sesudahnya terkunci. Tanpa nominasi: saran otomatis.
        // Atlet yang cedera sejak nominasi diganti saran otomatis (skuad tidak lagi valid).
        squad = (state.entriesSubmitted?.[`${year}:${ev.id}`] === true ? valid(state.teamSquads[format], pool) : undefined) ?? suggested;
        state.teamSquads[format] = squad;
      }
      squads[c] = squad;
      pools.set(c, squadPool(pool, squad));
      // Dipanggil ke skuad: morale naik (pemimpin di skuad mengangkat rekannya); negara manajer: atlet layak yang dicoret sedikit turun.
      const chosen = squad.map((id) => players.get(id)!);
      const leader = chosen.some((p) => hasTrait(p, 'leader'));
      for (const p of chosen) bumpForm(p, SELECT_BONUS + (leader && !hasTrait(p, 'leader') ? LEADER_SQUAD : 0));
      if (c === state.managedCountryId) {
        const pos = new Map<string, number>(); // posisi terbaik di daftar pool (sudah urut ranking per nomor)
        for (const list of Object.values(pool)) list.forEach((e, i) => { for (const id of e.playerIds) pos.set(id, Math.min(pos.get(id) ?? 9999, i)); });
        for (const p of snubbed(chosen, [...pos.keys()].map((id) => players.get(id)!), (x) => pos.get(x.id) ?? 9999)) bumpForm(p, -SNUB_PENALTY);
      }
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
      const seq = playOrder(format, order, lineups, (id) => pairs.get(id)?.playerIds ?? [id], rng);
      const r = await playTie(lineups, order, round, playOf, round === 'G', seq);
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
    for (const r of ranked) {
      // Ranking terbaik karier (≤ 100): bonus kecil bila lebih baik dari semua peringkat yang pernah tercatat (entrant baru tidak).
      const prev = byId[r.entrantId];
      if (prev && r.rank <= RANK_WEEKS_TOP && r.rank < Math.min(9999, ...Object.keys(prev.at).map(Number)))
        for (const id of state.pairs.find((x) => x.id === r.entrantId)?.playerIds ?? [r.entrantId]) { const p = state.players.find((x) => x.id === id); if (p) bumpForm(p, CAREER_HIGH_BONUS); }
      addRankWeeks(byId, r.entrantId, r.rank, 1); seen.add(r.entrantId);
    }
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

export function rankFromSnapshots(state: SeasonState, entrantId: string, d: Discipline, rs: Ruleset) {
  const out: { absWeek: number; rank?: number }[] = state.rankSnapshots.filter((s) => s.discipline === d).map((s) => {
    const i = s.ids.indexOf(entrantId);
    return { absWeek: s.absWeek, rank: i === -1 ? undefined : i + 1 };
  });
  // Titik terakhir = peringkat minggu ini (snapshot hanya tiap 4 minggu), agar grafik sama dengan kotak World ranking.
  const now = absWeek(state.date);
  if (out.length && out[out.length - 1].absWeek < now) {
    const r = computeRanking(state.results, d, now, rs).findIndex((x) => x.entrantId === entrantId);
    out.push({ absWeek: now, rank: r === -1 || r >= 300 ? undefined : r + 1 });
  }
  return out;
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
  const ctx = { date: state.date, experience: new Map(Object.entries(state.experience)), doublesPlayers: doublesPlayers(state, rs),
    elite: eliteCounts(state, rs), mentored: mentorsOf(state, state.date),
    heldBack: new Set(state.players.filter((p) => isHeldBack(p, state.date)).map((p) => p.id)) };
  for (const p of state.players) if (p.retired === undefined) developQuarter(p, rs.development, ctx, rng);
  state.experience = {};
}

/** Akhir musim: riwayat atribut, pensiun, junior baru, pasangan baru oleh AI. */
/** Peringkat terbaik tiap atlet di semua nomor (ganda: peringkat pasangannya) — spesialis ganda tidak dianggap tanpa peringkat. */
export function bestRanks(state: Pick<SeasonState, 'pairs' | 'results'>, rs: Ruleset, now: number) {
  const rank = new Map<string, number>();
  const members = new Map(state.pairs.map((p) => [p.id, p.playerIds]));
  for (const d of DISCIPLINES) for (const r of computeRanking(state.results, d, now, rs))
    for (const id of members.get(r.entrantId) ?? [r.entrantId]) rank.set(id, Math.min(rank.get(id) ?? Infinity, r.rank));
  return rank;
}

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
  const rank = bestRanks(state, rs, now);
  for (const p of state.players) {
    if (p.retired !== undefined) continue;
    p.attrHistory.push({ year, attrs: { ...p.attrs } });
    if (rng() < retirementChance(p, rs.development, state.date, rank.get(p.id))) p.retired = year;
    else if (p.released !== undefined && (rank.get(p.id) ?? Infinity) > INDEPENDENT_TOP && rng() < INDEPENDENT_QUIT) p.retired = year;
  }
  const retired = new Set(state.players.filter((p) => p.retired !== undefined).map((p) => p.id));
  for (const pair of state.pairs)
    if (!pair.dissolved && pair.playerIds.some((id) => retired.has(id))) pair.dissolved = { ...state.date };
  releaseAthletes(state, rng);
  const next = { year: year + 1, week: 1 };
  if (state.scouting) recruit(state, []); // pencarian musim lalu belum diputuskan: isi otomatis
  const usedNames = new Set(state.players.map((p) => p.name)); // nama junior baru tidak kembar dengan atlet yang ada
  for (const c of world.countries) {
    const cities = world.cities.filter((x) => x.countryId === c.id);
    const juniors = newJuniors(c, rs.development, rs.generator, next, rng, usedNames, cities);
    // Negara manajer: junior baru dipilih dari kandidat (pencarian bakat), bukan langsung masuk.
    if (c.id === state.managedCountryId) state.scouting = makeScouting(juniors, c, rs.generator, next, rng, usedNames, cities, state.scoutFocus ?? 'balanced');
    else state.players.push(...juniors);
  }
  ensureTraits(state.players);
  if (state.scouting) ensureTraits(state.scouting.candidates);
  formPairs(state, rs, world, rng);
  pairIndependents(state, rs, world, rng);
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
    // Negara manajer: pasangan pelatnas dibentuk manajer. Atlet yang keluar pelatnas (semua negara): `pairIndependents`.
    if (c.id === state.managedCountryId) continue;
    const member = (p: Player) => p.countryId === c.id && p.released === undefined;
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
