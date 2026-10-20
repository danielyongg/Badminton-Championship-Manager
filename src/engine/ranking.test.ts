import { describe, expect, it } from 'vitest';
import { playKnockout } from './knockout';
import { BWF_2026 } from './presets/bwf2026';
import { absWeek, computeRace, computeRanking, expiringPoints, knockoutResults, pointsFor } from './ranking';
import type { DrawSlot, RankingEntry } from './types';

const rs = BWF_2026;
const tier = (id: string) => rs.tiers.find((t) => t.id === id)!;
let n = 0;
const entry = (entrantId: string, points: number, week = 10, extra: Partial<RankingEntry> = {}): RankingEntry => ({
  entrantId, points, discipline: 'MS', tournamentId: `t${n++}`, tierId: 'S300', year: 2026, week,
  expiresAbsWeek: absWeek({ year: 2026, week }) + 52, ...extra,
});
const now = absWeek({ year: 2026, week: 52 });
const event = (tierId: string, prizeUsd = tier(tierId).prizeUsd) => ({ id: 'ev', name: 'Ev', cityId: 'x', week: 10, tierId, prizeUsd });

describe('poin', () => {
  it('tabel poin & bonus Super 1000', () => {
    expect(pointsFor(tier('S1000'), 1450000, 'W')).toBe(12000);
    expect(pointsFor(tier('S1000'), 1450000 + 300000, 'W')).toBe(12700);
    expect(pointsFor(tier('S1000'), 1450000 + 500000, 'F')).toBe(11500);
    expect(pointsFor(tier('WC'), 0, 'R256')).toBe(300);
  });

  // Bagan 4: e1 vs bye, e2 vs e3 (e3 wildcard), e4 kosong → e1 dapat bye/walkover.
  const slots: DrawSlot[] = [
    { pos: 1, entrant: 'e1' }, { pos: 2, bye: true },
    { pos: 3, entrant: 'e2' }, { pos: 4, entrant: 'e3', wildcard: true },
  ];
  const run = (winner: string) => playKnockout(slots.map((s) => s.entrant ?? null), (a, b) => ({ winner: a === winner ? 0 : b === winner ? 1 : a < b ? 0 : 1, scores: [] }));

  it('bye/walkover R1 lalu kalah di R2 → poin R2 (di bagan 4 = F)', async () => {
    const res = knockoutResults(await run('e2'), slots, event('S300'), tier('S300'), 'MS', { year: 2026, week: 10 }, rs);
    expect(res.find((r) => r.entrantId === 'e1')!.points).toBe(tier('S300').points[1]); // F
  });

  it('wildcard kalah di R1 Super 500/750/300 → 0 poin; di Super 1000 tetap dapat poin', async () => {
    const r500 = knockoutResults(await run('e2'), slots, event('S500'), tier('S500'), 'MS', { year: 2026, week: 10 }, rs);
    expect(r500.find((r) => r.entrantId === 'e3')!.points).toBe(0);
    const r750 = knockoutResults(await run('e2'), slots, event('S750'), tier('S750'), 'MS', { year: 2026, week: 10 }, rs);
    expect(r750.find((r) => r.entrantId === 'e3')!.points).toBe(0);
    const r300 = knockoutResults(await run('e2'), slots, event('S300'), tier('S300'), 'MS', { year: 2026, week: 10 }, rs);
    expect(r300.find((r) => r.entrantId === 'e3')!.points).toBe(0); // GCR 7.11
    const r1000 = knockoutResults(await run('e2'), slots, event('S1000'), tier('S1000'), 'MS', { year: 2026, week: 10 }, rs);
    expect(r1000.find((r) => r.entrantId === 'e3')!.points).toBe(tier('S1000').points[2]); // SF
  });

  it('wildcard yang menang di R1 lalu kalah tetap dapat poin', async () => {
    const res = knockoutResults(await run('e3'), slots, event('S500'), tier('S500'), 'MS', { year: 2026, week: 10 }, rs);
    expect(res.find((r) => r.entrantId === 'e3')!.points).toBe(tier('S500').points[0]);
  });
});

