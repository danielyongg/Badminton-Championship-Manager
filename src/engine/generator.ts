import { NAME_POOLS } from './presets/names';
import { normal, pick, randInt, type Rng } from './rng';
import { ATTRS, type Attrs, type Country, type GameDate, type GeneratorConfig, type Pair, type Player } from './types';

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const lerp = (range: { min: number; max: number }, tradition: number) =>
  Math.round(range.min + (tradition / 100) * (range.max - range.min));

/** Kemampuan saat ini (CA) = rata-rata atribut. */
export const currentAbility = (attrs: Attrs) =>
  Math.round(ATTRS.reduce((s, a) => s + attrs[a], 0) / ATTRS.length);

export function ageAt(birth: GameDate, date: GameDate) {
  return date.year - birth.year - (date.week < birth.week ? 1 : 0);
}

/** Tanggal lahir agar usia pada `date` tepat `age`. */
const birthFor = (age: number, date: GameDate, week: number): GameDate =>
  ({ year: date.year - age - (week > date.week ? 1 : 0), week });

/** Seberapa dekat CA ke PA pada usia tertentu saat dunia dibuat (0–1). */
function maturity(age: number, trait: Player['trait']) {
  // ASUMSI: kurva awal sederhana; kurva perkembangan sebenarnya ada di Fase 6.
  let m = age >= 24 ? 0.97 : 0.55 + (age - 15) * 0.05;
  if (trait === 'late' && age < 25) m -= 0.1;
  if (age > 29) m -= (age - 29) * 0.02;
  return clamp(m, 0.4, 1);
}

/** Nama acak; `used` mencegah nama kembar dalam satu negara (menyerah setelah 20 percobaan). */
function makeName(rng: Rng, country: Country, gender: 'M' | 'F', used = new Set<string>()) {
  const pool = NAME_POOLS[country.namePool];
  let name = '';
  for (let i = 0; i < 20 && (!name || used.has(name)); i++) {
    const first = pick(rng, gender === 'M' ? pool.male : pool.female);
    const last = pick(rng, pool.last);
    name = pool.familyFirst ? `${last} ${first}` : `${first} ${last}`;
  }
  used.add(name);
  return name;
}

/**
 * Junior (U19) menurut tahun kalender, seperti BWF Junior Tournament Regulations: tetap di bawah 19 sepanjang tahun
 * (tahun − tahun lahir ≤ 18). Status tidak berubah di tengah musim saat atlet berulang tahun.
 */
export const JUNIOR_MAX_AGE = 18;
export const isJuniorAge = (p: Pick<Player, 'birth'>, date: GameDate) => date.year - p.birth.year <= JUNIOR_MAX_AGE;
/** Junior pelatnas pratama: belum dipromosikan → tidak didaftarkan otomatis ke turnamen senior (hanya negara manajer). */
export const isPratama = (p: Pick<Player, 'birth' | 'promoted'>, date: GameDate) => isJuniorAge(p, date) && !p.promoted;

export function generatePlayer(
  rng: Rng, cfg: GeneratorConfig, country: Country, gender: 'M' | 'F', age: number, date: GameDate, id: string,
  usedNames?: Set<string>, maxPa = 99,
): Player {
  const roll = rng();
  const trait: Player['trait'] =
    roll < cfg.lateBloomerChance ? 'late' : roll < cfg.lateBloomerChance + cfg.stagnantChance ? 'stagnant' : undefined;
  const p = cfg.potential;
  const pa = Math.round(clamp(normal(rng, p.base + country.traditionStrength * p.perTradition, p.sd), 20, maxPa));
  const targetCa = pa * maturity(age, trait);

  // Gaya bermain: tiap atribut menyimpang acak dari target, lalu digeser agar rata-ratanya = target.
  const raw = ATTRS.map(() => normal(rng, 0, 8));
  const shift = targetCa - raw.reduce((s, x) => s + x, 0) / raw.length;
  const attrs = Object.fromEntries(ATTRS.map((a, i) => [a, Math.round(clamp(raw[i] + shift, 1, 100))])) as Attrs;
  // Pembulatan/clamp bisa sedikit menaikkan rata-rata; pastikan CA tidak melebihi PA.
  while (currentAbility(attrs) > pa) for (const a of ATTRS) attrs[a] = Math.max(1, attrs[a] - 1);

  return {
    id,
    name: makeName(rng, country, gender, usedNames),
    countryId: country.id,
    gender,
    hand: rng() < 0.15 ? 'L' : 'R',
    birth: birthFor(age, date, randInt(rng, 1, 52)),
    attrs,
    pa,
    form: 0,
    fatigue: 0,
    trait,
    attrHistory: [{ year: date.year - 1, attrs: { ...attrs } }], // kondisi awal = akhir musim sebelumnya
  };
}

