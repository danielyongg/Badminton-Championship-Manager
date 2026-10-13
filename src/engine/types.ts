// Semua tipe data game. Angka regulasi BWF TIDAK ditulis di kode — semuanya ada di Ruleset (JSON).
import type { TextKey } from '../i18n';

export type Discipline = 'MS' | 'WS' | 'MD' | 'WD' | 'XD';
export const DISCIPLINES: Discipline[] = ['MS', 'WS', 'MD', 'WD', 'XD'];
export const isDoubles = (d: Discipline) => d === 'MD' || d === 'WD' || d === 'XD';

/** Babak, urut dari juara ke R256. Tabel poin & hadiah di Ruleset memakai urutan ini. */
export const ROUNDS = ['W', 'F', 'SF', 'QF', 'R16', 'R32', 'R64', 'R128', 'R256'] as const;
export type Round = (typeof ROUNDS)[number];
/** Angka per babak, sejajar dengan ROUNDS (9 kolom). */
export type RoundTable = number[];

export type TierId = string; // 'WC','OG','WTF','S1000','S750','S500','S300','S100','IC','IS','FS'

export interface GroupStage {
  groups: number;
  perGroup: number;
  advance: number; // jumlah lolos per grup ke babak gugur
}

export interface Tier {
  id: TierId;
  name: string;
  grade: 1 | 2 | 3;
  points: RoundTable;
  /** Poin bonus jika hadiah turnamen melebihi hadiah standar tier minimal minExtraPrizeUsd (dipakai Super 1000). */
  bonusPoints?: { minExtraPrizeUsd: number; points: RoundTable }[];
  prizeUsd: number; // default; tiap turnamen bisa punya nilai sendiri
  /** Persentase total hadiah per pemain/pasangan per babak (sejajar ROUNDS). */
  prizeSplit: { singles: RoundTable; doubles: RoundTable };
  drawSize: Record<Discipline, number>;
  /** Jumlah peserta kualifikasi per 1 slot qualifier (4 = 2 babak kualifikasi). 0 = tanpa kualifikasi. */
  qualifyingPerSlot: number;
  groupStage?: Partial<Record<Discipline, GroupStage>>; // nomor yang tidak disebut = knockout murni
  wildcards: number;
  zeroPointsForR1WildcardLoss: boolean;
  /** Kuota per negara (Kejuaraan Dunia/Olimpiade): `base`, atau s/d `max` bila semua di top `topRank`. */
  countryQuota?: { base: number; max: number; topRank: number };
}

export interface TournamentDef {
  id: string;
  name: string;
  cityId: string;
  week: number; // minggu ke- (1–52) dalam musim
  tierId: TierId;
  prizeUsd: number;
  /** Hanya digelar bila tahun % interval === offset (invert: kebalikannya). Olimpiade: {4,0}; Kejuaraan Dunia: {4,0,invert}. */
  everyYears?: { interval: number; offset: number; invert?: boolean };
}

export interface AgeBand {
  maxAge: number; // berlaku untuk usia <= maxAge (band pertama yang cocok)
  min: number;
  max: number;
}

export interface Ruleset {
  id: string;
  name: string;
  startYear: number; // tahun musim pertama permainan baru
  tiers: Tier[];
  calendar: TournamentDef[];
  ranking: { windowWeeks: number; bestOf: number; entryCutoffWeeks: number };
  race: { bestOf: number; tiers: TierId[]; maxFromTier: Record<TierId, number> };
  /** Urut dari minEntries terbesar. 64→16, 32→8, 16→4, 0→2 */
  seeding: { minEntries: number; seeds: number }[];
  /** 1 slot kualifikasi per N slot main draw, per grade. */
  qualifierRatio: Record<'1' | '2' | '3', number>;
  wtf: { qualifiers: number; maxPerCountry: number; worldChampAuto: boolean };
  topCommitted: { singles: number; doubles: number; mustPlay: Record<TierId, number | 'all'> };
  generator: GeneratorConfig;
  match: MatchConfig;
  fatigue: FatigueConfig;
  ai: AiConfig;
  development: DevelopmentConfig;
  injury: InjuryConfig;
  career: CareerConfig;
  team: TeamConfig;
}

