import { potentialStars } from './career';
import { ageAt, currentAbility, generatePlayer } from './generator';
import type { Rng } from './rng';
import { ensureTraits, traitHints, type TraitId } from './traits';
import { ATTRS, type Attr, type City, type Country, type GameDate, type GeneratorConfig, type Player } from './types';

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
}

export type ScoutFocus = 'balanced' | 'singles' | 'doubles' | 'attack' | 'defense' | 'raw' | 'ready';
export const SCOUT_FOCI: ScoutFocus[] = ['balanced', 'singles', 'doubles', 'attack', 'defense', 'raw', 'ready'];
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
  for (const g of ['M', 'F'] as const) {
    const n = Math.max(MIN_CANDIDATES, slots[g] * 2);
    // Fokus: dibuat 2× lalu disaring menurut kecocokan + derau (fokus mengarahkan, tidak memastikan).
    const pool = Array.from({ length: focus === 'balanced' ? n : n * 2 }, (_, i) => {
      const age = gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      return generatePlayer(rng, gen, country, g, age, date, `${country.id}-${g}${date.year}-s${i + 1}`, usedNames, 99, cities);
    });
    const noisy = new Map(pool.map((p) => [p.id, focusScore(p, focus, date) + rng() * 10]));
    const chosen = focus === 'balanced' ? pool : [...pool].sort((x, y) => noisy.get(y.id)! - noisy.get(x.id)!).slice(0, n);
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
  return { year: date.year, slots, candidates, starRange, notes };
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