describe('ranking dunia', () => {
  it('poin kedaluwarsa tepat 52 minggu setelah turnamen', () => {
    const es = [entry('a', 1000, 10)];
    expect(computeRanking(es, 'MS', absWeek({ year: 2027, week: 9 }), rs)).toHaveLength(1);
    expect(computeRanking(es, 'MS', absWeek({ year: 2027, week: 10 }), rs)).toHaveLength(0);
  });

  it('≤ 10 turnamen semua dihitung, ≥ 11 hanya 10 terbaik', () => {
    const ten = Array.from({ length: 10 }, (_, i) => entry('a', (i + 1) * 100));
    expect(computeRanking(ten, 'MS', now, rs)[0].points).toBe(5500);
    const twelve = Array.from({ length: 12 }, (_, i) => entry('b', (i + 1) * 100));
    const row = computeRanking(twelve, 'MS', now, rs)[0];
    expect(row.points).toBe(7500); // 300..1200
    expect(row.tournamentsPlayed).toBe(12);
  });

  it('tie-break: poin sama → lebih banyak turnamen di atas; masih sama → peringkat sama, nomor berikutnya dilewati', () => {
    const es = [
      entry('few', 1000), // 1000 dari 1 turnamen
      entry('many', 500), entry('many', 500), // 1000 dari 2 turnamen
      entry('x', 400), entry('x', 400), entry('y', 400), entry('y', 400), // seri penuh
      entry('z', 100),
    ];
    const rows = computeRanking(es, 'MS', now, rs);
    expect(rows.map((r) => [r.entrantId, r.rank])).toEqual([['many', 1], ['few', 2], ['x', 3], ['y', 3], ['z', 5]]);
  });

  it('ranking terpisah per nomor; ganda per pasangan (pasangan baru mulai dari 0)', () => {
    const es = [entry('p1', 1000), entry('pairA', 5000, 10, { discipline: 'MD' }), entry('pairB', 100, 30, { discipline: 'MD' })];
    expect(computeRanking(es, 'MS', now, rs).map((r) => r.entrantId)).toEqual(['p1']);
    expect(computeRanking(es, 'MD', now, rs).map((r) => r.entrantId)).toEqual(['pairA', 'pairB']);
    expect(computeRanking(es, 'MD', now, rs).find((r) => r.entrantId === 'pairNew')).toBeUndefined();
  });

  it('poin yang akan kedaluwarsa + penanda masuk 10 terbaik', () => {
    const es = [...Array.from({ length: 10 }, () => entry('a', 1000, 40)), entry('a', 50, 5), entry('a', 2000, 6)];
    const nowW = absWeek({ year: 2027, week: 1 });
    const exp = expiringPoints(es, 'a', 'MS', nowW, 8, rs);
    expect(exp.map((e) => [e.entry.points, e.weeksLeft, e.counted])).toEqual([[50, 4, false], [2000, 5, true]]);
  });
});

describe('Race to Finals', () => {
  it('maks 14 hasil World Tour musim ini, maks 3 dari Super 100', () => {
    const es = [
      ...Array.from({ length: 6 }, () => entry('a', 5500, 10, { tierId: 'S100' })),
      ...Array.from({ length: 13 }, () => entry('a', 2750, 20, { tierId: 'S300' })),
      entry('a', 9999, 30, { tierId: 'IC' }), // bukan World Tour
      entry('a', 9999, 30, { tierId: 'WC' }), // bukan World Tour
      entry('a', 9999, 30, { tierId: 'S300', year: 2025 }), // musim lalu
    ];
    expect(computeRace(es, 'MS', 2026, rs)[0].points).toBe(3 * 5500 + 11 * 2750);
  });
});
