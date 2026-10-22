import { expect, it } from 'vitest';
import { weeklyNews } from './news';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

it('berita mingguan: dari laga minggu lalu, kejutan sesuai ambang ranking', async () => {
  const state = newSeason(WORLD, BWF_2026, 1);
  const rng = makeRng(2);
  const kinds = new Set<string>();
  while (state.date.week < 12) {
    await playWeek(state, BWF_2026, WORLD, rng);
    for (const n of weeklyNews(state, BWF_2026)) {
      kinds.add(n.kind);
      if (n.kind === 'upset') expect(n.lr <= 20 && (n.wr ?? Infinity) - n.lr >= 20 && n.m.sides[n.m.winner] === n.winner).toBe(true);
      if (n.kind === 'streak') expect(n.n).toBeGreaterThanOrEqual(2);
    }
  }
  expect([...kinds]).toEqual(expect.arrayContaining(['upset', 'smash', 'rally', 'fire']));
}, 60000);
