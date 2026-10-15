import { potentialStars } from './career';
import { currentAbility, generatePlayer } from './generator';
import type { Rng } from './rng';
import type { Country, GameDate, GeneratorConfig, Player } from './types';

// Pencarian bakat junior negara manajer: kandidat 2× kursi di akhir musim; manajer merekrut berapa pun, atau diisi otomatis sejumlah kursi.

export interface Scouting {
  year: number;
  slots: { M: number; F: number };
  candidates: Player[];
  /** Rentang bintang potensi yang ditampilkan per kandidat (lebar 2 bintang, memuat perkiraan potensi). */
  starRange: Record<string, [number, number]>;
}

/** Kandidat minimal per gender (selain 2× kursi). */
export const MIN_CANDIDATES = 5;

/** Batas minggu memilih: setelah minggu ini lewat, kursi diisi otomatis. */
export const SCOUTING_DEADLINE_WEEK = 4;

/** Kandidat untuk kursi yang biasanya diisi `newJuniors` (`base` = hasil `newJuniors` negara ini musim ini). */
export function makeScouting(base: Player[], country: Country, gen: GeneratorConfig, date: GameDate, rng: Rng): Scouting {
  const slots = { M: base.filter((p) => p.gender === 'M').length, F: base.filter((p) => p.gender === 'F').length };
  const candidates: Player[] = [];
  const starRange: Scouting['starRange'] = {};
  for (const g of ['M', 'F'] as const) {
    const n = Math.max(MIN_CANDIDATES, slots[g] * 2);
    for (let i = 0; i < n; i++) {
      const age = gen.juniorAge.min + Math.floor(rng() * (gen.juniorAge.max - gen.juniorAge.min + 1));
      const p = generatePlayer(rng, gen, country, g, age, date, `${country.id}-${g}${date.year}-s${i + 1}`);
      const s = potentialStars(p, date, 0);
      let lo = s - Math.floor(rng() * 5) * 0.5; // posisi perkiraan di dalam rentang diacak
      lo = Math.min(Math.max(lo, 0.5), 3);
      starRange[p.id] = [lo, lo + 2];
      candidates.push(p);
    }
  }
  return { year: date.year, slots, candidates, starRange };
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
  const chosen = new Set(ids.length ? ids : autoPick(s));
  state.players.push(...s.candidates.filter((p) => chosen.has(p.id)));
  delete state.scouting;
}
