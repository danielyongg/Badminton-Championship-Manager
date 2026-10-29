import { potentialStars } from './career';
import { capToPa } from './development';
import { ageAt, currentAbility, generatePlayer } from './generator';
import type { Rng } from './rng';
import { ensureTraits, traitHints, type TraitId } from './traits';
import { absWeek, computeRanking } from './ranking';
import type { SeasonState } from './season';
import { ATTRS, type Attr, type City, type Country, type Discipline, type GameDate, type GeneratorConfig, type Player, type Ruleset } from './types';

// Pencarian bakat junior negara manajer: kandidat 2× kursi di akhir musim; manajer merekrut berapa pun, atau diisi otomatis sejumlah kursi.

export interface Scouting {
  year: number;
  slots: { M: number; F: number };
  candidates: Player[];
  /** Rentang bintang potensi yang ditampilkan per kandidat (lebar 2 bintang, memuat perkiraan potensi). */
  starRange: Record<string, [number, number]>;
  /** Catatan pemandu bakat per kandidat (tebakan sifat, bisa meleset). */
  notes?: Record<string, (TraitId | 'late' | 'stagnant')[]>;
  /** Jumlah kandidat yang sudah direkrut bertahap (pencarian tetap terbuka). */
  recruited?: number;
  /** Nama kandidat yang mundur selagi manajer menunggu. */
  withdrawn?: string[];
  /** Tipe kandidat (gaya yang menonjol). Tidak ada di pencarian dari save lama. */
  types?: Record<string, ScoutType>;
  /** Kandidat yang ditandai ⭐ Bakat langka oleh pemandu (±90 % tepat, kadang permata palsu). */
  gems?: string[];
  /** Permata asli (PA ≥ ambang), tidak ditampilkan. */
  trueGems?: string[];
}

export type ScoutFocus = 'balanced' | 'singles' | 'doubles' | 'attack' | 'defense' | 'raw' | 'ready';
export const SCOUT_FOCI: ScoutFocus[] = ['balanced', 'singles', 'doubles', 'attack', 'defense', 'raw', 'ready'];

export type ScoutType = 'doubles' | 'attack' | 'defense' | 'worker' | 'ready' | 'raw';
export const SCOUT_TYPES: ScoutType[] = ['doubles', 'attack', 'defense', 'worker', 'ready', 'raw'];
/** Atribut yang dinaikkan per tipe; atribut lain diturunkan sama rata agar kemampuan kira-kira tetap. ASUMSI. */
const TYPE_ATTRS: Partial<Record<ScoutType, Attr[]>> = {
  doubles: ['net', 'serve', 'smash'], attack: ['smash', 'deception'], defense: ['defense', 'consistency'], worker: ['speed', 'stamina'],
};
const TYPE_BOOST = 8;
/** Peluang angkatan per gender punya 2 permata; peluang permata ditandai; peluang ada satu permata palsu. ASUMSI. */
export const GEM_SECOND = 0.4, GEM_FLAG = 0.9, FALSE_GEM = 0.1;
/** Ambang permata: rata-rata PA negara + 1,5 sd (Indonesia ≈ 91). */
export const gemLine = (country: Country, gen: GeneratorConfig) =>
  Math.round(gen.potential.base + country.traditionStrength * gen.potential.perTradition + 1.5 * gen.potential.sd);

/** Geser atribut kandidat sesuai tipenya (siap pakai: semua naik, mentah: semua turun), lalu jaga CA ≤ PA. */
function shapeType(p: Player, type: ScoutType) {
  const up = TYPE_ATTRS[type];
  if (up) {
    const down = (TYPE_BOOST * up.length) / (ATTRS.length - up.length);
    for (const a of ATTRS) p.attrs[a] += up.includes(a) ? TYPE_BOOST : -down;
  } else for (const a of ATTRS) p.attrs[a] += type === 'ready' ? 5 : -4;
  if (type === 'doubles') p.focus = 'D';
  capToPa(p);
  for (const a of ATTRS) p.attrs[a] = Math.round(p.attrs[a]);
  p.attrHistory = [{ year: p.attrHistory[0]?.year ?? 0, attrs: { ...p.attrs } }];
}
/** Peluang per gender per minggu (minggu 2 s/d batas) satu kandidat mundur. ASUMSI. */
export const WITHDRAW_CHANCE = 0.5;

