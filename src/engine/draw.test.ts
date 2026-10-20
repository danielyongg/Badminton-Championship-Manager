import { describe, expect, it } from 'vitest';
import { makeDraw, opponentPos, seedPositionGroups, type DrawEntrant } from './draw';
import { acceptEntries, qualifyingSections, sortByRank, type Candidate } from './entry';
import { fillQualifiers, playKnockout, slotField } from './knockout';
import { BWF_2026 } from './presets/bwf2026';
import { makeRng } from './rng';
import type { DrawSlot } from './types';

const rs = BWF_2026;
const tier = (id: string) => rs.tiers.find((t) => t.id === id)!;
const entrants = (n: number, countries: string[] = []): DrawEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, countryId: countries[i] ?? `C${i}`, rank: i + 1 }));
const seedPos = (slots: DrawSlot[], seed: number) => slots.find((s) => s.seed === seed)!.pos;
const r1Conflicts = (slots: DrawSlot[], country: Map<string, string>) => {
  let c = 0;
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i].entrant, b = slots[i + 1].entrant;
    if (a && b && country.get(a) === country.get(b)) c++;
  }
  return c;
};

describe('posisi unggulan', () => {
  it('kelompok posisi bagan 32 dan 64', () => {
    expect(seedPositionGroups(32)).toEqual([[1], [32], [9, 24], [5, 13, 20, 28], [3, 7, 11, 15, 18, 22, 26, 30]]);
    expect(seedPositionGroups(64).slice(0, 5)).toEqual([[1], [64], [17, 48], [9, 25, 40, 56], [5, 13, 21, 29, 36, 44, 52, 60]]);
  });

  it.each([1, 2, 3, 4, 5])('draw 32 (8 unggulan) — seed %i', (seed) => {
    const { slots } = makeDraw(entrants(32), 0, 2, rs, makeRng(seed));
    expect(seedPos(slots, 1)).toBe(1);
    expect(seedPos(slots, 2)).toBe(32);
    expect([seedPos(slots, 3), seedPos(slots, 4)].sort((a, b) => a - b)).toEqual([9, 24]);
    expect([5, 6, 7, 8].map((s) => seedPos(slots, s)).sort((a, b) => a - b)).toEqual([5, 13, 20, 28]);
    expect(slots.filter((s) => s.seed).length).toBe(8);
  });

  it.each([1, 2, 3])('draw 48 (bagan 64, 16 bye, 8 unggulan) — seed %i', (seed) => {
    const { slots } = makeDraw(entrants(44), 4, 2, rs, makeRng(seed));
    expect(slots).toHaveLength(64);
    expect(seedPos(slots, 1)).toBe(1);
    expect(seedPos(slots, 2)).toBe(64);
    expect([seedPos(slots, 3), seedPos(slots, 4)].sort((a, b) => a - b)).toEqual([17, 48]);
    expect([5, 6, 7, 8].map((s) => seedPos(slots, s)).sort((a, b) => a - b)).toEqual([9, 25, 40, 56]);
    // Semua unggulan mendapat bye; 8 bye sisanya di lawan posisi unggulan virtual 9–16.
    for (let s = 1; s <= 8; s++) expect(slots[opponentPos(seedPos(slots, s)) - 1].bye).toBe(true);
    const virtual = [5, 13, 21, 29, 36, 44, 52, 60].map((p) => slots[opponentPos(p) - 1].bye);
    expect(virtual.every(Boolean)).toBe(true);
    expect(slots.filter((s) => s.bye)).toHaveLength(16);
    expect(slots.filter((s) => s.qualifier)).toHaveLength(4);
  });

  it.each([1, 2, 3])('draw 64 (16 unggulan) — seed %i', (seed) => {
    const { slots } = makeDraw(entrants(64), 0, 2, rs, makeRng(seed));
    const groups = seedPositionGroups(64);
    const sorted = (seeds: number[]) => seeds.map((s) => seedPos(slots, s)).sort((a, b) => a - b);
    expect(sorted([1])).toEqual(groups[0]);
    expect(sorted([2])).toEqual(groups[1]);
    expect(sorted([3, 4])).toEqual(groups[2]);
    expect(sorted([5, 6, 7, 8])).toEqual(groups[3]);
    expect(sorted([9, 10, 11, 12, 13, 14, 15, 16])).toEqual(groups[4]);
  });

  it('bye diberikan ke unggulan teratas dulu', () => {
    const { slots } = makeDraw(entrants(29), 0, 2, rs, makeRng(1)); // 3 bye
    const byeSeeds = [1, 2, 3, 4].filter((s) => slots[opponentPos(seedPos(slots, s)) - 1].bye);
    expect(byeSeeds).toEqual([1, 2, 3]);
  });
});

