import type { MatchRound, PlayFn, PlayResult } from './knockout';
import { ROUNDS, type EntrantId, type Round } from './types';

// Gerbang babak: nomor-nomor satu turnamen berjalan bersamaan dan menunggu satu sama lain di akhir tiap babak.
// Laga didaftarkan lewat `wrap` (bagan memulai semua laga satu babak sekaligus); begitu tidak ada nomor yang masih
// bergerak, babak paling awal dimainkan berurutan (urut nomor) dan hook `round` dipanggil sebelum & sesudahnya.

export interface RoundMatch { key: string; sides: [EntrantId, EntrantId]; result?: PlayResult }
/**
 * Satu babak turnamen yang sedang dimainkan manajer. `key` = nomor (MS…) atau format beregu.
 * Fase: `pending` (pasangan laga) → `playing` sebelum tiap laga (`current` = indeks laga itu) → `done` (skor).
 */
export interface RoundShow { tournamentId: string; round: MatchRound; phase: 'pending' | 'playing' | 'done'; matches: RoundMatch[]; current?: number }
export type RoundHook = (r: RoundShow) => Promise<void> | null;

/** Urutan babak global: kualifikasi → grup → R256 … F. */
export const roundOrder = (r: MatchRound) => (r === 'G' ? 50 : /^Q\d/.test(r) ? Number(r.slice(1)) : 100 - ROUNDS.indexOf(r as Round));

export function roundGate(tournamentId: string, keys: readonly string[], hook?: RoundHook) {
  type Waiting = RoundMatch & { round: MatchRound; play: () => PlayResult | Promise<PlayResult>; resolve: (r: PlayResult) => void };
  let waiting: Waiting[] = [];
  let busy = 0; // pop-up yang sedang terbuka (drawing, skuad): nomor lain bisa belum sampai di babak pertamanya
  let flushing = false;
  let queue: Promise<unknown> = Promise.resolve();
  // ponytail: "semua nomor sudah berhenti" = tidak ada daftar baru sampai macrotask berikutnya (semua langkah lain microtask).
  const schedule = () => void setTimeout(flush, 0);

  async function flush() {
    if (flushing || busy || !waiting.length) return;
    flushing = true;
    const round = waiting.reduce((a, w) => (roundOrder(w.round) < roundOrder(a) ? w.round : a), waiting[0].round);
    const now = waiting.filter((w) => w.round === round).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
    waiting = waiting.filter((w) => w.round !== round);
    const matches: RoundMatch[] = now.map(({ key, sides }) => ({ key, sides }));
    await hook?.({ tournamentId, round, phase: 'pending', matches });
    for (const [i, w] of now.entries()) {
      await hook?.({ tournamentId, round, phase: 'playing', matches, current: i });
      matches[i].result = await w.play();
    }
    await hook?.({ tournamentId, round, phase: 'done', matches });
    flushing = false;
    now.forEach((w, i) => w.resolve(matches[i].result!));
    schedule();
  }

  return {
    /** PlayFn yang menunggu gerbang (dipakai dengan bagan `parallel`). */
    wrap: (key: string, play: PlayFn): PlayFn => (a, b, round) =>
      new Promise<PlayResult>((resolve) => { waiting.push({ key, sides: [a, b], round, play: () => play(a, b, round), resolve }); schedule(); }),
    /** Pop-up satu per satu (drawing, skuad); gerbang tidak memulai babak selama pop-up terbuka. */
    serial<T>(fn: () => T | Promise<T>): Promise<T> {
      busy++;
      const p = queue.then(fn);
      queue = p.catch(() => {});
      return p.finally(() => { busy--; schedule(); });
    },
  };
}