/** Gaya bermain: dua atribut tertinggi (urutan ATTRS memecah seri). */
export function styleOf(p: Player): [Attr, Attr] {
  const [a, b] = [...ATTRS].sort((x, y) => p.attrs[y] - p.attrs[x] || ATTRS.indexOf(x) - ATTRS.indexOf(y));
  return [a, b];
}

/** Kecocokan kandidat dengan fokus pencarian (skala atribut). ASUMSI: pasangan atribut per fokus, lihat docs/ASUMSI.md. */
export function focusScore(p: Player, f: ScoutFocus, date: GameDate) {
  const a = p.attrs, ca = currentAbility(a);
  switch (f) {
    case 'singles': return a.speed + a.stamina;
    case 'doubles': return a.net + a.serve + a.smash;
    case 'attack': return a.smash + a.deception;
    case 'defense': return a.defense + a.consistency;
    case 'raw': return p.pa - ca - ageAt(p.birth, date); // muda & ruang tumbuh besar
    case 'ready': return ca;
    default: return 0;
  }
}

/** Kandidat minimal per gender (selain 2× kursi). */
export const MIN_CANDIDATES = 5;

/** Batas minggu memilih: setelah minggu ini lewat, kursi diisi otomatis. */
export const SCOUTING_DEADLINE_WEEK = 4;

/** Kandidat untuk kursi yang biasanya diisi `newJuniors` (`base` = hasil `newJuniors` negara ini musim ini). */
export function makeScouting(
  base: Player[], country: Country, gen: GeneratorConfig, date: GameDate, rng: Rng, usedNames?: Set<string>, cities?: City[], focus: ScoutFocus = 'balanced',
): Scouting {
  const slots = { M: base.filter((p) => p.gender === 'M').length, F: base.filter((p) => p.gender === 'F').length };
  const candidates: Player[] = [];
  const starRange: Scouting['starRange'] = {};
  const types: Record<string, ScoutType> = {};
  const trueGems: string[] = [], gems: string[] = [];
  const line = gemLine(country, gen);
  for (const g of ['M', 'F'] as const) {
    const n = Math.max(MIN_CANDIDATES, slots[g] * 2);
    // Tipe diundi dulu: mentah = usia termuda, siap pakai = usia tertua, lainnya acak.
    const pool = Array.from({ length: focus === 'balanced' ? n : n * 2 }, (_, i) => {
      const type = SCOUT_TYPES[Math.floor(rng() * SCOUT_TYPES.length)];
      const age = type === 'raw' ? gen.juniorAge.min : type === 'ready' ? gen.juniorAge.max
        : gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      const p = generatePlayer(rng, gen, country, g, age, date, `${country.id}-${g}${date.year}-s${i + 1}`, usedNames, 99, cities);
      types[p.id] = type;
      return p;
    });
    pool.forEach((p) => shapeType(p, types[p.id]));
    // Fokus: dibuat 2× lalu disaring menurut kecocokan + derau (fokus mengarahkan, tidak memastikan).
    const noisy = new Map(pool.map((p) => [p.id, focusScore(p, focus, date) + rng() * 10]));
    const chosen = focus === 'balanced' ? pool : [...pool].sort((x, y) => noisy.get(y.id)! - noisy.get(x.id)!).slice(0, n);
    // Permata: 1 (40 %: 2) kandidat PA tertinggi, sebisa mungkin usia ≤ 16, dinaikkan ke atas ambang; sisanya di bawah ambang.
    const k = rng() < GEM_SECOND ? 2 : 1;
    const young = chosen.filter((p) => ageAt(p.birth, date) <= 16);
    const byPa = (xs: Player[]) => [...xs].sort((a, b) => b.pa - a.pa);
    const picks = [...byPa(young), ...byPa(chosen.filter((p) => !young.includes(p)))].slice(0, k);
    for (const p of chosen) {
      if (picks.includes(p)) { p.pa = Math.min(99, Math.max(p.pa, line + Math.round(rng() * gen.potential.sd * 0.7))); trueGems.push(p.id); }
      else { p.pa = Math.min(p.pa, line - 1); capToPa(p); }
    }
    for (const p of picks) if (rng() < GEM_FLAG) gems.push(p.id);
    const rest = byPa(chosen.filter((p) => !picks.includes(p)));
    if (rest.length && rng() < FALSE_GEM) gems.push(rest[0].id); // permata palsu: kandidat biasa terbaik
    for (const p of chosen) {
      const s = potentialStars(p, date, 0);
      let lo = s - Math.floor(rng() * 5) * 0.5; // posisi perkiraan di dalam rentang diacak
      lo = Math.min(Math.max(lo, 0.5), 3);
      starRange[p.id] = [lo, lo + 2];
      candidates.push(p);
    }
  }
  ensureTraits(candidates);
  const notes = Object.fromEntries(candidates.map((p) => [p.id, traitHints(p, rng)])); // setelah semua kandidat dibuat
  const kept = new Set(candidates.map((p) => p.id));
  return { year: date.year, slots, candidates, starRange, notes,
    types: Object.fromEntries(Object.entries(types).filter(([id]) => kept.has(id))), gems, trueGems };
}

