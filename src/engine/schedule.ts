import { roundRobin } from './groups';
import type { MatchRound } from './knockout';
import type { Discipline, Tier } from './types';

// Jadwal harian turnamen: babak (dan matchday grup) → hari pertandingan, lalu order of play per lapangan.
// Fungsi murni: dipakai gerbang (turnamen yang dimainkan manajer) & simulasi otomatis (kelelahan antar hari).

/** Posisi laga di babaknya: ke-`i` dari `n` (bagan gugur: urutan bagan; grup: nomor grup), `md` = matchday grup. */
export interface MatchAt { i: number; n: number; md?: number }

const LATE = ['QF', 'SF', 'F'] as const; // tiap babak ini satu hari sendiri, di akhir turnamen
const pow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));
const mainField = (tier: Tier, d: Discipline) => {
  const gs = tier.groupStage?.[d];
  return gs ? pow2(gs.groups * gs.advance) : pow2(tier.drawSize[d]);
};

/** Unit awal satu nomor (sebelum QF): babak kualifikasi, matchday grup (`G1`…), babak utama R128…R16. */
export function earlyUnits(tier: Tier, d: Discipline): string[] {
  const gs = tier.groupStage?.[d];
  const out: string[] = [];
  if (gs) roundRobin(gs.perGroup).forEach((_, k) => out.push(`G${k + 1}`));
  else for (let k = 1; k <= Math.log2(Math.max(1, tier.qualifyingPerSlot)); k++) out.push(`Q${k}`);
  for (let f = mainField(tier, d); f > 8; f /= 2) out.push(`R${f}`);
  return out;
}

export interface DayPlan {
  days: number;
  /** Hari (0 = hari pertama) sebuah laga. Babak yang tidak dikenal (bagan lebih besar dari perkiraan) → hari pertama. */
  day: (d: string, round: MatchRound, at?: MatchAt) => number;
  /** Babak yang dimainkan tiap hari (gabungan semua nomor, urut). */
  rounds: string[][];
}

/**
 * Templat hari: QF/SF/F masing-masing satu hari di akhir (mundur dari hari terakhir); unit awal tiap nomor mengisi hari
 * sebelumnya, rata kanan. Hari tersisa → unit dibagi dua hari (separuh bagan / separuh grup per hari, dari unit pertama);
 * hari kurang → beberapa unit sehari (mis. Q1 & Q2 hari yang sama, atau R32 & R16 di Grade 3).
 * ponytail: tanpa `tier.days` = tiap unit satu hari (tanpa dibagi / digabung).
 */
export function dayPlan(tier: Tier, ds: readonly Discipline[]): DayPlan {
  const late = LATE.filter((r) => ds.some((d) => mainField(tier, d) >= { QF: 8, SF: 4, F: 2 }[r]));
  const units = new Map(ds.map((d) => [d, earlyUnits(tier, d)]));
  const longest = Math.max(0, ...[...units.values()].map((u) => u.length));
  const days = Math.max(tier.days ?? late.length + longest, late.length + 1);
  const early = days - late.length;
  const at = new Map<string, Map<string, [number, number]>>(); // nomor → unit → [hari mulai, lama]
  for (const [d, us] of units) {
    const m = new Map<string, [number, number]>();
    if (us.length > early) us.forEach((u, j) => m.set(u, [Math.floor((j * early) / us.length), 1]));
    else {
      let spare = early - us.length;
      const spans = us.map(() => (spare-- > 0 ? 2 : 1));
      let start = early - spans.reduce((s, x) => s + x, 0);
      us.forEach((u, j) => { m.set(u, [start, spans[j]]); start += spans[j]; });
    }
    at.set(d, m);
  }
  const day = (d: string, round: MatchRound, pos?: MatchAt) => {
    const li = (late as readonly string[]).indexOf(round);
    if (li >= 0) return early + li;
    const u = at.get(d)?.get(round === 'G' ? `G${(pos?.md ?? 0) + 1}` : round);
    if (!u) return 0;
    return u[0] + (u[1] > 1 && pos && pos.i * 2 >= pos.n ? 1 : 0);
  };
  const rounds = Array.from({ length: days }, (_, k) => k >= early ? [late[k - early]] : [...new Set(
    [...at.values()].flatMap((m) => [...m].filter(([, [s, n]]) => k >= s && k < s + n).map(([u]) => u.replace(/^G\d+$/, 'G'))))]);
  return { days, day, rounds };
}

/** Jumlah lapangan sehari: ±9 laga per lapangan, 1–8 lapangan. */
export const courtsFor = (matches: number) => Math.min(8, Math.max(1, Math.ceil(matches / 9)));

/**
 * Order of play satu hari. Masukan sudah urut babak lalu urutan bagan; laga diselang-seling antar nomor (`key`) lalu dibagi
 * ke lapangan per gelombang (±1 jam). Di tiap gelombang laga ber-`prio` tertinggi (unggulan, tuan rumah) di lapangan 1.
 * Atlet dengan dua laga sehari diberi jeda ≥ 1 gelombang (GCR 11.3: istirahat ≥ 60 menit); bila tidak bisa, laganya digeser ke belakang.
 * Hasil sejajar masukan: lapangan (1…) & urutan di lapangan itu (1…).
 */
export function orderOfPlay(list: { key: string; players: string[]; prio: number }[], courts = courtsFor(list.length)): { court: number; order: number }[] {
  const byKey = new Map<string, number[]>();
  list.forEach((m, i) => { const q = byKey.get(m.key); if (q) q.push(i); else byKey.set(m.key, [i]); });
  const seq: number[] = [];
  for (let k = 0; seq.length < list.length; k++) for (const q of byKey.values()) if (k < q.length) seq.push(q[k]);
  // Jeda dua laga sehari: tiap laga ditaruh di gelombang paling awal yang tidak bentrok dengan laga lain atletnya.
  const wave: number[] = [];
  const load: number[] = [];
  const last = new Map<string, number>();
  for (const i of seq) {
    let w = Math.max(0, ...list[i].players.map((p) => (last.has(p) ? last.get(p)! + 2 : 0)));
    while ((load[w] ?? 0) >= courts) w++;
    wave[i] = w;
    load[w] = (load[w] ?? 0) + 1;
    for (const p of list[i].players) last.set(p, w);
  }
  const out: { court: number; order: number }[] = [];
  const waves = new Map<number, number[]>();
  seq.forEach((i) => { const q = waves.get(wave[i]); if (q) q.push(i); else waves.set(wave[i], [i]); });
  const used = new Map<number, number>(); // lapangan → laga terakhir
  for (const [, ms] of [...waves].sort((a, b) => a[0] - b[0]))
    [...ms].sort((a, b) => list[b].prio - list[a].prio).forEach((i, c) => {
      out[i] = { court: c + 1, order: (used.get(c + 1) ?? 0) + 1 };
      used.set(c + 1, out[i].order);
    });
  return out;
}
