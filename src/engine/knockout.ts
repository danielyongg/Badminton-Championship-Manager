import { shuffle, type Rng } from './rng';
import type { DrawSlot, EntrantId, Match, Round } from './types';

// Menjalankan bagan gugur. `play` memutuskan pemenang (mesin pertandingan / Live) → mesin ini tidak tahu soal atribut.

export type MatchRound = Match['round'];
export type PlayResult = { winner: 0 | 1; scores: [number, number][] };
/** Bisa sinkron (Auto) atau Promise (Live: menunggu manajer menyelesaikan laga). */
export type PlayFn = (a: EntrantId, b: EntrantId, round: MatchRound) => PlayResult | Promise<PlayResult>;

/** Nama babak menurut jumlah peserta di babak itu: 2 → F, 4 → SF, 8 → QF, lainnya R16/R32/... */
export const mainRoundName = (field: number, _index: number): MatchRound =>
  field === 2 ? 'F' : field === 4 ? 'SF' : field === 8 ? 'QF' : (`R${field}` as Round);
export const qualRoundName = (_field: number, index: number): MatchRound => `Q${index + 1}` as MatchRound;

export interface KnockoutResult {
  rounds: (EntrantId | null)[][]; // rounds[0] = posisi awal; terakhir = [juara]
  reached: Map<EntrantId, MatchRound | 'W'>; // babak terakhir yang dimainkan (kalah di sana) atau 'W'
}

/**
 * `parallel`: semua laga satu babak dimulai bersamaan (gerbang babak mengumpulkannya sebelum dimainkan).
 * `rounds`: larik yang diisi selama bagan berjalan (halaman turnamen bisa dibuka di tengah turnamen); babak berikutnya
 * ditambahkan saat dimulai dan terisi pemenang satu per satu.
 */
export async function playKnockout(field: (EntrantId | null)[], play: PlayFn, nameOf = mainRoundName, parallel = false, rounds: (EntrantId | null)[][] = []): Promise<KnockoutResult> {
  rounds.push(field);
  const reached = new Map<EntrantId, MatchRound | 'W'>();
  let cur = field;
  for (let i = 0; cur.length > 1; i++) {
    const name = nameOf(cur.length, i);
    const next: (EntrantId | null)[] = [];
    rounds.push(next);
    const pending: Promise<void>[] = [];
    for (let k = 0; k < cur.length; k += 2) {
      const a = cur[k], b = cur[k + 1], at = next.length;
      if (a && b) {
        const settle = (r: PlayResult) => { reached.set(r.winner === 0 ? b : a, name); next[at] = r.winner === 0 ? a : b; };
        const r = play(a, b, name);
        next.push(null);
        if (parallel) pending.push(Promise.resolve(r).then(settle)); else settle(await r);
      } else next.push(a ?? b); // bye / walkover: maju tanpa bertanding
    }
    await Promise.all(pending);
    cur = next;
  }
  if (cur[0]) reached.set(cur[0], 'W');
  return { rounds, reached };
}

/** Jalankan `f` untuk tiap elemen: bersamaan (gerbang babak) atau berurutan (jalur otomatis, urutan RNG tetap). */
export async function each<T, R>(parallel: boolean | undefined, xs: T[], f: (x: T, i: number) => Promise<R>): Promise<R[]> {
  if (parallel) return Promise.all(xs.map((x, i) => f(x, i)));
  const out: R[] = [];
  for (const [i, x] of xs.entries()) out.push(await f(x, i));
  return out;
}

/** Isi posisi qualifier dengan lolosan kualifikasi (diundi bebas). Qualifier kosong → bye. */
export function fillQualifiers(slots: DrawSlot[], qualifiers: (EntrantId | null)[], rng: Rng): DrawSlot[] {
  const q = shuffle(rng, qualifiers);
  return slots.map((s) => {
    if (!s.qualifier) return s;
    const id = q.pop();
    return id ? { ...s, entrant: id } : { ...s, qualifier: false, bye: true };
  });
}

export const slotField = (slots: DrawSlot[]) => slots.map((s) => s.entrant ?? null);