/** Beregu: Thomas Cup (putra), Uber Cup (putri), Sudirman Cup (campuran). */
export type TeamFormat = 'thomas' | 'uber' | 'sudirman';
export const TEAM_FORMATS: TeamFormat[] = ['thomas', 'uber', 'sudirman'];

export interface TeamEventDef {
  id: string;
  name: string;
  /** Nama resmi di tahun Sudirman Cup (beregu campuran), bila berbeda dari `name` (tahun Thomas & Uber). */
  nameMixed?: string;
  cityId: string;
  week: number;
  /** Putaran final: format yang dimainkan. Kejuaraan kontinental (ada `confederation`): ikut format final tahun itu. */
  formats?: TeamFormat[];
  confederation?: Confederation;
  /** Kejuaraan kontinental: jumlah tim teratas yang lolos ke putaran final (bawaan 1 = juara). */
  qualifiers?: number;
  everyYears?: TournamentDef['everyYears'];
}

export interface TeamConfig {
  events: TeamEventDef[];
  /** Urutan partai dalam satu pertandingan beregu. */
  order: Record<TeamFormat, Discipline[]>;
  maxMatchesPerPlayer: number;
  /** Jumlah atlet skuad yang didaftarkan per tim. */
  squadSize: Record<TeamFormat, { min: number; max: number }>;
  finals: { teams: number; groups: GroupStage };
  /** Tim terkuat per konfederasi yang ikut kejuaraan kontinental (sistem gugur berunggulan). */
  continentalTeams: number;
}

export interface InjuryConfig {
  /** Peluang cedera per laga per atlet = base + fatigueFactor × (kelelahan/100)². */
  base: number;
  fatigueFactor: number;
  severeChance: number;
  minorWeeks: { min: number; max: number };
  severeWeeks: { min: number; max: number };
}

export interface CareerConfig {
  /** Tier yang dihitung sebagai "gelar" untuk target federasi. */
  titleTiers: TierId[];
  violationPenalty: number; // reputasi per pelanggaran Top Committed
  gradeReputation: Record<string, number>; // A..E → perubahan reputasi akhir musim
}
export interface DevelopmentConfig {
  /** Bagian selisih PA − CA yang tertutup per tahun, menurut usia. */
  growthByAge: AgeBand[];
  randomFactor: { min: number; max: number };
  /** Faktor pengalaman = base + perMatch × laga berbobot kuartal ini (maks max). Berlaku s/d usia experienceUntilAge. */
  experience: { base: number; perMatch: number; max: number; untilAge: number };
  /** Penurunan per tahun (poin, atribut berbobot 1), menurut usia. */
  declineByAge: AgeBand[];
  /** Per atribut: bobot penurunan & berapa tahun lebih lambat mulai turun. */
  attrDecline: Record<Attr, { weight: number; startOffset: number }>;
  mentalGrowth: { perYear: number; untilAge: number };
  doublesPeakDelay: number; // tahun
  lateBloomer: { ageShift: number; youngFactor: number };
  stagnantFactor: number;
  /** Peluang pensiun per tahun menurut usia (band pertama yang cocok). */
  retirementByAge: AgeBand[];
  retireAlwaysAt: number;
  /** Atlet yang kemampuannya rendah di usia ini ke atas juga bisa berhenti. */
  lowAbilityRetire: { fromAge: number; belowCa: number; chance: number };
  /** Jumlah junior baru per gender per negara per musim = min + tradisi/100 × (max − min) (dibulatkan acak). */
  juniorsPerSeason: { min: number; max: number };
  severeInjuryPaLoss: { min: number; max: number };
}
export interface FatigueConfig {
  perMatch: number;
  per1000Km: number;
  recoveryPerWeek: number;
}

export interface AiConfig {
  /** Rentang peringkat yang membuat AI mau mendaftar ke tier ini [min, max]. */
  rankRange: Record<TierId, [number, number]>;
  /** Peluang ikut bila memenuhi syarat (sebelum dikurangi kelelahan). */
  playProb: Record<TierId, number>;
  /** Kelelahan di atas nilai ini → istirahat (kecuali turnamen wajib). */
  restAbove: number;
}

