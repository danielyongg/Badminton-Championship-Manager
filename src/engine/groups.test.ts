import { describe, expect, it } from 'vitest';
import { applyCountryQuota } from './entry';
import { groupDraw, groupEliminatedRound, knockoutFromGroups, koHasLot, playGroup, provisionalField, type Standing } from './groups';
import { makeRng } from './rng';
import type { DrawStep } from './types';

const st = (id: string): Standing => ({ id, wins: 0, gameDiff: 0, pointDiff: 0 });

describe('fase grup', () => {
  it('WTF: juara grup bertemu runner-up grup lain di SF', () => {
    for (let s = 0; s < 20; s++) {
      const field = knockoutFromGroups([[st('A1'), st('A2')], [st('B1'), st('B2')]], 2, makeRng(s));
      expect(field).toEqual(['A1', 'B2', 'A2', 'B1']);
    }
  });

  it('runner-up selalu di paruh berlawanan dengan juara grupnya (4 grup → QF)', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => [st(`${g}1`), st(`${g}2`)]);
    for (let s = 0; s < 20; s++) {
      const field = knockoutFromGroups(groups, 2, makeRng(s));
      for (const g of ['A', 'B', 'C', 'D'])
        expect(field.indexOf(`${g}1`) < 4).not.toBe(field.indexOf(`${g}2`) < 4);
    }
  });

  it('lolos 2 (ganda Olimpiade, Thomas/Uber): juara A & B tetap di ujung, juara C & D diundi di posisi unggulan 3–4', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => [st(`${g}1`), st(`${g}2`)]);
    const seats = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const steps: DrawStep[] = [];
      const field = knockoutFromGroups(groups, 2, makeRng(s), steps);
      expect([field[0], field[7]]).toEqual(['A1', 'B1']);
      seats.add(`${field.indexOf('C1')}-${field.indexOf('D1')}`);
      expect(steps.filter((x) => x.key === 'step_winner').length).toBe(4);
      expect(steps.filter((x) => x.key === 'step_runnerUp').length).toBe(4);
    }
    expect(seats.size).toBe(2); // C & D bertukar posisi menurut undian
  });

  it('lolos 1 (tunggal Olimpiade, 12 grup → R16): posisi ditentukan tanpa undian, 4 bye untuk juara grup unggulan teratas', () => {
    const groups = Array.from({ length: 12 }, (_, i) => [st(`G${i}`)]);
    const fields = [1, 2, 3].map((s) => { const steps: DrawStep[] = []; const f = knockoutFromGroups(groups, 1, makeRng(s), steps); return { f, steps }; });
    expect(fields[1].f).toEqual(fields[0].f);
    expect(fields[0].steps.filter((x) => x.key === 'step_bye').length).toBe(4);
    for (const top of ['G0', 'G1', 'G2', 'G3']) { const i = fields[0].f.indexOf(top); expect(fields[0].f[i ^ 1]).toBeNull(); }
  });

  it('bagan sementara: Finals pasti (1A–2B, 2A–1B); 4 grup × 2: juara C/D & runner-up diundi; 12 grup × 1: 4 bye', () => {
    expect(provisionalField(2, 2)).toEqual([{ g: 0, place: 1 }, { g: 1, place: 2 }, { g: 0, place: 2 }, { g: 1, place: 1 }]);
    const qf = provisionalField(4, 2);
    expect([qf[0], qf[7]]).toEqual([{ g: 0, place: 1 }, { g: 1, place: 1 }]);
    expect(qf.filter((x) => typeof x === 'object' && 'drawn' in x).length).toBe(2);
    expect(qf.filter((x) => x === 'runnerUp').length).toBe(4);
    expect(provisionalField(12, 1).filter((x) => x === 'bye').length).toBe(4);
    expect([koHasLot(2, 2), koHasLot(4, 2), koHasLot(12, 1)]).toEqual([false, true, false]);
  });

  it('klasemen: menang terbanyak; 2 seri → head-to-head', async () => {
    // x & y sama-sama 2 menang (x mengalahkan y); z & w sama-sama 1 menang (z mengalahkan w).
    const win = new Set(['x>y', 'x>z', 'y>z', 'y>w', 'z>w', 'w>x']);
    const res = await playGroup(['x', 'y', 'z', 'w'], (a, b) => ({ winner: win.has(`${a}>${b}`) ? 0 : 1, scores: [[21, 15], [21, 15]] }));
    expect(res.map((r) => r.id)).toEqual(['x', 'y', 'z', 'w']);
    expect(res.map((r) => r.wins)).toEqual([2, 2, 1, 1]);
  });

  it('undian pot: unggulan 1 di grup 1, pemain senegara dipisah bila mungkin', () => {
    const es = ['CHN', 'CHN', 'INA', 'JPN', 'DEN', 'INA', 'KOR', 'MAS'].map((c, i) => ({ id: `e${i + 1}`, countryId: c, rank: i + 1 }));
    for (let s = 0; s < 30; s++) {
      const { groups } = groupDraw(es, { groups: 2, perGroup: 4, advance: 2 }, makeRng(s));
      expect(groups[0][0].id).toBe('e1');
      expect(groups[1][0].id).toBe('e2');
      for (const g of groups) expect(new Set(g.map((e) => e.countryId)).size).toBe(4);
    }
  });

  it('peringkat tersingkir di grup → babak sebelum babak gugur pertama', () => {
    expect(groupEliminatedRound(4, 3, 2)).toBe('QF'); // WTF: peringkat 3 grup
    expect(groupEliminatedRound(4, 4, 2)).toBe('R16');
    expect(groupEliminatedRound(16, 2, 1)).toBe('R32'); // S1000 2027: runner-up grup
  });
});

it('kuota negara: maks 2, atau s/d 4 bila semuanya top 8', () => {
  const c = (id: string, countryId: string, rank: number) => ({ id, countryId, rank });
  const out = applyCountryQuota([
    c('a1', 'A', 1), c('a2', 'A', 2), c('a3', 'A', 5), c('a4', 'A', 7), c('a5', 'A', 8),
    c('b1', 'B', 3), c('b2', 'B', 9), c('b3', 'B', 10), c('b4', 'B', 11),
  ], { base: 2, max: 4, topRank: 8 });
  expect(out.map((x) => x.id)).toEqual(['a1', 'a2', 'b1', 'a3', 'a4', 'b2']);
});
