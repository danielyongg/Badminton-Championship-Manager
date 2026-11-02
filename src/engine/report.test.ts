import { describe, expect, it } from 'vitest';
import { playerReport } from './report';
import { ATTRS, type Player } from './types';

const date = { year: 2030, week: 20 };
const mk = (age: number, ca: number, extra: Partial<Player> = {}) => ({
  id: 'p', name: 'X', countryId: 'INA', gender: 'M', hand: 'R', birth: { year: 2030 - age, week: 1 },
  attrs: Object.fromEntries(ATTRS.map((a) => [a, ca])) as Player['attrs'], pa: 80, form: 0, fatigue: 0,
  attrHistory: [{ year: 2029, attrs: Object.fromEntries(ATTRS.map((a) => [a, ca - 3])) as Player['attrs'] }], ...extra,
}) as Player;
const base = { date, results: [], stars: 3, junior: false, line: 70 };

describe('laporan analis', () => {
  it('perkembangan musim & performa 10 laga terakhir', () => {
    const r = playerReport({ ...base, p: mk(24, 75, { caDelta: 1 }), results: [false, false, true, true, true, true, true, true, true, false, false] });
    expect(r.season).toBe(3);
    expect(r.trend).toBe('up');
    expect(r.recent).toEqual({ wins: 7, n: 10 });
    expect(r.form).toBe('good');
  });

  it('rekomendasi: promote junior siap, release veteran menurun, recall non-pelatnas kuat, keep inti', () => {
    expect(playerReport({ ...base, junior: true, p: mk(18, 70, { readySince: 100 }) }).verdict).toBe('promote');
    expect(playerReport({ ...base, p: mk(31, 70, { caDelta: -2 }), best: { d: 'MS', rank: 80 } }).verdict).toBe('release');
    expect(playerReport({ ...base, p: mk(25, 80, { released: 2029 }), best: { d: 'MS', rank: 40 } }).verdict).toBe('recall');
    expect(playerReport({ ...base, p: mk(32, 80, { released: 2029 }), best: { d: 'MS', rank: 40 } }).verdict).toBe('stayOut');
    expect(playerReport({ ...base, p: mk(26, 82), best: { d: 'MS', rank: 12 } })).toMatchObject({ verdict: 'keep', reason: 'core' });
    expect(playerReport({ ...base, p: mk(24, 60), stars: 1.5 }).verdict).toBe('release');
  });
});