describe('pemisahan negara', () => {
  it('tidak ada pertemuan senegara di R1 bila masih memungkinkan (200 undian)', () => {
    const countries = [...Array(8).fill('CHN'), ...Array(6).fill('INA'), ...Array(5).fill('JPN'), ...Array(4).fill('DEN')];
    const rng = makeRng(11);
    for (let i = 0; i < 200; i++) {
      // Urutan negara diacak tiap undian agar unggulan juga ikut senegara.
      const cs = [...countries, ...Array(9).fill(0).map((_, k) => `X${k}`)].sort(() => rng() - 0.5);
      const es = entrants(32, cs);
      const { slots } = makeDraw(es, 0, 2, rs, makeRng(i));
      expect(r1Conflicts(slots, new Map(es.map((e) => [e.id, e.countryId])))).toBe(0);
    }
  });

  it('tetap ada R1 senegara bila mustahil (24 dari 32 negara sama)', () => {
    const es = entrants(32, Array(24).fill('CHN'));
    const { slots, steps } = makeDraw(es, 0, 2, rs, makeRng(1));
    expect(r1Conflicts(slots, new Map(es.map((e) => [e.id, e.countryId])))).toBe(8); // minimum mungkin
    expect(steps.at(-1)!.key).toBe('step_clash');
  });

  it('Grade 3: dua entri teratas senegara di paruh berbeda', () => {
    for (let i = 0; i < 50; i++) {
      // e9 & e10 (non-unggulan) senegara dan teratas dari negaranya.
      const cs = Array.from({ length: 32 }, (_, k) => (k === 8 || k === 9 || k === 20 ? 'DEN' : `C${k}`));
      const { slots } = makeDraw(entrants(32, cs), 0, 3, rs, makeRng(i));
      const pos = (id: string) => slots.find((s) => s.entrant === id)!.pos;
      expect(pos('e9') <= 16).not.toBe(pos('e10') <= 16);
    }
  });
});

describe('entry & kualifikasi', () => {
  const cands = (n: number): Candidate[] => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, countryId: 'X', rank: i + 1 }));

  it('Super 500, draw 32: 4 slot kualifikasi (1 per 8), 1 wildcard', () => {
    const e = acceptEntries(cands(60), ['c50'], tier('S500'), 32, rs, makeRng(1));
    expect(e.qualifierSlots).toBe(4);
    expect(e.wildcards.map((c) => c.id)).toEqual(['c50']);
    expect(e.main).toHaveLength(27);
    expect(e.main[0].id).toBe('c1');
    expect(e.qualifying).toHaveLength(16);
    expect(e.reserves).toHaveLength(60 - 27 - 1 - 16);
  });

  it('Grade 3: 1 slot kualifikasi per 4 → 8 qualifier di draw 32', () => {
    expect(acceptEntries(cands(80), [], tier('IC'), 32, rs, makeRng(1)).qualifierSlots).toBe(8);
  });

  it('entri sedikit → semua langsung main draw, tanpa kualifikasi', () => {
    const e = acceptEntries(cands(20), [], tier('S300'), 32, rs, makeRng(1));
    expect(e.main).toHaveLength(20);
    expect(e.qualifying).toHaveLength(0);
  });

  it('ranking sama → diundi (urutan tergantung undian)', () => {
    const tied: Candidate[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, countryId: 'X', rank: 5 }));
    const orders = new Set([1, 2, 3, 4, 5].map((s) => acceptEntries(tied, [], tier('S300'), 32, rs, makeRng(s)).main.map((c) => c.id).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it('bagan kualifikasi: unggulan di tiap seksi, bye ke unggulan', () => {
    const secs = qualifyingSections(cands(14), 4, 4, makeRng(1));
    expect(secs.map((s) => s[0]!.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(secs[0][1]).toBeNull();
    expect(secs[1][1]).toBeNull();
    expect(secs.flat().filter(Boolean)).toHaveLength(14);
  });
});

describe('Super 100 tunggal putra', () => {
  it('48 = 40 langsung + 8 qualifier; nomor lain 28 + 4', () => {
    const cands = (n: number): Candidate[] => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, countryId: 'X', rank: i + 1 }));
    const ms = acceptEntries(cands(100), [], tier('S100'), 48, rs, makeRng(1), 'MS');
    expect([ms.main.length, ms.qualifierSlots, ms.qualifying.length]).toEqual([40, 8, 32]);
    const md = acceptEntries(cands(100), [], tier('S100'), 32, rs, makeRng(1), 'MD');
    expect([md.main.length, md.qualifierSlots]).toEqual([28, 4]);
  });
});

