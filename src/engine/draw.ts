import { shuffle, type Rng } from './rng';
import type { DrawSlot, DrawStep, EntrantId, Ruleset } from './types';

// Drawing main draw sesuai GCR BWF: unggulan, bye, qualifier, pemisahan negara.
// Posisi di sini 1-based (posisi 1 = baris teratas bagan).

export interface DrawEntrant {
  id: EntrantId;
  countryId: string;
  rank?: number;
  wildcard?: boolean;
}

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

export function seedCount(entries: number, ruleset: Ruleset) {
  return ruleset.seeding.find((s) => entries >= s.minEntries)?.seeds ?? 0;
}

/**
 * Kelompok posisi unggulan untuk bagan ukuran N: [[1], [N], [posisi 3/4], [posisi 5–8], [9–16], ...].
 * Tiap kelompok berikutnya mengisi seksi (kuarter, seperdelapan, ...) yang belum berisi unggulan:
 * seksi di paruh atas → posisi teratas seksi, paruh bawah → posisi terbawah seksi.
 */
export function seedPositionGroups(N: number): number[][] {
  const groups: number[][] = [[1], [N]];
  const taken = new Set([1, N]);
  for (let sections = 4; sections <= N / 2; sections *= 2) {
    const size = N / sections;
    const group: number[] = [];
    for (let s = 0; s < sections; s++) {
      const top = s * size + 1, bottom = (s + 1) * size;
      if ([...taken].some((p) => p >= top && p <= bottom)) continue;
      group.push(s < sections / 2 ? top : bottom);
    }
    group.forEach((p) => taken.add(p));
    groups.push(group);
  }
  return groups;
}

/** Lawan babak pertama dari posisi p (1-2, 3-4, ...). */
export const opponentPos = (p: number) => (p % 2 === 1 ? p + 1 : p - 1);

export interface DrawResult {
  slots: DrawSlot[];
  steps: DrawStep[];
}

/**
 * entrants: peserta main draw (langsung + wildcard), urut ranking. qualifiers: jumlah slot lolosan kualifikasi.
 * grade 3: dua entri teratas dari negara yang sama diundi ke paruh berbeda. `separate` false (World Tour 6.4.4): tanpa pemisahan negara.
 */
