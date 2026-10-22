import { expect, it } from 'vitest';
import { weeklyNews } from './news';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

it('berita mingguan: dari laga minggu lalu, kejutan sesuai ambang ranking', async () => {
  const state = newSeason(WORLD, BWF_2026, 1, { year: 2026, week: 1 }, 'INA');
  const rng = makeRng(2);
  const kinds = new Set<string>();
  while (state.date.week < 12) {
    await playWeek(state, BWF_2026, WORLD, rng);
    const news = weeklyNews(state, BWF_2026);
    expect(news.length).toBeLessThanOrEqual(6);
    for (const n of news) {
      kinds.add(n.kind);
      if (n.kind === 'upset') expect(n.lr <= 20 && (n.wr ?? Infinity) - n.lr >= 20 && n.m.sides[n.m.winner] === n.winner).toBe(true);
      if (n.kind === 'streak') expect(n.n).toBeGreaterThanOrEqual(2);
      if (n.kind === 'seedOut') expect(n.m.sides[n.m.winner]).toBe(n.opp);
      if (n.kind === 'comeback') expect(n.m.scores[0][n.m.winner]).toBeLessThan(n.m.scores[0][1 - n.m.winner]);
      if (n.kind === 'youngChamp') expect(n.age).toBeLessThanOrEqual(18);
    }
  }
  expect([...kinds]).toEqual(expect.arrayContaining(['upset', 'seedOut', 'comeback', 'streak', 'careerHigh', 'smash']));
}, 60000);
