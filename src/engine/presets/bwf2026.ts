import type { Discipline, GroupStage, Ruleset, Tier, TournamentDef } from '../types';

// Preset "BWF 2026" (default). Semua angka di sini = data yang bisa diedit di Editor.
// Kolom tabel poin & hadiah: Juara, Final, SF, QF, R16, R32, R64, R128, R256.

/** draws(MS) = semua nomor sama; draws(MS, lain) = MS beda, nomor lain sama. */
const draws = (MS: number, rest = MS): Record<Discipline, number> => ({ MS, WS: rest, MD: rest, WD: rest, XD: rest });
const allGroups = (g: GroupStage) => ({ MS: g, WS: g, MD: g, WD: g, XD: g });

// ASUMSI: persentase hadiah per pemain/pasangan mengikuti pola BWF yang umum dipublikasikan
// (tunggal 7.5/3.8/1.45/0.8/0.35, ganda 7.9/3.8/1.4/0.725/0.375); R32 ke bawah 0.
const PRIZE_SPLIT = {
  singles: [7.5, 3.8, 1.45, 0.8, 0.35, 0, 0, 0, 0],
  doubles: [7.9, 3.8, 1.4, 0.725, 0.375, 0, 0, 0, 0],
};
const NO_PRIZE = { singles: [0, 0, 0, 0, 0, 0, 0, 0, 0], doubles: [0, 0, 0, 0, 0, 0, 0, 0, 0] };