export interface MatchConfig {
  pointsToWin: number; // 21
  cap: number; // 30
  gamesToWin: number; // 2 (best of 3)
  intervalAt: number; // 11
  /** Makin kecil, makin menentukan selisih atribut (skala fungsi logistik). */
  duelScale: number;
  /** Bobot kemampuan umum vs atribut duel per rally. */
  overallWeight: number;
  energy: {
    costPerRally: number; // energi hilang per rally untuk stamina 50
    staminaRelief: number; // 0–1: seberapa besar stamina mengurangi biaya
    intervalRecovery: number;
    gameRecovery: number;
    /** Energi 0 → atribut fisik turun sebesar persentase ini. */
    effect: number;
    fatigueToStart: number; // energi awal = 100 − kelelahan × faktor ini
  };
  warmup: { points: number; maxPenalty: number }; // poin awal game 1 yang terpengaruh pemanasan
  pressure: { fromScore: number; weight: number }; // poin kritis: Mental lebih menentukan
  chemistryWeight: number; // ganda: bonus/penalti per poin chemistry di atas/bawah 50
  serviceEvent: { base: number; perMissingServe: number }; // peluang poin servis per rally
  /** Momentum (−1..1) bergeser tiap poin; sisi yang sedang unggul momentum mendapat bonus duel kecil. */
  momentum: { decay: number; weight: number };
  strategies: Record<Strategy, StrategyEffect>;
}

export const STRATEGIES = ['balanced', 'attacking', 'defensive', 'fast', 'deceptive'] as const;
export type Strategy = (typeof STRATEGIES)[number];
export type PatternKind = 'smash' | 'net' | 'deception' | 'rally';

export interface StrategyEffect {
  weight: Record<PatternKind, number>; // pengali peluang pola yang dimulai sisi ini
  attack: Partial<Record<PatternKind, number>>; // bonus poin atribut saat menyerang dengan pola ini
  defend: number; // bonus poin atribut saat bertahan
  error: number; // tambahan peluang unforced error
  energy: number; // pengali biaya energi
}

export interface GeneratorConfig {
  /** Jumlah atlet senior per gender = min + tradisi/100 × (max − min). */
  seniorsPerGender: { min: number; max: number };
  juniorsPerGender: { min: number; max: number };
  pairsPerDiscipline: { min: number; max: number };
  seniorAge: { min: number; max: number };
  juniorAge: { min: number; max: number };
  /** Rata-rata PA = base + tradisi × perTradition; simpangan baku = sd. */
  potential: { base: number; perTradition: number; sd: number };
  lateBloomerChance: number;
  stagnantChance: number;
}

export const ATTRS = [
  'speed', 'stamina', 'serve', 'warmup', 'consistency',
  'net', 'defense', 'smash', 'deception', 'mental',
] as const;
export type Attr = (typeof ATTRS)[number];
export type Attrs = Record<Attr, number>;

export interface GameDate {
  year: number;
  week: number;
}

export interface Player {
  id: string;
  name: string;
  countryId: string;
  gender: 'M' | 'F';
  hand: 'L' | 'R';
  birth: GameDate;
  attrs: Attrs;
  pa: number; // potensi tersembunyi 1–100
  form: number; // -10..+10
  fatigue: number; // 0..100
  injury?: { weeksLeft: number; severe: boolean };
  trait?: 'late' | 'stagnant';
  /** Spesialis ganda: tidak diberi ranking tunggal awal & tidak didaftarkan AI di nomor tunggal (manajer tetap boleh). */
  focus?: 'D';
  /** Junior (U19) yang sudah dipromosikan ke pelatnas utama: ikut didaftarkan otomatis ke turnamen senior. */
  promoted?: boolean;
  retired?: number; // tahun pensiun
  location?: string; // cityId terakhir (untuk jarak perjalanan)
  caDelta?: number; // perubahan CA pada pemrosesan kuartal terakhir (panah naik/turun)
  attrHistory: { year: number; attrs: Attrs }[];
}

