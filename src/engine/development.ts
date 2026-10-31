import { ageAt, currentAbility, generatePlayer } from './generator';
import { normal, type Rng } from './rng';
import { AGELESS_YEARS, hasTrait, REVEAL_SEASONS, visibleTraits } from './traits';
import { isHeldBack, LATE_GROWTH } from './promotion';
import { ELITE_AGE, ELITE_MAX, ELITE_PER, MENTOR_GROWTH, MENTOR_MENTAL, MORALE_GROWTH } from './boosts';
import { ATTRS, type AgeBand, type City, type Country, type DevelopmentConfig, type GameDate, type GeneratorConfig, type Player, type InjuryConfig, type InjuryLevel } from './types';

// Perkembangan (menuju PA), penuaan (penurunan per atribut), pensiun & regenerasi junior.
// Atribut disimpan sebagai pecahan agar perubahan per kuartal yang kecil tetap terakumulasi; UI membulatkan.

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const band = (bands: AgeBand[], age: number) => bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
const between = (rng: Rng, b: { min: number; max: number }) => b.min + rng() * (b.max - b.min);
const meanAttrs = (p: Player) => ATTRS.reduce((s, a) => s + p.attrs[a], 0) / ATTRS.length;

export interface QuarterContext {
  date: GameDate;
  /** Laga berbobot kuartal ini per atlet (menang & tier tinggi bernilai lebih). */
  experience: Map<string, number>;
  /** Atlet yang terutama bermain ganda: puncaknya lebih lambat. */
  doublesPlayers: Set<string>;
  /** Atlet top 20 per negara (lingkungan pelatnas). */
  elite?: Map<string, number>;
  /** Atlet muda yang punya mentor (pasangan senior jauh lebih kuat). */
  mentored?: Set<string>;
  /** Junior Pratama yang tertahan (siap promosi > 26 minggu): pertumbuhan melambat. */
  heldBack?: Set<string>;
}

/** Atribut dijepit 1–100 dan rata-ratanya (CA) tidak melampaui PA. Atribut yang sudah di batas bawah tidak bisa turun lagi, maka diulang. */
/** Pengali pertumbuhan dari laga berbobot kuartal ini (berlaku s/d usia `experience.untilAge`). */
export const experienceFactor = (cfg: DevelopmentConfig, weighted: number) =>
  Math.min(cfg.experience.max, cfg.experience.base + cfg.experience.perMatch * weighted);

export function capToPa(p: Player) {
  p.pa = clamp(p.pa, 1, 100); // PA di atas 100 (Editor / file lama) membuat pertumbuhan meledak
  for (const a of ATTRS) p.attrs[a] = clamp(p.attrs[a], 1, 100);
  for (let i = 0; i < 20 && meanAttrs(p) > p.pa; i++) {
    const movable = ATTRS.filter((a) => p.attrs[a] > 1);
    if (!movable.length) break;
    const over = ((meanAttrs(p) - p.pa) * ATTRS.length) / movable.length;
    for (const a of movable) p.attrs[a] = clamp(p.attrs[a] - over, 1, 100);
  }
}

/** Satu kuartal (¼ tahun) perkembangan & penuaan untuk seorang atlet. */
export function developQuarter(p: Player, cfg: DevelopmentConfig, ctx: QuarterContext, rng: Rng) {
  p.pa = clamp(p.pa, 1, 100);
  const before = meanAttrs(p);
  const realAge = ageAt(p.birth, ctx.date);
  const age = realAge - (ctx.doublesPlayers.has(p.id) ? cfg.doublesPeakDelay : 0);

  // 1) Pertumbuhan = (PA − CA) × laju usia × faktor acak × pengalaman × sifat.
  const growthAge = p.trait === 'late' ? age - cfg.lateBloomer.ageShift : age;
  let rate = between(rng, band(cfg.growthByAge, growthAge)) * between(rng, cfg.randomFactor);
  if (p.trait === 'late' && realAge < 22) rate *= cfg.lateBloomer.youngFactor;
  if (p.trait === 'stagnant') rate *= cfg.stagnantFactor;
  if (realAge <= cfg.experience.untilAge) rate *= experienceFactor(cfg, ctx.experience.get(p.id) ?? 0);
  rate *= 1 + MORALE_GROWTH * (p.form / 10); // morale ±10 → ±10 %
  if (realAge <= ELITE_AGE) rate *= 1 + Math.min(ELITE_MAX, ELITE_PER * (ctx.elite?.get(p.countryId) ?? 0));
  const mentored = ctx.mentored?.has(p.id);
  if (mentored) rate *= 1 + MENTOR_GROWTH;
  if (ctx.heldBack?.has(p.id)) rate *= LATE_GROWTH;
  const growth = Math.max(0, p.pa - before) * (rate / 4);
  // Dibagi ke atribut dengan bobot acak (gaya bermain ikut terbentuk).
  const weights = ATTRS.map(() => 0.5 + rng());
  const wSum = weights.reduce((s, x) => s + x, 0);
  ATTRS.forEach((a, i) => (p.attrs[a] += (growth * ATTRS.length * weights[i]) / wSum));

  // 2) Mental/pengalaman masih bisa naik sampai ±31 tahun.
  if (realAge <= cfg.mentalGrowth.untilAge && realAge >= 20) p.attrs.mental += cfg.mentalGrowth.perYear / 4;
  if (mentored) p.attrs.mental += MENTOR_MENTAL / 4;

  // 3) Penuaan: tiap atribut mulai turun pada usia (awal penurunan + offset), dengan bobotnya sendiri.
  const declineAge = age - (hasTrait(p, 'ageless') ? AGELESS_YEARS : 0); // awet muda
  for (const a of ATTRS) {
    const { weight, startOffset } = cfg.attrDecline[a];
    const d = between(rng, band(cfg.declineByAge, declineAge - startOffset));
    p.attrs[a] -= (d * weight) / 4;
  }

  // 4) Batas: atribut 1–100 dan CA tidak pernah melampaui PA.
  capToPa(p);

  // 5) Morale (`form`) tidak lagi acak: diatur hasil laga & pulih tiap minggu (lihat updateMorale di season.ts).
  p.caDelta = currentAbility(p.attrs) - Math.round(before);
}

