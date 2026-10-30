import type { MatchRound, PlayFn, PlayResult } from './knockout';
import { orderOfPlay, type DayPlan, type MatchAt } from './schedule';
import { ROUNDS, type EntrantId, type Round } from './types';

// Gerbang babak: nomor-nomor satu turnamen berjalan bersamaan dan menunggu satu sama lain di akhir tiap babak.
// Laga didaftarkan lewat `wrap` (bagan memulai semua laga satu babak sekaligus); begitu tidak ada nomor yang masih
// bergerak, babak paling awal dimainkan berurutan (urut nomor) dan hook `round` dipanggil sebelum & sesudahnya.
// Dengan jadwal harian (`sched`): unit jeda = hari pertandingan; laga hari itu dimainkan menurut order of play.

/**
 * `court`/`order`: lapangan & urutan di lapangan itu (jadwal harian); `round`: babak laga (satu hari bisa berisi beberapa babak);
 * `tv`: laga siaran (Hawk-Eye bila turnamennya memakai Instant Review).
 */
export interface RoundMatch { key: string; sides: [EntrantId, EntrantId]; result?: PlayResult; round?: MatchRound; court?: number; order?: number; tv?: boolean }
/**
 * Satu babak turnamen yang sedang dimainkan manajer. `key` = nomor (MS…) atau format beregu.
 * Fase: `pending` (pasangan laga) → `playing` sebelum tiap laga (`current` = indeks laga itu) → `done` (skor).
 * Jadwal harian: `day` (0 = hari pertama) dari `plan.days` hari, `past` = laga hari-hari sebelumnya (per hari).
 */
export interface RoundShow {
  tournamentId: string; round: MatchRound; phase: 'pending' | 'playing' | 'done'; matches: RoundMatch[]; current?: number;
  day?: number; plan?: DayPlan; past?: RoundMatch[][];
  /** Manajer menarik peserta dari satu nomor: sisa laganya di nomor itu walkover. */
  withdraw?: (key: string, id: EntrantId) => void;
}

/** Jadwal harian untuk gerbang: rencana hari, atlet di balik peserta (jeda dua laga sehari), prioritas lapangan utama. */
export interface GateSchedule {
  plan: DayPlan; who: (key: string, id: EntrantId) => string[]; prio: (key: string, sides: [EntrantId, EntrantId]) => number;
  tv: (key: string, sides: [EntrantId, EntrantId], round: MatchRound) => boolean;
  withdraw: (key: string, id: EntrantId) => void;
}
export type RoundHook = (r: RoundShow) => Promise<void> | null;

/** Urutan babak global: kualifikasi → grup → R256 … F. */
export const roundOrder = (r: MatchRound) => (r === 'G' ? 50 : /^Q\d/.test(r) ? Number(r.slice(1)) : 100 - ROUNDS.indexOf(r as Round));

export function roundGate(tournamentId: string, keys: readonly string[], hook?: RoundHook, sched?: GateSchedule) {
  type Waiting = RoundMatch & { round: MatchRound; at?: MatchAt; unit: number; play: () => PlayResult | Promise<PlayResult>; resolve: (r: PlayResult) => void };
  let waiting: Waiting[] = [];
  let busy = 0; // pop-up yang sedang terbuka (drawing, skuad): nomor lain bisa belum sampai di babak pertamanya
  let flushing = false;
  let queue: Promise<unknown> = Promise.resolve();
  // ponytail: "semua nomor sudah berhenti" = tidak ada daftar baru sampai macrotask berikutnya (semua langkah lain microtask).
  const schedule = () => void setTimeout(flush, 0);

  const past: RoundMatch[][] = []; // jadwal harian: laga per hari yang sudah dimulai
  async function flush() {
    if (flushing || busy || !waiting.length) return;
    flushing = true;
    // Unit terawal: hari (jadwal harian) atau babak. Satu hari bisa datang dalam beberapa gelombang (mis. Q1 lalu Q2).
    const unit = Math.min(...waiting.map((w) => w.unit));
    const now = waiting.filter((w) => w.unit === unit)
      .sort((a, b) => roundOrder(a.round) - roundOrder(b.round) || keys.indexOf(a.key) - keys.indexOf(b.key) || (a.at?.i ?? 0) - (b.at?.i ?? 0));
    waiting = waiting.filter((w) => w.unit !== unit);
    const round = now[0].round;
    const day = sched ? unit : undefined;
    const fresh: RoundMatch[] = now.map(({ key, sides, round }) => ({ key, sides, ...(sched && { round, tv: sched.tv(key, sides, round) }) }));
    let matches = fresh;
    if (sched) {
      const prev = (past[unit] ??= []);
      const top = new Map<number, number>(); // lapangan → urutan terakhir (gelombang sebelumnya hari ini)
      for (const m of prev) top.set(m.court!, Math.max(top.get(m.court!) ?? 0, m.order!));
      const oop = orderOfPlay(now.map((w) => ({ key: w.key, players: w.sides.flatMap((id) => sched.who(w.key, id)), prio: sched.prio(w.key, w.sides) })));
      fresh.forEach((m, i) => Object.assign(m, { court: oop[i].court, order: oop[i].order + (top.get(oop[i].court) ?? 0) }));
      const seq = fresh.map((_, i) => i).sort((a, b) => fresh[a].order! - fresh[b].order! || fresh[a].court! - fresh[b].court!);
      now.splice(0, now.length, ...seq.map((i) => now[i]));
      fresh.splice(0, fresh.length, ...seq.map((i) => fresh[i]));
      prev.push(...fresh);
      matches = prev;
    }
    const base = { tournamentId, round, ...(sched && { day, plan: sched.plan, past: past.slice(0, unit), withdraw: sched.withdraw }) };
    const off = matches.length - fresh.length;
    await hook?.({ ...base, phase: 'pending', matches });
    for (const [i, w] of now.entries()) {
      await hook?.({ ...base, phase: 'playing', matches, current: off + i });
      fresh[i].result = await w.play();
    }
    await hook?.({ ...base, phase: 'done', matches });
    flushing = false;
    now.forEach((w, i) => w.resolve(matches[i].result!));
    schedule();
  }

  return {
    /** PlayFn yang menunggu gerbang (dipakai dengan bagan `parallel`). */
    wrap: (key: string, play: PlayFn): PlayFn =>
    (a, b, round, at) => new Promise<PlayResult>((resolve) => {
        // Tanpa jadwal (beregu): satu matchday grup = satu unit tersendiri.
        const unit = sched ? sched.plan.day(key, round, at) : roundOrder(round) + (round === 'G' ? (at?.md ?? 0) / 10 : 0);
        waiting.push({ key, sides: [a, b], round, at, unit, play: () => play(a, b, round, at), resolve });
        schedule();
      }),
    /** Pop-up satu per satu (drawing, skuad); gerbang tidak memulai babak selama pop-up terbuka. */
    serial<T>(fn: () => T | Promise<T>): Promise<T> {
      busy++;
      const p = queue.then(fn);
      queue = p.catch(() => {});
      return p.finally(() => { busy--; schedule(); });
    },
  };
}