export const TIERS_2026: Tier[] = [
  {
    id: 'OG', name: 'Olimpiade', grade: 1,
    points: [14500, 12500, 10500, 8200, 6000, 3700, 1450, 750, 300],
    prizeUsd: 0, prizeSplit: NO_PRIZE,
    // ASUMSI: tunggal 16 grup × 3 (juara grup ke R16); ganda 4 grup × 4 (2 teratas ke QF).
    drawSize: { MS: 48, WS: 48, MD: 16, WD: 16, XD: 16 },
    countryQuota: { base: 1, max: 2, topRank: 16 }, // ASUMSI: disederhanakan
    groupStage: {
      MS: { groups: 16, perGroup: 3, advance: 1 }, WS: { groups: 16, perGroup: 3, advance: 1 },
      MD: { groups: 4, perGroup: 4, advance: 2 }, WD: { groups: 4, perGroup: 4, advance: 2 }, XD: { groups: 4, perGroup: 4, advance: 2 },
    },
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'WC', name: 'Kejuaraan Dunia', grade: 1,
    points: [14500, 12500, 10500, 8200, 6000, 3700, 1450, 750, 300],
    prizeUsd: 0, prizeSplit: NO_PRIZE,
    drawSize: draws(64, 48),
    countryQuota: { base: 2, max: 4, topRank: 8 }, // ASUMSI: maks 2 per negara, s/d 4 bila semuanya top 8
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'WTF', name: 'World Tour Finals', grade: 1,
    points: [14000, 12000, 10000, 7800, 5700, 3500, 1400, 720, 280],
    prizeUsd: 2500000, prizeSplit: PRIZE_SPLIT, // ASUMSI: pembagian hadiah WTF memakai pola umum
    drawSize: draws(8),
    groupStage: allGroups({ groups: 2, perGroup: 4, advance: 2 }),
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'S1000', name: 'Super 1000', grade: 2,
    points: [12000, 10200, 8400, 6600, 4800, 3000, 1200, 600, 240],
    bonusPoints: [
      { minExtraPrizeUsd: 500000, points: [13500, 11500, 9500, 7400, 5400, 3300, 1350, 670, 270] },
      { minExtraPrizeUsd: 250000, points: [12700, 10800, 9000, 7000, 5100, 3150, 1270, 630, 250] },
    ],
    prizeUsd: 1450000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 0, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'S750', name: 'Super 750', grade: 2,
    points: [11000, 9350, 7700, 6050, 4320, 2660, 1060, 520, 210],
    prizeUsd: 950000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 0, wildcards: 1, zeroPointsForR1WildcardLoss: true,
  },
  {
    id: 'S500', name: 'Super 500', grade: 2,
    points: [9200, 7800, 6420, 5040, 3600, 2220, 880, 430, 170],
    prizeUsd: 475000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: true,
  },
  {
    id: 'S300', name: 'Super 300', grade: 2,
    points: [7000, 5950, 4900, 3850, 2750, 1670, 660, 320, 130],
    prizeUsd: 250000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'S100', name: 'Super 100', grade: 2,
    points: [5500, 4680, 3850, 3030, 2110, 1290, 510, 240, 100],
    prizeUsd: 110000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(48, 32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'IC', name: 'International Challenge', grade: 3,
    points: [4000, 3400, 2800, 2200, 1520, 920, 360, 170, 70],
    prizeUsd: 20000, prizeSplit: PRIZE_SPLIT, // ASUMSI: nilai hadiah tipikal
    drawSize: draws(64, 32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'IS', name: 'International Series', grade: 3,
    points: [2500, 2130, 1750, 1370, 920, 550, 210, 100, 40],
    prizeUsd: 8000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  {
    id: 'FS', name: 'Future Series', grade: 3,
    points: [1700, 1420, 1170, 920, 600, 350, 130, 60, 20],
    prizeUsd: 5000, prizeSplit: PRIZE_SPLIT,
    drawSize: draws(32), qualifyingPerSlot: 4, wildcards: 1, zeroPointsForR1WildcardLoss: false,
  },
  // ASUMSI: turnamen junior U19 — tanpa hadiah & tanpa poin senior; poin ranking junior disederhanakan.
  {
    id: 'WJC', name: 'Kejuaraan Dunia Junior', grade: 2,
    points: [10000, 8500, 7000, 5500, 4000, 2500, 1000, 500, 0],
    prizeUsd: 0, prizeSplit: NO_PRIZE,
    drawSize: { MS: 128, WS: 128, MD: 64, WD: 64, XD: 64 },
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
    junior: { quota: { singles: 3, doubles: 2 } },
  },
  {
    id: 'JC', name: 'Kejuaraan Junior Kontinental', grade: 3,
    points: [7000, 5950, 4900, 3850, 2800, 1750, 700, 350, 0],
    prizeUsd: 0, prizeSplit: NO_PRIZE,
    drawSize: { MS: 64, WS: 64, MD: 32, WD: 32, XD: 32 },
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
    junior: { quota: { singles: 4, doubles: 3 } },
  },
  {
    // ASUMSI: kejuaraan junior kontinental dengan persaingan lebih ringan (Pan Am, Afrika, Oseania) → poin lebih kecil.
    id: 'JC2', name: 'Kejuaraan Junior Kontinental (kelas 2)', grade: 3,
    points: [4000, 3400, 2800, 2200, 1600, 1000, 400, 200, 0],
    prizeUsd: 0, prizeSplit: NO_PRIZE,
    drawSize: { MS: 64, WS: 64, MD: 32, WD: 32, XD: 32 },
    qualifyingPerSlot: 0, wildcards: 0, zeroPointsForR1WildcardLoss: false,
    junior: { quota: { singles: 4, doubles: 3 } },
  },
];
// ASUMSI: S1000/S750 tanpa babak kualifikasi (draw 32 diisi dari ranking); kualifikasi mulai S500.

const t = (id: string, name: string, cityId: string, week: number, tierId: string, prizeUsd: number, extra: Partial<TournamentDef> = {}): TournamentDef =>
  ({ id, name, cityId, week, tierId, prizeUsd, ...extra });

// ASUMSI: minggu & hadiah mendekati kalender HSBC BWF World Tour 2026; koreksi lewat Editor.
export const CALENDAR_2026: TournamentDef[] = [
  t('malaysia-open', 'Malaysia Open', 'kuala-lumpur', 2, 'S1000', 1450000),
  t('india-open', 'India Open', 'new-delhi', 3, 'S750', 950000),
  t('indonesia-masters', 'Indonesia Masters', 'jakarta', 4, 'S500', 475000),
  t('thailand-masters', 'Thailand Masters', 'bangkok', 5, 'S300', 250000),
  t('egypt-is', 'Egypt International', 'cairo', 6, 'IS', 8000),
  t('mauritius-fs', 'Mauritius Future Series', 'rose-hill', 8, 'FS', 5000),
  t('german-open', 'German Open', 'mulheim', 9, 'S300', 250000),
  t('all-england', 'All England Open', 'birmingham', 10, 'S1000', 1450000),
  t('swiss-open', 'Swiss Open', 'basel', 11, 'S300', 250000),
  t('ruichang-masters', 'Ruichang China Masters', 'ruichang', 12, 'S100', 110000),
  t('orleans-masters', 'Orléans Masters', 'orleans', 13, 'S300', 250000),
  t('peru-ic', 'Peru International Challenge', 'lima', 14, 'IC', 20000),
  t('lingshui-masters', 'Lingshui China Masters', 'lingshui', 15, 'S100', 110000),
  t('czech-ic', 'Czech Open', 'brno', 16, 'IC', 20000),
  t('thailand-open', 'Thailand Open', 'bangkok', 20, 'S500', 475000),
  t('malaysia-masters', 'Malaysia Masters', 'kuala-lumpur', 21, 'S500', 475000),
  t('singapore-open', 'Singapore Open', 'singapore', 22, 'S750', 950000),
  t('indonesia-open', 'Indonesia Open', 'jakarta', 23, 'S1000', 1450000),
  t('taipei-open', 'Taipei Open', 'taipei', 24, 'S300', 250000),
  t('nigeria-is', 'Nigeria International', 'lagos', 24, 'IS', 8000),
  t('australian-open', 'Australian Open', 'sydney', 25, 'S500', 475000),
  t('us-open', 'US Open', 'council-bluffs', 26, 'S300', 250000),
  t('guatemala-fs', 'Guatemala Future Series', 'guatemala-city', 26, 'FS', 5000),
  t('canada-open', 'Canada Open', 'calgary', 27, 'S300', 250000),
  t('dutch-ic', 'Dutch Open', 'almere', 28, 'IC', 20000),
  t('japan-open', 'Japan Open', 'tokyo', 29, 'S750', 950000),
  t('china-open', 'China Open', 'changzhou', 30, 'S1000', 1450000),
  t('macau-open', 'Macau Open', 'macau', 31, 'S300', 250000),
  t('south-africa-is', 'South Africa International', 'johannesburg', 31, 'IS', 8000),
  t('vietnam-open', 'Vietnam Open', 'ho-chi-minh', 32, 'S100', 110000),
  t('indonesia-masters-100', 'Indonesia Masters Super 100', 'surabaya', 33, 'S100', 110000),
  // Tuan rumah asli per tahun (`hosts`); tahun yang belum diumumkan → ASUMSI: bergilir di antara tuan rumah terdahulu (`rotation`).
  t('world-championships', 'Kejuaraan Dunia BWF', 'new-delhi', 34, 'WC', 0, { everyYears: { interval: 4, offset: 0, invert: true },
    hosts: { 2025: 'paris', 2026: 'new-delhi' }, rotation: ['tokyo', 'jakarta', 'glasgow', 'basel', 'paris'] }),
  t('olympics', 'Olimpiade', 'los-angeles', 31, 'OG', 0, { everyYears: { interval: 4, offset: 0 },
    hosts: { 2028: 'los-angeles', 2032: 'brisbane' }, rotation: ['paris', 'tokyo', 'sydney'] }),
  t('bulgarian-ic', 'Bulgarian Open', 'sofia', 35, 'IC', 20000),
  t('hong-kong-open', 'Hong Kong Open', 'hong-kong', 36, 'S500', 475000),
  t('brazil-is', 'Brazil International', 'sao-paulo', 36, 'IS', 8000),
  t('china-masters', 'China Masters', 'shenzhen', 37, 'S750', 950000),
  t('korea-open', 'Korea Open', 'suwon', 38, 'S500', 475000),
  t('kaohsiung-masters', 'Kaohsiung Masters', 'kaohsiung', 39, 'S100', 110000),
  t('al-ain-masters', 'Al Ain Masters', 'al-ain', 40, 'S100', 110000),
  t('arctic-open', 'Arctic Open', 'vantaa', 41, 'S500', 475000),
  t('denmark-open', 'Denmark Open', 'odense', 42, 'S750', 950000),
  t('french-open', 'French Open', 'paris', 43, 'S750', 950000),
  t('hylo-open', 'Hylo Open', 'saarbrucken', 44, 'S500', 475000),
  t('irish-ic', 'Irish Open', 'dublin', 44, 'IC', 20000),
  t('korea-masters', 'Korea Masters', 'iksan', 45, 'S300', 250000),
  t('japan-masters', 'Japan Masters', 'kumamoto', 46, 'S500', 475000),
  t('guwahati-masters', 'Guwahati Masters', 'guwahati', 47, 'S100', 110000),
  t('scottish-ic', 'Scottish Open', 'glasgow', 47, 'IC', 20000),
  t('syed-modi', 'Syed Modi International', 'lucknow', 48, 'S300', 250000),
  t('odisha-masters', 'Odisha Masters', 'cuttack', 49, 'S100', 110000),
  t('world-tour-finals', 'World Tour Finals', 'hangzhou', 50, 'WTF', 2500000),
  // Turnamen junior (U19). ASUMSI: kota tuan rumah & minggu disederhanakan.
  { id: 'asia-junior', name: 'Badminton Asia Junior Championships', cityId: 'surabaya', week: 28, tierId: 'JC', prizeUsd: 0, confederation: 'BA' },
  { id: 'europe-junior', name: 'European Junior Championships', cityId: 'brno', week: 28, tierId: 'JC', prizeUsd: 0, confederation: 'BE' },
  { id: 'panam-junior', name: 'Pan Am Junior Championships', cityId: 'lima', week: 28, tierId: 'JC2', prizeUsd: 0, confederation: 'BAM' },
  { id: 'africa-junior', name: 'African Junior Championships', cityId: 'lagos', week: 28, tierId: 'JC2', prizeUsd: 0, confederation: 'BCA' },
  { id: 'oceania-junior', name: 'Oceania Junior Championships', cityId: 'sydney', week: 28, tierId: 'JC2', prizeUsd: 0, confederation: 'BO' },
  { id: 'world-junior', name: 'BWF World Junior Championships', cityId: 'guwahati', week: 41, tierId: 'WJC', prizeUsd: 0 },
];

/**
 * Minggu resmi HSBC BWF World Tour 2027 & 2028 (kalender BWF 30 Juni 2026); Super 1000 (12 hari) = minggu pertamanya.
 * Turnamen yang tidak ada di kalender resmi tahun itu memakai jadwal hasil `scheduleYear`.
 */
export const OFFICIAL_WEEKS: Record<string, [number, number]> = {
  'malaysia-open': [3, 5], 'india-open': [5, 4], 'indonesia-masters': [6, 3], 'thailand-masters': [7, 2], 'german-open': [8, 8],
  'all-england': [9, 9], 'swiss-open': [11, 11], 'orleans-masters': [12, 12], 'philippine-open': [15, 7], 'taipei-open': [18, 18],
  'korea-open': [19, 19], 'hong-kong-open': [20, 20], 'indonesia-open': [21, 21], 'singapore-open': [23, 33], 'vietnam-open': [24, 24],
  'china-s100': [25, 27], 'canada-open': [26, 25], 'us-open': [27, 26], 'syed-modi': [30, 30], 'thailand-open': [32, 32],
  'malaysia-masters': [33, 23], 'japan-open': [34, 34], 'china-open': [35, 35], 'kaohsiung-masters': [37, 37], 'arctic-open': [39, 39],
  'french-open': [40, 40], 'denmark-open': [41, 41], 'malaysia-s100': [42, 42], 'hylo-open': [43, 38], 'china-masters': [44, 45],
  'japan-masters': [45, 46], 'australian-open': [46, 44], 'macau-open': [47, 47], 'indonesia-masters-100': [48, 48],
  'world-tour-finals': [48, 48], 'indonesia-s100-2': [49, 49],
  // ASUMSI: Kejuaraan Dunia 2027 di celah kalender Juli (minggu 28–29) karena Agustus terisi tur Asia.
  'world-championships': [28, 34],
};
const OFFICIAL_HOSTS: Record<string, Record<string, string>> = { 'us-open': { 2027: 'los-angeles' }, 'china-open': { 2027: 'chengdu', 2028: 'chengdu' } };
for (const e of CALENDAR_2026) {
  const w = OFFICIAL_WEEKS[e.id];
  if (w) e.weeks = { 2027: w[0], 2028: w[1] };
  if (OFFICIAL_HOSTS[e.id]) e.hosts = { ...e.hosts, ...OFFICIAL_HOSTS[e.id] };
}

export const BWF_2026: Ruleset = {
  id: 'bwf-2026',
  name: 'BWF 2026',
  startYear: 2026,
  tiers: TIERS_2026,
  calendar: CALENDAR_2026,
  ranking: { windowWeeks: 52, bestOf: 10, entryCutoffWeeks: 4 },
  race: { bestOf: 14, tiers: ['S1000', 'S750', 'S500', 'S300', 'S100'], maxFromTier: { S100: 3 } },
  seeding: [
    { minEntries: 64, seeds: 16 },
    { minEntries: 32, seeds: 8 },
    { minEntries: 16, seeds: 4 },
    { minEntries: 0, seeds: 2 },
  ],
  qualifierRatio: { '1': 8, '2': 8, '3': 4 },
  wtf: { qualifiers: 8, maxPerCountry: 2, worldChampAuto: true },
  topCommitted: { singles: 15, doubles: 10, mustPlay: { S1000: 'all', S750: 'all', S500: 2, WTF: 'all' } },
  generator: {
    seniorsPerGender: { min: 3, max: 24 },
    juniorsPerGender: { min: 1, max: 8 },
    pairsPerDiscipline: { min: 1, max: 8 },
    seniorAge: { min: 18, max: 34 },
    juniorAge: { min: 15, max: 17 },
    potential: { base: 35, perTradition: 0.4, sd: 12 },
    lateBloomerChance: 0.08,
    stagnantChance: 0.08,
  },
  // Rally-point 21, deuce s/d 30, best of 3. Angka mesin di bawah adalah hasil kalibrasi (ASUMSI).
  match: {
    pointsToWin: 21, cap: 30, gamesToWin: 2, intervalAt: 11,
    duelScale: 40, overallWeight: 0.6,
    energy: { costPerRally: 1.3, staminaRelief: 0.8, intervalRecovery: 6, gameRecovery: 15, effect: 0.15, fatigueToStart: 0.4 },
    warmup: { points: 8, maxPenalty: 6 },
    pressure: { fromScore: 18, weight: 0.5 },
    chemistryWeight: 0.15,
    serviceEvent: { base: 0.02, perMissingServe: 0.0005 },
    momentum: { decay: 0.8, weight: 2 },
    // Sistem skor 3×15 (BWF, mulai 4 Jan 2027): 15 poin, deuce 14–14 unggul 2, batas 21, interval 8.
    // ASUMSI: poin kritis mulai 12 & pemanasan 6 poin (diskalakan dari 18/21 & 8/21).
    newScoring: { fromYear: 2027, pointsToWin: 15, cap: 21, intervalAt: 8, pressureFrom: 12, warmupPoints: 6 },
    // Strategi Live (ASUMSI: kalibrasi). Mode Auto memakai 'balanced'.
    strategies: {
      balanced: { weight: { smash: 1, net: 1, deception: 1, rally: 1 }, attack: {}, defend: 0, error: 0, energy: 1 },
      attacking: { weight: { smash: 1.6, net: 1, deception: 0.8, rally: 0.7 }, attack: { smash: 4 }, defend: -2, error: 0.03, energy: 1.15 },
      defensive: { weight: { smash: 0.7, net: 1, deception: 0.8, rally: 1.6 }, attack: { smash: -3, net: -2, deception: -2, rally: 2 }, defend: 1.5, error: -0.01, energy: 0.95 },
      fast: { weight: { smash: 1.2, net: 1.6, deception: 0.8, rally: 0.6 }, attack: { net: 4, smash: 1 }, defend: -1, error: 0.03, energy: 1.3 },
      deceptive: { weight: { smash: 0.8, net: 1.1, deception: 1.8, rally: 0.8 }, attack: { deception: 3 }, defend: -1, error: 0.04, energy: 1.05 },
    },
  },
  // Kelelahan 0–100: naik per laga & jarak perjalanan, pulih tiap minggu. (ASUMSI: kalibrasi)
  fatigue: { perMatch: 5, per1000Km: 0.6, recoveryPerWeek: 12 },
  // Perilaku AI saat memilih turnamen. (ASUMSI: kalibrasi agar atlet top main ±18–22 turnamen/tahun)
  ai: {
    rankRange: {
      OG: [1, 9999], WC: [1, 9999], WTF: [1, 9999],
      S1000: [1, 64], S750: [1, 64], S500: [1, 100], S300: [1, 160], S100: [10, 260],
      IC: [25, 400], IS: [40, 9999], FS: [60, 9999],
    },
    playProb: { OG: 1, WC: 1, WTF: 1, S1000: 0.95, S750: 0.85, S500: 0.65, S300: 0.5, S100: 0.55, IC: 0.5, IS: 0.5, FS: 0.5 },
    restAbove: 45,
  },
  // Perkembangan & penuaan, diproses tiap kuartal (13 minggu). Nilai dari spesifikasi; sisanya ASUMSI kalibrasi.
  development: {
    growthByAge: [
      { maxAge: 19, min: 0.3, max: 0.4 },
      { maxAge: 22, min: 0.2, max: 0.25 },
      { maxAge: 25, min: 0.1, max: 0.15 },
      { maxAge: 28, min: 0, max: 0.05 },
      { maxAge: 99, min: 0, max: 0 },
    ],
    randomFactor: { min: 0.6, max: 1.4 },
    experience: { base: 0.85, perMatch: 0.025, max: 1.2, untilAge: 25 },
    declineByAge: [
      { maxAge: 28, min: 0, max: 0 },
      { maxAge: 30, min: 1, max: 2 },
      { maxAge: 32, min: 2, max: 4 },
      { maxAge: 34, min: 3, max: 6 },
      { maxAge: 99, min: 5, max: 8 },
    ],
    attrDecline: {
      speed: { weight: 1, startOffset: 0 }, stamina: { weight: 1, startOffset: 0 },
      smash: { weight: 0.7, startOffset: 1 }, defense: { weight: 0.7, startOffset: 1 },
      warmup: { weight: 0.5, startOffset: 1 },
      net: { weight: 0.35, startOffset: 2 }, serve: { weight: 0.3, startOffset: 2 },
      consistency: { weight: 0.35, startOffset: 2 }, deception: { weight: 0.3, startOffset: 2 },
      mental: { weight: 0.3, startOffset: 3 },
    },
    mentalGrowth: { perYear: 1, untilAge: 31 },
    doublesPeakDelay: 1.5,
    lateBloomer: { ageShift: 3, youngFactor: 0.6 },
    stagnantFactor: 0.35,
    retirementByAge: [
      { maxAge: 29, min: 0, max: 0 },
      { maxAge: 30, min: 0.03, max: 0.03 },
      { maxAge: 31, min: 0.05, max: 0.05 },
      { maxAge: 32, min: 0.08, max: 0.08 },
      { maxAge: 33, min: 0.12, max: 0.12 },
      { maxAge: 34, min: 0.18, max: 0.18 },
      { maxAge: 35, min: 0.28, max: 0.28 },
      { maxAge: 36, min: 0.4, max: 0.4 },
      { maxAge: 37, min: 0.6, max: 0.6 },
      { maxAge: 99, min: 1, max: 1 },
    ],
    retireAlwaysAt: 38,
    lowAbilityRetire: { fromAge: 23, belowCa: 35, chance: 0.15 },
    juniorsPerSeason: { min: 0.3, max: 2.2 },
    severeInjuryPaLoss: { min: 1, max: 4 },
  },
  // ASUMSI: kalibrasi cedera — atlet segar ±0,2%/laga, sangat lelah (90) ±2,6%/laga.
  injury: {
    base: 0.002, fatigueFactor: 0.03,
    levels: [
      { id: 'minor', chance: 0.67, weeks: { min: 1, max: 3 }, paLoss: 0, retireChance: 0 },
      { id: 'moderate', chance: 0.21, weeks: { min: 4, max: 12 }, paLoss: 0, retireChance: 0 },
      { id: 'severe', chance: 0.1, weeks: { min: 13, max: 26 }, paLoss: 1, retireChance: 0 },
      { id: 'critical', chance: 0.02, weeks: { min: 27, max: 104 }, paLoss: 2, retireChance: 0.3 },
    ],
  },
  career: {
    titleTiers: ['OG', 'WC', 'WTF', 'S1000', 'S750', 'S500', 'S300', 'S100'],
    violationPenalty: 3,
    gradeReputation: { A: 10, B: 5, C: 0, D: -5, E: -10 },
  },
  // Tuan rumah asli per tahun (`hosts`): Thomas & Uber 2026 Horsens, Sudirman 2025 Xiamen & 2027 Beijing, Suhandinata
  // 2025 Guwahati & 2026 Kairo, kontinental 2026 (Qingdao, Istanbul, Guatemala City, Gaborone, Auckland), Asia 2027 Qingdao.
  // ASUMSI: tahun yang belum diumumkan bergilir di antara tuan rumah terdahulu (`rotation`). Eropa 2027 aslinya Tallinn
  // (Estonia belum ada di daftar negara).
  // Minggu per tahun (`weeks`): Sudirman 2027 21 Apr–2 Mei (minggu 16), Asia beregu campuran 2027 12–17 Jan (minggu 2),
  // Eropa 6–10 Jan (minggu 1). ASUMSI: Thomas & Uber 2028 minggu 16 (celah kalender World Tour April–Mei).
  // Final 16 tim: tuan rumah, juara bertahan, 4 teratas Asia & Eropa (semifinalis), juara Pan Am/Afrika/Oseania,
  // sisanya menurut kekuatan tim (poin ranking line-up terbaik).
  team: {
    events: [
      { id: 'asia-team', name: 'Badminton Asia Team Championships', nameMixed: 'Badminton Asia Mixed Team Championships', cityId: 'qingdao', week: 7, confederation: 'BA', qualifiers: 4, weeks: { 2027: 2 },
        hosts: { 2026: 'qingdao', 2027: 'qingdao' }, rotation: ['kuala-lumpur', 'hong-kong', 'qingdao'] },
      { id: 'europe-team', name: 'European Team Championships', nameMixed: 'European Mixed Team Championships', cityId: 'istanbul', week: 7, confederation: 'BE', qualifiers: 4, weeks: { 2027: 1 },
        hosts: { 2026: 'istanbul' }, rotation: ['vantaa', 'almere', 'sofia', 'horsens'] },
      { id: 'panam-team', name: 'Pan Am Male & Female Cup', nameMixed: 'Pan Am Cup', cityId: 'guatemala-city', week: 7, confederation: 'BAM',
        hosts: { 2026: 'guatemala-city' }, rotation: ['lima', 'calgary', 'guatemala-city', 'sao-paulo'] },
      { id: 'africa-team', name: 'All Africa Senior Championships', cityId: 'gaborone', week: 7, confederation: 'BCA',
        hosts: { 2026: 'gaborone' }, rotation: ['cairo', 'lagos', 'johannesburg', 'rose-hill'] },
      { id: 'oceania-team', name: 'Oceania Team Championships', nameMixed: 'Oceania Mixed Team Championships', cityId: 'auckland', week: 7, confederation: 'BO',
        hosts: { 2026: 'auckland' }, rotation: ['sydney', 'auckland'] },
      { id: 'thomas-uber-cup', name: 'Thomas & Uber Cup', cityId: 'horsens', week: 18, formats: ['thomas', 'uber'], everyYears: { interval: 2, offset: 0 }, weeks: { 2028: 16 },
        hosts: { 2026: 'horsens' }, rotation: ['bangkok', 'jakarta', 'kuala-lumpur'] },
      { id: 'sudirman-cup', name: 'Sudirman Cup', cityId: 'xiamen', week: 18, formats: ['sudirman'], everyYears: { interval: 2, offset: 1 }, weeks: { 2027: 16 },
        hosts: { 2025: 'xiamen', 2027: 'beijing' }, rotation: ['kuala-lumpur', 'vantaa', 'glasgow'] },
      // Kejuaraan Dunia Beregu Campuran Junior (U19), setiap tahun seminggu sebelum Kejuaraan Dunia Junior. ASUMSI: tuan rumah.
      // ASUMSI: 32 tim (8 grup × 4, 2 teratas ke babak 16 besar); kenyataannya ±38 tim dengan grup bervariasi.
      { id: 'suhandinata-cup', name: 'BWF World Junior Mixed Team Championships', cityId: 'guwahati', week: 40, formats: ['suhandinata'],
        hosts: { 2025: 'guwahati', 2026: 'cairo' }, rotation: ['surabaya', 'bangkok', 'calgary', 'kuala-lumpur'],
        finals: { teams: 32, groups: { groups: 8, perGroup: 4, advance: 2 } } },
    ],
    // ASUMSI: urutan partai Sudirman Cup tetap XD–WS–MS–WD–MD (aslinya bisa berubah per edisi).
    order: {
      thomas: ['MS', 'MD', 'MS', 'MD', 'MS'],
      uber: ['WS', 'WD', 'WS', 'WD', 'WS'],
      sudirman: ['XD', 'WS', 'MS', 'WD', 'MD'],
      suhandinata: ['XD', 'WS', 'MS', 'WD', 'MD'], // ASUMSI: urutan partai seperti Sudirman Cup
    },
    maxMatchesPerPlayer: 2,
    // ASUMSI: skuad Thomas/Uber 4–10 atlet, Sudirman 4–12 atlet.
    squadSize: { thomas: { min: 4, max: 10 }, uber: { min: 4, max: 10 }, sudirman: { min: 4, max: 12 }, suhandinata: { min: 4, max: 12 } },
    finals: { teams: 16, groups: { groups: 4, perGroup: 4, advance: 2 } },
    continentalTeams: 8,
  },
};
