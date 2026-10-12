import { ageAt, currentAbility, generatePlayer } from './generator';
import { normal, type Rng } from './rng';
import { ATTRS, type AgeBand, type Country, type DevelopmentConfig, type GameDate, type GeneratorConfig, type Player } from './types';

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
}

/** Atribut dijepit 1–100 dan rata-ratanya (CA) tidak melampaui PA. Atribut yang sudah di batas bawah tidak bisa turun lagi, maka diulang. */
export function capToPa(p: Player) {
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
  const before = meanAttrs(p);
  const realAge = ageAt(p.birth, ctx.date);
  const age = realAge - (ctx.doublesPlayers.has(p.id) ? cfg.doublesPeakDelay : 0);

  // 1) Pertumbuhan = (PA − CA) × laju usia × faktor acak × pengalaman × sifat.
  const growthAge = p.trait === 'late' ? age - cfg.lateBloomer.ageShift : age;
  let rate = between(rng, band(cfg.growthByAge, growthAge)) * between(rng, cfg.randomFactor);
  if (p.trait === 'late' && realAge < 22) rate *= cfg.lateBloomer.youngFactor;
  if (p.trait === 'stagnant') rate *= cfg.stagnantFactor;
  if (realAge <= cfg.experience.untilAge) {
    const e = cfg.experience;
    rate *= Math.min(e.max, e.base + e.perMatch * (ctx.experience.get(p.id) ?? 0));
  }
  const growth = Math.max(0, p.pa - before) * (rate / 4);
  // Dibagi ke atribut dengan bobot acak (gaya bermain ikut terbentuk).
  const weights = ATTRS.map(() => 0.5 + rng());
  const wSum = weights.reduce((s, x) => s + x, 0);
  ATTRS.forEach((a, i) => (p.attrs[a] += (growth * ATTRS.length * weights[i]) / wSum));

  // 2) Mental/pengalaman masih bisa naik sampai ±31 tahun.
  if (realAge <= cfg.mentalGrowth.untilAge && realAge >= 20) p.attrs.mental += cfg.mentalGrowth.perYear / 4;

  // 3) Penuaan: tiap atribut mulai turun pada usia (awal penurunan + offset), dengan bobotnya sendiri.
  for (const a of ATTRS) {
    const { weight, startOffset } = cfg.attrDecline[a];
    const d = between(rng, band(cfg.declineByAge, age - startOffset));
    p.attrs[a] -= (d * weight) / 4;
  }

  // 4) Batas: atribut 1–100 dan CA tidak pernah melampaui PA.
  capToPa(p);

  // 5) Form bergeser acak tiap kuartal.
  p.form = clamp(p.form * 0.5 + normal(rng, 0, 3), -10, 10);
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
export function newJuniors(country: Country, cfg: DevelopmentConfig, gen: GeneratorConfig, date: GameDate, rng: Rng): Player[] {
  const out: Player[] = [];
  for (const gender of ['M', 'F'] as const) {
    const expected = cfg.juniorsPerSeason.min + (country.traditionStrength / 100) * (cfg.juniorsPerSeason.max - cfg.juniorsPerSeason.min);
    const n = Math.floor(expected) + (rng() < expected % 1 ? 1 : 0); // pembulatan acak
    for (let i = 0; i < n; i++) {
      const age = gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      out.push(generatePlayer(rng, gen, country, gender, age, date, `${country.id}-${gender}${date.year}-${i + 1}`));
    }
  }
  return out;
}

/** Cedera berat menurunkan PA sedikit (dipakai sistem cedera di Fase 7). */
export function applySevereInjury(p: Player, cfg: DevelopmentConfig, rng: Rng) {
  p.pa = Math.max(1, Math.round(p.pa - between(rng, cfg.severeInjuryPaLoss)));
  capToPa(p);
}
