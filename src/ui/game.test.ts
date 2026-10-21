import { describe, expect, it } from 'vitest';
import { BWF_2026 } from '../engine/presets/bwf2026';
import { WORLD } from '../engine/presets/world';
import { newSeason } from '../engine/season';
import { gameFromBlob } from './game';

describe('save lama', () => {
  it('mendapat kejuaraan individu kontinental: musim ini bila minggunya belum lewat, selain itu mulai musim depan', () => {
    const cont = new Set(['CCA', 'CCE', 'CCP', 'CCI']);
    const load = (week: number) => {
      const ruleset = structuredClone(BWF_2026);
      ruleset.tiers = ruleset.tiers.filter((x) => !cont.has(x.id));
      ruleset.calendar = ruleset.calendar.filter((e) => !cont.has(e.tierId));
      for (const id of cont) { delete ruleset.ai.rankRange[id]; delete ruleset.ai.playProb[id]; }
      const world = structuredClone(WORLD);
      world.cities = world.cities.filter((c) => c.id !== 'ningbo' && c.id !== 'huelva');
      const state = newSeason(world, ruleset, 1);
      state.date.week = week;
      return gameFromBlob({ id: 'x', name: 'x', savedAt: 0 } as never, { state, ruleset, world, rngState: 1 });
    };
    const early = load(10);
    expect(early.ruleset.tiers.filter((x) => cont.has(x.id))).toHaveLength(4);
    expect(early.ruleset.calendar.find((e) => e.id === 'asia-championships')!.years).toBeUndefined(); // minggu 15 belum lewat
    expect(early.ruleset.calendar.find((e) => e.id === 'oceania-championships')!.years).toEqual({ from: 2027 }); // minggu 8 sudah lewat
    expect(early.world.cities.some((c) => c.id === 'ningbo')).toBe(true);
    expect(early.ruleset.ai.playProb.CCA).toBe(0.9);
  });
});
