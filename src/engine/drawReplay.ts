import type { DrawStep, EntrantId } from './types';

// Live drawing: susun ulang keadaan undian dari langkah-langkah yang tercatat (bagan gugur atau grup pot).

export interface DrawBoard {
  /** Bagan gugur: posisi → isi (posisi dimulai dari 1). */
  /** `tag`: asal posisi di undian babak gugur beregu (1A = juara Grup A, 2B = runner-up Grup B). */
  slots: Record<number, { entrant?: EntrantId; seed?: number; bye?: boolean; qualifier?: boolean; tag?: string }>;
  /** Format grup: huruf grup → anggota (urut pot). */
  groups: Record<string, EntrantId[]>;
}

/** Keadaan setelah `upTo` langkah pertama. */
export function replayDraw(steps: DrawStep[], upTo = steps.length): DrawBoard {
  const board: DrawBoard = { slots: {}, groups: {} };
  const at = (p: number) => (board.slots[p] ??= {});
  for (const s of steps.slice(0, upTo)) {
    const v = s.vars;
    if (s.key === 'step_seed') Object.assign(at(s.pos!), { entrant: s.entrant, seed: Number(v.s) });
    else if (s.key === 'step_place') at(s.pos!).entrant = s.entrant;
    else if (s.key === 'step_winner' || s.key === 'step_runnerUp') Object.assign(at(s.pos!), { entrant: s.entrant, tag: `${v.n ?? 1}${v.g}` });
    else if (s.key === 'step_bye') at(s.pos!).bye = true;
    else if (s.key === 'step_qualifier') at(s.pos!).qualifier = true;
    else if (s.key === 'step_swap') {
      const a = Number(v.a), b = Number(v.b);
      [board.slots[a], board.slots[b]] = [at(b), at(a)];
    } else if (s.key === 'step_pot') (board.groups[String(v.g)] ??= []).push(s.entrant!);
  }
  return board;
}

/** Tahap ("mangkuk") tiap langkah: pot unggulan 1–2, 3–4, 5–8, …; bye; qualifier; non-unggulan; pemisahan negara; Pot k. */
export function phaseOf(s: DrawStep): string {
  if (s.key === 'step_seed') {
    const pot = Math.max(0, Math.ceil(Math.log2(Number(s.vars.s))) - 1); // 1–2 → 0, 3–4 → 1, 5–8 → 2, 9–16 → 3
    return `seed${pot}`;
  }
  if (s.key === 'step_pot') return `pot${s.vars.k}`;
  return s.key; // step_summary, step_bye, step_qualifier, step_place, step_swap, step_clash
}

/** Peserta yang masih ada di mangkuk tahap langkah ke-`index` (belum diundi). */
export function bowlAt(steps: DrawStep[], index: number): EntrantId[] {
  const s = steps[index];
  if (!s) return [];
  const phase = phaseOf(s);
  return steps.slice(index).filter((x) => phaseOf(x) === phase && x.entrant).map((x) => x.entrant!);
}