/** Saran pilihan sejumlah kursi per gender: nilai tengah rentang bintang tertinggi lalu kemampuan; `keep` = pilihan manajer dipertahankan. */
export function autoPick(s: Scouting, keep: string[] = []) {
  const out = [...keep];
  for (const g of ['M', 'F'] as const) {
    const pool = s.candidates.filter((p) => p.gender === g);
    const mid = (p: Player) => s.starRange[p.id][0] + s.starRange[p.id][1];
    const rest = pool.filter((p) => !out.includes(p.id)).sort((a, b) => mid(b) - mid(a) || currentAbility(b.attrs) - currentAbility(a.attrs));
    const free = s.slots[g] - pool.filter((p) => out.includes(p.id)).length;
    out.push(...rest.slice(0, Math.max(0, free)).map((p) => p.id));
  }
  return out;
}

/**
 * Rekrut: kandidat terpilih masuk daftar atlet (jumlah bebas), pencarian selesai.
 * Tanpa pilihan (batas minggu lewat / akhir musim): diisi otomatis sejumlah kursi.
 */
export function recruit(state: { players: Player[]; scouting?: Scouting }, ids: string[]) {
  const s = state.scouting;
  if (!s) return;
  const chosen = new Set(ids.length || s.recruited ? ids : autoPick(s)); // sudah rekrut bertahap: tidak diisi otomatis lagi
  state.players.push(...s.candidates.filter((p) => chosen.has(p.id)));
  delete state.scouting;
}

const half = (x: number) => Math.round(x * 2) / 2;
/** Rentang bintang yang terlihat di minggu ini: lebar 2 (minggu 1) menyempit 0,5 per minggu sampai 0,5, tetap memuat perkiraan. */
export function starRangeAt(s: Scouting, p: Player, week: number): [number, number] {
  const est = potentialStars(p, { year: s.year, week: 1 }, 0);
  const w = Math.max(0.5, 2 - 0.5 * (Math.max(1, week) - 1));
  const f = (est - s.starRange[p.id][0]) / 2; // posisi perkiraan di rentang awal dipertahankan
  const lo = Math.min(Math.max(est - half(f * w), 0.5, est - w), 5 - w, est);
  return [lo, lo + w];
}

