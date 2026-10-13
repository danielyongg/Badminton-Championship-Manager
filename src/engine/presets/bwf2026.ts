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
  t('world-championships', 'Kejuaraan Dunia', 'new-delhi', 34, 'WC', 0, { everyYears: { interval: 4, offset: 0, invert: true } }),
  t('olympics', 'Olimpiade', 'los-angeles', 31, 'OG', 0, { everyYears: { interval: 4, offset: 0 } }),
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
  injury: { base: 0.002, fatigueFactor: 0.03, severeChance: 0.15, minorWeeks: { min: 1, max: 3 }, severeWeeks: { min: 6, max: 20 } },
  career: {
    titleTiers: ['OG', 'WC', 'WTF', 'S1000', 'S750', 'S500', 'S300', 'S100'],
    violationPenalty: 3,
    gradeReputation: { A: 10, B: 5, C: 0, D: -5, E: -10 },
  },
  // ASUMSI: tuan rumah tetap tiap edisi — final Horsens (Thomas & Uber 2026) & Xiamen (Sudirman 2025), kontinental
  // = tuan rumah 2026 (Qingdao, Istanbul, Guatemala City, Gaborone, Auckland); koreksi lewat Editor.
  // Final 16 tim: tuan rumah, juara bertahan, 4 teratas Asia & Eropa (semifinalis), juara Pan Am/Afrika/Oseania,
  // sisanya menurut kekuatan tim (poin ranking line-up terbaik).
  team: {
    events: [
      { id: 'asia-team', name: 'Badminton Asia Team Championships', nameMixed: 'Badminton Asia Mixed Team Championships', cityId: 'qingdao', week: 7, confederation: 'BA', qualifiers: 4 },
      { id: 'europe-team', name: 'European Team Championships', nameMixed: 'European Mixed Team Championships', cityId: 'istanbul', week: 7, confederation: 'BE', qualifiers: 4 },
      { id: 'panam-team', name: 'Pan Am Male & Female Cup', nameMixed: 'Pan Am Cup', cityId: 'guatemala-city', week: 7, confederation: 'BAM' },
      { id: 'africa-team', name: 'All Africa Senior Championships', cityId: 'gaborone', week: 7, confederation: 'BCA' },
      { id: 'oceania-team', name: 'Oceania Team Championships', nameMixed: 'Oceania Mixed Team Championships', cityId: 'auckland', week: 7, confederation: 'BO' },
      { id: 'thomas-uber-cup', name: 'Thomas & Uber Cup', cityId: 'horsens', week: 18, formats: ['thomas', 'uber'], everyYears: { interval: 2, offset: 0 } },
      { id: 'sudirman-cup', name: 'Sudirman Cup', cityId: 'xiamen', week: 18, formats: ['sudirman'], everyYears: { interval: 2, offset: 1 } },
    ],
    // ASUMSI: urutan partai Sudirman Cup tetap XD–WS–MS–WD–MD (aslinya bisa berubah per edisi).
    order: {
      thomas: ['MS', 'MD', 'MS', 'MD', 'MS'],
      uber: ['WS', 'WD', 'WS', 'WD', 'WS'],
      sudirman: ['XD', 'WS', 'MS', 'WD', 'MD'],
    },
    maxMatchesPerPlayer: 2,
    // ASUMSI: skuad Thomas/Uber 4–10 atlet, Sudirman 4–12 atlet.
    squadSize: { thomas: { min: 4, max: 10 }, uber: { min: 4, max: 10 }, sudirman: { min: 4, max: 12 } },
    finals: { teams: 16, groups: { groups: 4, perGroup: 4, advance: 2 } },
    continentalTeams: 8,
  },
};