/** Peluang pensiun tahun ini: usia, ranking (top 20 bertahan lebih lama), dan penurunan dari puncak. */
export function retirementChance(p: Player, cfg: DevelopmentConfig, date: GameDate, rank?: number) {
  const age = ageAt(p.birth, date);
  if (age >= cfg.retireAlwaysAt) return 1;
  const b = band(cfg.retirementByAge, age);
  let chance = (b.min + b.max) / 2;
  if (rank !== undefined && rank <= 20) chance *= 0.5;
  else if (rank === undefined || rank > 200) chance *= 1.5;
  const peak = Math.max(...p.attrHistory.map((h) => ATTRS.reduce((s, a) => s + h.attrs[a], 0) / ATTRS.length), meanAttrs(p));
  if (peak - meanAttrs(p) > 8) chance *= 1.5;
  const low = cfg.lowAbilityRetire;
  if (age >= low.fromAge && currentAbility(p.attrs) < low.belowCa) chance = Math.max(chance, low.chance);
  return clamp(chance, 0, 1);
}

/** Junior baru (15–17 th) untuk satu negara di awal musim; jumlah & potensi mengikuti kekuatan tradisi. */
export function newJuniors(country: Country, cfg: DevelopmentConfig, gen: GeneratorConfig, date: GameDate, rng: Rng, usedNames?: Set<string>, cities?: City[]): Player[] {
  const out: Player[] = [];
  for (const gender of ['M', 'F'] as const) {
    const expected = cfg.juniorsPerSeason.min + (country.traditionStrength / 100) * (cfg.juniorsPerSeason.max - cfg.juniorsPerSeason.min);
    const n = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0); // pembulatan acak
    for (let i = 0; i < n; i++) {
      const age = gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      out.push(generatePlayer(rng, gen, country, gender, age, date, `${country.id}-${gender}${date.year}-${i + 1}`, usedNames, 99, cities));
    }
  }
  return out;
}

/** Cedera berat/parah menurunkan PA (`times` × `severeInjuryPaLoss`). */
export function applySevereInjury(p: Player, cfg: DevelopmentConfig, rng: Rng, times = 1) {
  p.pa = Math.max(1, Math.round(p.pa - times * between(rng, cfg.severeInjuryPaLoss)));
  capToPa(p);
}

/**
 * Masih cedera `ahead` minggu lagi (sisa cedera berkurang 1 tiap awal minggu). Entry dibuat beberapa minggu sebelum
 * turnamen: atlet yang sembuh sebelum minggu turnamen (ahead = minggu turnamen − minggu ini) tetap bisa didaftarkan.
 */
export const injuredFor = (p: Player, ahead = 0) => (p.injury?.weeksLeft ?? 0) > ahead;

/** Undi cedera: tingkat menurut peluang kumulatif, lama absen, jenis, dan apakah langsung pensiun. */
export function rollInjury(cfg: InjuryConfig, rng: Rng) {
  const roll = rng();
  let acc = 0;
  const lv = cfg.levels.find((l) => (acc += l.chance) > roll) ?? cfg.levels[cfg.levels.length - 1];
  const kinds = INJURY_TYPES[lv.id];
  const injury = { weeksLeft: lv.weeks.min + Math.floor(rng() * (lv.weeks.max - lv.weeks.min + 1)), level: lv.id, type: kinds[Math.floor(rng() * kinds.length)] };
  return { injury, paLoss: lv.paLoss, retire: lv.retireChance > 0 && rng() < lv.retireChance };
}

/** Jenis cedera per tingkat (nama di teks `inj_{jenis}`). */
export const INJURY_TYPES: Record<InjuryLevel, string[]> = {
  minor: ['cramp', 'bruise', 'blister', 'neck'],
  moderate: ['ankle', 'hamstring', 'elbow', 'back'],
  severe: ['calf', 'shoulder', 'stress', 'meniscus'],
  critical: ['acl', 'achilles', 'spine', 'knee'],
};

/** Ringkasan perkembangan kuartal terakhir untuk Dashboard (dari `caDelta`, tanpa data baru di save). */
export function quarterReport(players: Player[], countryId: string, date: GameDate) {
  const own = players.filter((p) => p.countryId === countryId && p.retired === undefined && p.released === undefined && p.caDelta !== undefined);
  const age = (p: Player) => ageAt(p.birth, date);
  return {
    risers: own.filter((p) => p.caDelta! > 0).sort((a, b) => b.caDelta! - a.caDelta!).slice(0, 3),
    stalled: own.filter((p) => age(p) <= 21 && p.caDelta! <= 0).slice(0, 3),
    declining: own.filter((p) => age(p) >= 27 && p.caDelta! < 0).sort((a, b) => a.caDelta! - b.caDelta!).slice(0, 3),
    heldBack: own.filter((p) => isHeldBack(p, date)).slice(0, 3),
    // Sifat fisik/perkembangan baru terbaca musim ini (sifat lain terungkap bertahap lewat jumlah laga).
    revealed: own.filter((p) => p.attrHistory.length === REVEAL_SEASONS && visibleTraits(p, 0).length).slice(0, 3),
  };
}