export interface Pair {
  id: string;
  discipline: 'MD' | 'WD' | 'XD';
  playerIds: [string, string];
  chemistry: number; // 0..100
  matchesTogether: number;
  formed: GameDate;
  dissolved?: GameDate;
  /** Pasangan percobaan: aktif bersama pasangan utama, hanya ikut turnamen bila didaftarkan manual. */
  trial?: boolean;
  /** Pasangan dadakan khusus beregu (dibentuk dari line-up): tidak punya ranking & tidak ikut turnamen individu. */
  adHoc?: boolean;
}

/** playerId (tunggal) atau pairId (ganda) */
export type EntrantId = string;

export type Confederation = 'BA' | 'BE' | 'BAM' | 'BCA' | 'BO';
export type NamePool =
  | 'id' | 'cn' | 'jp' | 'kr' | 'th' | 'my' | 'in' | 'vn' | 'nordic'
  | 'en' | 'fr' | 'de' | 'es' | 'generic';

export interface Country {
  id: string; // kode 3 huruf, mis. 'INA'
  name: string;
  confederation: Confederation;
  traditionStrength: number; // 1–100
  namePool: NamePool;
}

export interface City {
  id: string;
  countryId: string;
  name: string;
  venue: string;
  lat: number;
  lon: number;
}

export interface World {
  countries: Country[];
  cities: City[];
}

export interface DrawSlot {
  pos: number;
  entrant?: EntrantId;
  seed?: number;
  bye?: boolean;
  qualifier?: boolean;
  wildcard?: boolean;
}

/** Satu langkah undian. Teks dibentuk saat ditampilkan: t(key, vars) (ikut bahasa terpilih). */
export interface DrawStep {
  key: TextKey;
  vars: Record<string, string | number>; // `e` = id peserta (diganti nama saat ditampilkan)
  pos?: number;
  entrant?: EntrantId;
}

export interface Draw {
  tournamentId: string;
  year: number;
  discipline: Discipline;
  slots: DrawSlot[];
  steps: DrawStep[];
  groups?: EntrantId[][];
  matchIds: string[];
}

export type PointType = 'smash' | 'net' | 'clear' | 'drop' | 'error' | 'service';

export interface Match {
  id: string;
  tournamentId: string;
  year: number;
  discipline: Discipline;
  round: Round | 'Q1' | 'Q2' | 'Q3' | 'G';
  sides: [EntrantId, EntrantId];
  scores: [number, number][];
  winner: 0 | 1;
  walkover?: boolean;
  retired?: boolean;
  stats?: Record<PointType, [number, number]>; // dibuang untuk musim > 2 tahun lalu (hemat ukuran save)
}

/** Satu hasil turnamen yang memberi poin ranking. */
export interface RankingEntry {
  entrantId: EntrantId;
  discipline: Discipline;
  tournamentId: string;
  tierId: TierId;
  year: number;
  week: number;
  points: number;
  expiresAbsWeek: number;
}

export interface RankingRow {
  rank: number;
  entrantId: EntrantId;
  points: number;
  tournamentsPlayed: number;
}

export interface FederationGoal {
  kind: 'titles' | 'top10' | 'team';
  /** Target beregu: tingkat hasil 0–5 (lihat `teamLevel`), satu per format. */
  format?: TeamFormat;
  target: number;
  achieved?: number;
}

export interface SeasonReport {
  year: number;
  countryId: string;
  goals: FederationGoal[];
  violations: number;
  grade: string;
  reputationChange: number;
}

/** Data karier manajer (null countryId = Mode Pengamat). */
export interface Career {
  countryId: string | null;
  goals: FederationGoal[];
  reports: SeasonReport[];
  reputation: number; // 0–100
}

/** Ringkasan slot save (daftar Load). Isi lengkap disimpan terpisah. */
export interface SaveMeta {
  id: string;
  name: string;
  countryId: string | null;
  rulesetName: string;
  date: GameDate;
  createdAt: number;
  updatedAt: number;
}