/** Rekrut bertahap: kandidat terpilih langsung masuk, kursi berkurang, pencarian tetap terbuka. */
export function recruitSome(state: { players: Player[]; scouting?: Scouting }, ids: string[]) {
  const s = state.scouting;
  if (!s || !ids.length) return;
  const set = new Set(ids);
  const picked = s.candidates.filter((p) => set.has(p.id));
  state.players.push(...picked);
  for (const p of picked) s.slots[p.gender] = Math.max(0, s.slots[p.gender] - 1);
  s.candidates = s.candidates.filter((p) => !set.has(p.id));
  s.recruited = (s.recruited ?? 0) + picked.length;
}

/** Awal minggu 2 s/d batas: per gender kandidat bisa mundur (dilirik klub/universitas), tidak di bawah sisa kursi. */
export function withdrawCandidates(s: Scouting, rng: Rng) {
  for (const g of ['M', 'F'] as const) {
    const pool = s.candidates.filter((p) => p.gender === g);
    if (pool.length <= s.slots[g] || rng() >= WITHDRAW_CHANCE) continue;
    const out = pool[Math.floor(rng() * pool.length)];
    s.candidates = s.candidates.filter((p) => p !== out);
    (s.withdrawn ??= []).push(out.name);
  }
}

/** Laporan pemandu: dua atribut terkuat & satu terlemah (urutan ATTRS memecah seri). Selalu benar. */
export function scoutReport(p: Player): { strong: [Attr, Attr]; weak: Attr } {
  const s = [...ATTRS].sort((x, y) => p.attrs[y] - p.attrs[x] || ATTRS.indexOf(x) - ATTRS.indexOf(y));
  return { strong: [s[0], s[1]], weak: s[s.length - 1] };
}

/** Saran nomor: ganda bila tipe/fokus ganda atau rata-rata net+serve+smash jauh di atas speed+stamina. */
export function suggestedEvent(p: Player, type?: ScoutType): Discipline {
  const a = p.attrs;
  const doubles = type === 'doubles' || p.focus === 'D' || (a.net + a.serve + a.smash) / 3 > (a.speed + a.stamina) / 2 + 2;
  return doubles ? (p.gender === 'M' ? 'MD' : 'WD') : p.gender === 'M' ? 'MS' : 'WS';
}

/** Atlet di `pool` yang profil atributnya (selisih dari rata-rata sendiri) paling mirip — kemiripan kosinus. */
export function similarTo(p: Player, pool: Player[]): Player | undefined {
  const vec = (x: Player) => { const m = ATTRS.reduce((s, k) => s + x.attrs[k], 0) / ATTRS.length; return ATTRS.map((k) => x.attrs[k] - m); };
  const pv = vec(p), pn = Math.hypot(...pv) || 1;
  let best: Player | undefined, score = -Infinity;
  for (const q of pool) {
    const qv = vec(q), c = qv.reduce((s, x, i) => s + x * pv[i], 0) / ((Math.hypot(...qv) || 1) * pn);
    if (c > score) { score = c; best = q; }
  }
  return best;
}

/** Pembanding "gayanya mirip": atlet senior aktif segender di top 100 nomor itu (ganda: atlet di pasangan top 100). */
export function similarPool(state: Pick<SeasonState, 'players' | 'pairs' | 'results' | 'date'>, rs: Ruleset, d: Discipline, gender: 'M' | 'F') {
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const pairs = new Map(state.pairs.map((p) => [p.id, p]));
  const ids = computeRanking(state.results, d, absWeek(state.date), rs).slice(0, 100)
    .flatMap((r) => pairs.get(r.entrantId)?.playerIds ?? [r.entrantId]);
  return [...new Set(ids)].map((id) => byId.get(id)).filter((p): p is Player => !!p && p.gender === gender && p.retired === undefined);
}
