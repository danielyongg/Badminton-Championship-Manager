import { describe, expect, it } from 'vitest';
import { bumpForm, hitTarget, REST_RECOVERY } from './boosts';
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
