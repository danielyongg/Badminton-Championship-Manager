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

export async function playKnockout(field: (EntrantId | null)[], play: PlayFn, nameOf = mainRoundName): Promise<KnockoutResult> {
  const rounds = [field];
  const reached = new Map<EntrantId, MatchRound | 'W'>();
  let cur = field;
  for (let i = 0; cur.length > 1; i++) {
    const name = nameOf(cur.length, i);
    const next: (EntrantId | null)[] = [];
    for (let k = 0; k < cur.length; k += 2) {
      const a = cur[k], b = cur[k + 1];
      if (a && b) {
        const w = (await play(a, b, name)).winner;
        reached.set(w === 0 ? b : a, name);
        next.push(w === 0 ? a : b);
      } else next.push(a ?? b); // bye / walkover: maju tanpa bertanding
    }
    rounds.push(next);
    cur = next;
  }
  if (cur[0]) reached.set(cur[0], 'W');
  return { rounds, reached };
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