export function makeDraw(
  entrants: DrawEntrant[], qualifiers: number, grade: number, ruleset: Ruleset, rng: Rng, separate = true,
): DrawResult {
  const n = entrants.length + qualifiers;
  const N = nextPow2(n);
  const steps: DrawStep[] = [];
  const slots: DrawSlot[] = Array.from({ length: N }, (_, i) => ({ pos: i + 1 }));
  const at = (p: number) => slots[p - 1];
  const country = new Map(entrants.map((e) => [e.id, e.countryId]));
  const nSeeds = Math.min(seedCount(n, ruleset), entrants.length);
  const groups = seedPositionGroups(N);
  steps.push({ key: 'step_summary', vars: { N, n, byes: N - n, seeds: nSeeds, q: qualifiers } });

  // 1) Unggulan: 1 & 2 tetap, kelompok berikutnya diundi di dalam kelompoknya.
  //    Urutan posisi "virtual" (dipakai juga untuk bye) = posisi unggulan menurut urutan undian.
  const order: number[] = [];
  for (const g of groups) order.push(...shuffle(rng, g));
  const seedClass = new Map<EntrantId, number>(); // id → indeks kelompok (hanya boleh ditukar dalam kelompok)
  let gi = 0, inGroup = 0;
  for (let s = 0; s < nSeeds; s++) {
    const e = entrants[s];
    const pos = order[s];
    Object.assign(at(pos), { entrant: e.id, seed: s + 1, wildcard: e.wildcard });
    seedClass.set(e.id, gi);
    steps.push({ key: 'step_seed', vars: { s: s + 1, e: e.id, pos }, pos, entrant: e.id });
    if (++inGroup === groups[gi].length) { gi++; inGroup = 0; }
  }

  // 2) Bye: diberikan ke lawan posisi unggulan dulu (1, 2, 3, ...), lalu posisi unggulan "virtual" berikutnya.
  //    ASUMSI: urutan bye di luar unggulan mengikuti urutan undian posisi unggulan virtual.
  let byes = N - n;
  for (const p of order) {
    if (byes === 0) break;
    const o = opponentPos(p);
    if (at(o).entrant || at(o).bye) continue;
    at(o).bye = true;
    byes--;
    steps.push({ key: 'step_bye', vars: { pos: o }, pos: o });
  }

  // 3) Qualifier & non-unggulan diundi ke posisi tersisa.
  const free = shuffle(rng, slots.filter((s) => !s.entrant && !s.bye).map((s) => s.pos));
  for (let q = 0; q < qualifiers; q++) {
    const pos = free.pop()!;
    at(pos).qualifier = true;
    steps.push({ key: 'step_qualifier', vars: { q: q + 1, pos }, pos });
  }
  for (const e of entrants.slice(nSeeds)) {
    const pos = free.pop()!;
    Object.assign(at(pos), { entrant: e.id, wildcard: e.wildcard });
    steps.push({ key: 'step_place', vars: { e: e.id, pos }, pos, entrant: e.id });
  }

  // 4) Pemisahan negara: tukar posisi (hanya sesama kelas: kelompok unggulan sama, atau sesama non-unggulan/qualifier).
  const topTwo = new Map<string, EntrantId[]>(); // grade 3: dua entri teratas per negara
  if (grade === 3)
    for (const e of entrants) {
      const l = topTwo.get(e.countryId) ?? [];
      if (l.length < 2) topTwo.set(e.countryId, [...l, e.id]);
    }
  const posOf = () => new Map(slots.filter((s) => s.entrant).map((s) => [s.entrant!, s.pos]));
  const conflicts = () => {
    let c = 0;
    for (let p = 1; p <= N; p += 2) {
      const a = at(p).entrant, b = at(p + 1).entrant;
      if (a && b && country.get(a) === country.get(b)) c++;
    }
    const pos = posOf();
    for (const [x, y] of topTwo.values())
      if (y && pos.get(x)! <= N / 2 === pos.get(y)! <= N / 2) c++;
    return c;
  };
  const classOf = (s: DrawSlot) => (s.entrant && seedClass.has(s.entrant) ? seedClass.get(s.entrant)! : -1);
  const movable = slots.filter((s) => !s.bye);
  const swap = (a: DrawSlot, b: DrawSlot) => {
    [a.entrant, b.entrant] = [b.entrant, a.entrant];
    [a.seed, b.seed] = [b.seed, a.seed];
    [a.wildcard, b.wildcard] = [b.wildcard, a.wildcard];
    [a.qualifier, b.qualifier] = [b.qualifier, a.qualifier];
  };

  // ponytail: perbaikan rakus O(N²) per putaran; cukup untuk bagan ≤ 128.
  let current = separate ? conflicts() : 0;
  for (let round = 0; current > 0 && round < 50; round++) {
    let improved = false;
    for (const a of movable) {
      for (const b of movable) {
        if (a === b || classOf(a) !== classOf(b)) continue;
        // Unggulan hanya ditukar bila status bye-nya sama (bye tetap milik unggulan teratas).
        if (classOf(a) >= 0 && !at(opponentPos(a.pos)).bye !== !at(opponentPos(b.pos)).bye) continue;
        swap(a, b);
        const c = conflicts();
        if (c < current) {
          current = c;
          improved = true;
          steps.push({ key: 'step_swap', vars: { a: a.pos, b: b.pos } });
          break;
        }
        swap(a, b);
      }
      if (current === 0) break;
    }
    if (!improved) break;
  }
  if (current > 0) steps.push({ key: 'step_clash', vars: { n: current } });
  return { slots, steps };
}