describe('aturan grade 3 (GCR)', () => {
  it('12.6: tanpa ranking bergiliran per negara (nomor 1 nasional semua negara dulu)', () => {
    const c = (id: string, countryId: string, strength: number): Candidate => ({ id, countryId, strength });
    const out = sortByRank([c('a1', 'A', 90), c('a2', 'A', 85), c('a3', 'A', 80), c('b1', 'B', 50), c('c1', 'C', 40), { id: 'r', countryId: 'A', rank: 300 }], makeRng(2));
    expect(out[0].id).toBe('r');
    expect(new Set(out.slice(1, 4).map((x) => x.id))).toEqual(new Set(['a1', 'b1', 'c1']));
    expect(out.slice(4).map((x) => x.id)).toEqual(['a2', 'a3']);
  });

  it('12.4: dua teratas tiap negara di seksi kualifikasi berbeda, sesama negara tidak bertemu di R1', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const list: Candidate[] = Array.from({ length: 32 }, (_, i) => ({ id: `q${i + 1}`, countryId: ['X', 'Y', 'Z', 'W'][i % 4], rank: i + 1 }));
      const secs = qualifyingSections(list, 8, 4, makeRng(seed), true);
      const sectionOf = (id: string) => secs.findIndex((s) => s.some((c) => c?.id === id));
      for (const k of ['X', 'Y', 'Z', 'W']) {
        const [first, second] = list.filter((c) => c.countryId === k);
        expect(sectionOf(first.id)).not.toBe(sectionOf(second.id));
      }
      for (const sec of secs) for (let p = 0; p < 4; p += 2) expect(sec[p]!.countryId).not.toBe(sec[p + 1]!.countryId);
    }
  });
});

describe('bagan gugur', () => {
  it('juara, babak tersingkir, bye lalu kalah di R2 tercatat di babak R2', async () => {
    const { slots } = makeDraw(entrants(28), 2, 2, rs, makeRng(3));
    const filled = fillQualifiers(slots, ['q1', 'q2'], makeRng(1));
    // Peringkat kecil selalu menang; qualifier selalu kalah.
    const num = (id: string) => (id.startsWith('q') ? 999 : Number(id.slice(1)));
    const res = await playKnockout(slotField(filled), (a, b) => ({ winner: num(a) < num(b) ? 0 : 1, scores: [] }));
    expect(res.reached.get('e1')).toBe('W');
    expect(res.reached.get('e2')).toBe('F');
    expect(res.rounds.at(-1)).toEqual(['e1']);
    // Unggulan 3 dapat bye di R32, lalu kalah dari unggulan 1/2 di SF → tercatat SF.
    expect(res.reached.get('e3')).toBe('SF');
    expect([...res.reached.values()].filter((r) => r === 'R32')).toHaveLength(14);
  });
});