/** Pasangkan berurutan (1+2, 3+4, ...) dari daftar yang sudah diurutkan kekuatannya. */
function pairUp(
  rng: Rng, discipline: Pair['discipline'], a: Player[], b: Player[], count: number, date: GameDate, idPrefix: string,
): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < count && i < a.length && i < b.length; i++) {
    pairs.push({
      id: `${idPrefix}${discipline}${i + 1}`,
      discipline,
      playerIds: [a[i].id, b[i].id],
      chemistry: randInt(rng, 40, 80),
      matchesTogether: randInt(rng, 0, 60),
      formed: date,
    });
  }
  return pairs;
}

/** Senior per gender agar bisa menurunkan tim beregu: 3 tunggal + 2 pasangan ganda (Thomas/Uber). */
export const TEAM_MIN_PER_GENDER = 7;

/**
 * Atlet fiktif satu negara. `existing` = atlet dari paket data (mis. nama asli): generator hanya menambah senior
 * sampai cukup untuk tim beregu dan junior sampai jumlah normal; senior tambahan tidak lebih kuat dari senior
 * paket terlemah, dan pasangan dibentuk kemudian oleh formPairs.
 */
export function generateCountry(rng: Rng, cfg: GeneratorConfig, country: Country, date: GameDate, existing: Player[] = []) {
  const tr = country.traditionStrength;
  const players: Player[] = [];
  const byGender: Record<'M' | 'F', Player[]> = { M: [], F: [] };
  const usedNames = new Set(existing.map((p) => p.name));

  for (const gender of ['M', 'F'] as const) {
    const own = existing.filter((p) => p.gender === gender);
    const ownSeniors = own.filter((p) => ageAt(p.birth, date) > cfg.juniorAge.max);
    const seniors = existing.length ? Math.max(0, TEAM_MIN_PER_GENDER - ownSeniors.length) : lerp(cfg.seniorsPerGender, tr);
    const juniors = Math.max(0, lerp(cfg.juniorsPerGender, tr) - (own.length - ownSeniors.length));
    const cap = ownSeniors.length ? Math.min(...ownSeniors.map((p) => currentAbility(p.attrs))) : 99;
    for (let i = 0; i < seniors + juniors; i++) {
      const age = i < seniors ? randInt(rng, cfg.seniorAge.min, cfg.seniorAge.max) : randInt(rng, cfg.juniorAge.min, cfg.juniorAge.max);
      const p = generatePlayer(rng, cfg, country, gender, age, date, `${country.id}-${gender}${i + 1}`, usedNames, i < seniors ? cap : 99);
      players.push(p);
      if (i < seniors) byGender[gender].push(p);
    }
  }

  if (existing.length) return { players, pairs: [] as Pair[] };

  // Senior diurutkan per CA, lalu dibagi bergantian: posisi genap fokus tunggal, ganjil fokus ganda.
  // ASUMSI: pembagian sederhana ini hanya untuk dunia awal; manajer/AI bisa membentuk ulang pasangan.
  const n = lerp(cfg.pairsPerDiscipline, tr);
  const sorted = (g: 'M' | 'F') => [...byGender[g]].sort((x, y) => currentAbility(y.attrs) - currentAbility(x.attrs));
  const dbl = (g: 'M' | 'F') => sorted(g).filter((_, i) => i % 2 === 1);
  const men = dbl('M'), women = dbl('F');
  // Minimal 2 pasangan MD & WD bila atletnya cukup (beregu butuh 2 ganda): negara kecil melengkapi dengan atlet fokus tunggal.
  const doublesPool = (focus: Player[], g: 'M' | 'F') =>
    focus.length >= Math.min(n, 2) * 2 ? focus.slice(0, n * 2) : [...focus, ...sorted(g).filter((p) => !focus.includes(p))].slice(0, Math.min(n, 2) * 2);
  const md = doublesPool(men, 'M'), wd = doublesPool(women, 'F');
  const prefix = `${country.id}-`;
  const pairs = [
    ...pairUp(rng, 'MD', md.filter((_, i) => i % 2 === 0), md.filter((_, i) => i % 2 === 1), n, date, prefix),
    ...pairUp(rng, 'WD', wd.filter((_, i) => i % 2 === 0), wd.filter((_, i) => i % 2 === 1), n, date, prefix),
    // XD: pemain ganda yang belum masuk MD/WD, sisanya diisi pemain lain.
    ...pairUp(rng, 'XD',
      [...men.slice(n * 2), ...sorted('M').filter((_, i) => i % 2 === 0)],
      [...women.slice(n * 2), ...sorted('F').filter((_, i) => i % 2 === 0)], n, date, prefix),
  ];
  return { players, pairs };
}

export function generateWorld(rng: Rng, cfg: GeneratorConfig, countries: Country[], date: GameDate, existing: Player[] = []) {
  const players: Player[] = [];
  const pairs: Pair[] = [];
  for (const c of countries) {
    const r = generateCountry(rng, cfg, c, date, existing.filter((p) => p.countryId === c.id));
    players.push(...r.players);
    pairs.push(...r.pairs);
  }
  return { players, pairs };
}
