import type { Rng } from './rng';
import type { EntrantId, Ruleset, Tier } from './types';

// Penerimaan entry (GCR): urut world ranking pada tanggal acuan; kelebihan → kualifikasi → cadangan.

export interface Candidate {
  id: EntrantId;
  countryId: string;
  rank?: number; // undefined = belum punya ranking
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

/** Urut ranking; ranking sama (atau sama-sama tanpa ranking) → diundi. */
export function sortByRank(cands: Candidate[], rng: Rng): Candidate[] {
  return cands
    .map((c) => ({ c, lot: rng() }))
    .sort((a, b) => (a.c.rank ?? Infinity) - (b.c.rank ?? Infinity) || a.lot - b.lot)
    .map((x) => x.c);
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
export function qualifyingSections(entries: Candidate[], slots: number, perSlot: number, rng: Rng): (Candidate | null)[][] {
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
  return sections;
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
