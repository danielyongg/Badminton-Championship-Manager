import type { Rng } from './rng';
import type { EntrantId, Ruleset, Tier } from './types';

// Penerimaan entry (GCR): urut world ranking pada tanggal acuan; kelebihan → kualifikasi → cadangan.

export interface Candidate {
  id: EntrantId;
  countryId: string;
  rank?: number; // undefined = belum punya ranking
  /** Pemain tanpa ranking: urutan prioritas dari federasinya (kemampuan); undefined = tidak diketahui. */
  strength?: number;
}

export interface EntryList {
  main: Candidate[]; // diterima langsung, urut ranking
  wildcards: Candidate[];
  qualifying: Candidate[]; // urut ranking
  reserves: Candidate[];
  qualifierSlots: number; // slot main draw untuk lolosan kualifikasi
}

/** 1 slot kualifikasi per N slot main draw (N menurut grade). */
export function qualifierSlots(tier: Tier, drawSize: number, ruleset: Ruleset) {
  return tier.qualifyingPerSlot > 0 ? Math.floor(drawSize / ruleset.qualifierRatio[String(tier.grade) as '1']) : 0;
}

/**
 * Urut ranking (ranking sama → diundi). Tanpa ranking (GCR 12.6): di bawah semua yang berperingkat, bergiliran per negara —
 * nomor 1 nasional (prioritas federasi = kemampuan) semua negara diundi, lalu nomor 2 semua negara, dan seterusnya.
 */
export function sortByRank(cands: Candidate[], rng: Rng): Candidate[] {
  const lot = new Map(cands.map((c) => [c.id, rng()]));
  const byLot = (a: Candidate, b: Candidate) => lot.get(a.id)! - lot.get(b.id)!;
  const ranked = cands.filter((c) => c.rank !== undefined).sort((a, b) => a.rank! - b.rank! || byLot(a, b));
  const national = new Map<string, Candidate[]>();
  for (const c of cands) if (c.rank === undefined) national.set(c.countryId, [...(national.get(c.countryId) ?? []), c]);
  const level = new Map<EntrantId, number>();
  for (const list of national.values())
    list.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || byLot(a, b)).forEach((c, i) => level.set(c.id, i));
  const unranked = cands.filter((c) => c.rank === undefined).sort((a, b) => level.get(a.id)! - level.get(b.id)! || byLot(a, b));
  return [...ranked, ...unranked];
}

export function acceptEntries(
  cands: Candidate[], wildcardIds: EntrantId[], tier: Tier, drawSize: number, ruleset: Ruleset, rng: Rng,
): EntryList {
  const wcSet = new Set(wildcardIds.slice(0, tier.wildcards));
  const wildcards = cands.filter((c) => wcSet.has(c.id));
  const pool = sortByRank(cands.filter((c) => !wcSet.has(c.id)), rng);
  const open = drawSize - wildcards.length; // wildcard tak terpakai → kembali ke daftar entry

  if (pool.length <= open) return { main: pool, wildcards, qualifying: [], reserves: [], qualifierSlots: 0 };

  const qSlots = qualifierSlots(tier, drawSize, ruleset);
  const direct = open - qSlots;
  const qSize = qSlots * tier.qualifyingPerSlot;
  return {
    main: pool.slice(0, direct),
    wildcards,
    qualifying: pool.slice(direct, direct + qSize),
    reserves: pool.slice(direct + qSize),
    qualifierSlots: qSlots,
  };
}

/**
 * Bagan kualifikasi: tiap seksi menghasilkan 1 qualifier. Peserta terbaik jadi unggulan seksi
 * (posisi teratas); bila kurang peserta, bye diberikan ke unggulan dulu.
 * ASUMSI: unggulan kualifikasi = satu per seksi, sisanya diundi bebas.
 */
