import { expect, it } from 'vitest';
import { archiveStats, careerStats } from './careerStats';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

it('statistik karier sama sebelum & sesudah statistik laga diarsipkan', async () => {
  const state = newSeason(WORLD, BWF_2026, 1);
  const rng = makeRng(2);
  while (state.date.week < 6) await playWeek(state, BWF_2026, WORLD, rng);
  const id = state.matches[0].sides[0];
  const ids = new Set([id]);
  const before = careerStats(undefined, state.matches, ids);
  expect(before.n).toBeGreaterThan(0);
  const archive = {};
  archiveStats(archive, state.matches);
  for (const m of state.matches) delete m.stats;
  expect(careerStats(archive, state.matches, ids)).toEqual(before);
}, 60000);
