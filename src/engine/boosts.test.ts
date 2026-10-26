import { describe, expect, it } from 'vitest';
import { bumpForm, DISSOLVE_PENALTY, hitTarget, REST_RECOVERY, snubbed } from './boosts';
import { dissolvePair } from './career';
import { moraleTier } from './match';
import { experienceFactor } from './development';
import { BWF_2026 as rs } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import type { Player } from './types';

describe('bumpForm', () => {
  it('menambah dan menjepit −10..+10', () => {
    const p = (form: number) => ({ form }) as Player;
    const a = p(9); bumpForm(a, 3); expect(a.form).toBe(10);
    const b = p(-9); bumpForm(b, -3); expect(b.form).toBe(-10);
    const c = p(0); bumpForm(c, 1.5); expect(c.form).toBe(1.5);
  });
});

describe('hitTarget', () => {
  it('babak dicapai vs target', () => {
    expect(hitTarget('SF', 'QF')).toBe('hit');
    expect(hitTarget('QF', 'QF')).toBe('hit');
    expect(hitTarget('R16', 'QF')).toBe('none');
    expect(hitTarget('R32', 'QF')).toBe('miss');
    expect(hitTarget(undefined, 'QF')).toBe('miss');
    expect(hitTarget(undefined, 'R64')).toBe('none');
  });
});

describe('faktor pengalaman', () => {
  it('base, naik per laga, dibatasi max', () => {
    const e = rs.development.experience;
    expect(experienceFactor(rs.development, 0)).toBeCloseTo(e.base);
    expect(experienceFactor(rs.development, 4)).toBeCloseTo(e.base + 4 * e.perMatch);
    expect(experienceFactor(rs.development, 1000)).toBe(e.max);
  });
});

describe('istirahat', () => {
  it('atlet yang tidak bertanding: morale negatif pulih lebih cepat dari weeklyDecay', async () => {
    const state = newSeason(WORLD, rs, 7, undefined, 'INA');
    const idle = state.players.find((p) => p.retired === undefined)!;
    idle.injury = { weeksLeft: 5, level: 'moderate', type: 'ankle' }; // cedera → pasti tidak bertanding
    idle.form = -6;
    await playWeek(state, rs, WORLD, makeRng(7));
    expect(idle.form).toBeCloseTo(-6 * rs.match.morale.weeklyDecay * REST_RECOVERY, 5);
  }, 60000);
});

describe('snubbed', () => {
  const pl = (id: string, gender: 'M' | 'F', injury = false) => ({ id, gender, injury: injury ? { weeksLeft: 1 } : undefined }) as unknown as Player;
  it('hanya yang lebih baik dari terpilih terburuk segender, sehat, dan tidak terpilih', () => {
    const a = pl('a', 'M'), b = pl('b', 'M'), c = pl('c', 'M'), d = pl('d', 'M', true), w = pl('w', 'F');
    const rank: Record<string, number> = { a: 5, b: 30, c: 10, d: 2, w: 1 };
    expect(snubbed([a, b], [a, b, c, d, w], (p) => rank[p.id]).map((p) => p.id)).toEqual(['c']);
  });
});

describe('pasangan', () => {
  it('dibubarkan manajer: kedua atlet −DISSOLVE_PENALTY; dibubarkan sistem: tidak', () => {
    const state = newSeason(WORLD, rs, 9, undefined, 'INA');
    const [x, y] = state.pairs.filter((p) => !p.dissolved).slice(0, 2);
    const ps = (pr: typeof x) => pr.playerIds.map((id) => state.players.find((p) => p.id === id)!);
    for (const p of [...ps(x), ...ps(y)]) p.form = 0;
    dissolvePair(state, x.id, true);
    dissolvePair(state, y.id);
    expect(ps(x).map((p) => p.form)).toEqual([-DISSOLVE_PENALTY, -DISSOLVE_PENALTY]);
    expect(ps(y).map((p) => p.form)).toEqual([0, 0]);
  });
});

describe('kalibrasi morale', () => {
  it('sepanjang musim penuh: mayoritas tetap Normal, tidak ada yang menempel di +10; rekor pribadi tercatat', async () => {
    const state = newSeason(WORLD, rs, 11, undefined, 'INA');
    const rng = makeRng(11);
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    const active = state.players.filter((p) => p.retired === undefined);
    expect(active.filter((p) => moraleTier(p.form) === 'normal').length / active.length).toBeGreaterThan(0.55);
    expect(active.filter((p) => p.form >= 9.5).length / active.length).toBeLessThan(0.02);
    expect(state.players.some((p) => p.beatTop10)).toBe(true);
    expect(state.pairs.some((p) => (p.winStreak ?? 0) >= 3)).toBe(true);
  }, 600000);
});