export function qualifyingSections(entries: Candidate[], slots: number, perSlot: number, rng: Rng, separate = false): (Candidate | null)[][] {
  const sections: (Candidate | null)[][] = Array.from({ length: slots }, () => Array(perSlot).fill(null));
  const seeds = entries.slice(0, slots);
  const rest = entries.slice(slots);
  seeds.forEach((s, i) => (sections[i][0] = s));
  let byes = slots * perSlot - entries.length;
  // Bye: lawan R1 unggulan seksi (posisi 1) ditandai kosong, mulai dari unggulan teratas.
  const free: [number, number][] = [];
  for (let i = 0; i < slots; i++)
    for (let p = 1; p < perSlot; p++) {
      if (p === 1 && byes > 0 && i < seeds.length) { byes--; continue; }
      free.push([i, p]);
    }
  // ponytail: bye sisa (seksi sangat kosong) diambil dari akhir daftar posisi bebas
  free.splice(free.length - Math.max(0, byes), Math.max(0, byes));
  const shuffled = rest.map((c) => ({ c, k: rng() })).sort((a, b) => a.k - b.k);
  shuffled.forEach(({ c }, i) => { const [s, p] = free[i]; sections[s][p] = c; });
  if (separate) separateCountries(sections, entries);
  return sections;
}

/**
 * Grade 3 (GCR 12.4, dianjurkan): dua entri teratas tiap negara di seksi berbeda, dan sebisa mungkin sesama negara
 * tidak bertemu di babak pertama kualifikasi. Unggulan seksi & bye tidak dipindah.
 */
function separateCountries(sections: (Candidate | null)[][], entries: Candidate[]) {
  const topTwo = new Map<string, EntrantId[]>();
  for (const e of entries) {
    const l = topTwo.get(e.countryId) ?? [];
    if (l.length < 2) topTwo.set(e.countryId, [...l, e.id]);
  }
  const conflicts = () => {
    let n = 0;
    const sectionOf = new Map<EntrantId, number>();
    sections.forEach((sec, i) => {
      sec.forEach((c) => c && sectionOf.set(c.id, i));
      for (let p = 0; p + 1 < sec.length; p += 2) if (sec[p] && sec[p + 1] && sec[p]!.countryId === sec[p + 1]!.countryId) n++;
    });
    for (const [x, y] of topTwo.values()) if (y && sectionOf.get(x) === sectionOf.get(y)) n++;
    return n;
  };
  const movable = sections.flatMap((sec, s) => sec.map((_, p) => [s, p] as const).filter(([, p]) => p > 0 && sec[p]));
  const swap = ([s1, p1]: readonly [number, number], [s2, p2]: readonly [number, number]) =>
    ([sections[s1][p1], sections[s2][p2]] = [sections[s2][p2], sections[s1][p1]]);
  // ponytail: perbaikan rakus seperti pemisahan di bagan utama (draw.ts); cukup untuk kualifikasi ≤ 64 peserta.
  let current = conflicts();
  for (let round = 0; current > 0 && round < 50; round++) {
    let improved = false;
    for (const a of movable) {
      for (const b of movable) {
        if (a === b) continue;
        swap(a, b);
        const c = conflicts();
        if (c < current) { current = c; improved = true; break; }
        swap(a, b);
      }
      if (current === 0) break;
    }
    if (!improved) break;
  }
}

/**
 * Kuota negara (Kejuaraan Dunia/Olimpiade): tiap negara maks `base` entri, atau s/d `max`
 * bila semua entrinya berperingkat ≤ `topRank`. Daftar diurutkan menurut ranking dulu.
 */
export function applyCountryQuota(cands: Candidate[], quota: { base: number; max: number; topRank: number }): Candidate[] {
  const count: Record<string, number> = {};
  const allTop: Record<string, boolean> = {};
  return [...cands]
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .filter((c) => {
      const n = count[c.countryId] ?? 0;
      const top = (c.rank ?? Infinity) <= quota.topRank && (allTop[c.countryId] ?? true);
      allTop[c.countryId] = top;
      if (n >= quota.max || (n >= quota.base && !top)) return false;
      count[c.countryId] = n + 1;
      return true;
    });
}
