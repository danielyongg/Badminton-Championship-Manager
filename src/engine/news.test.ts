import { expect, it } from 'vitest';
import { weeklyNews } from './news';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import { makeScouting } from './scouting';
import { absWeek } from './ranking';
import { isPratama } from './generator';
import type { Player } from './types';

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

it('berita permata selama pencarian terbuka', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 9, { year: 2027, week: 2 }, 'INA');
  const ina = WORLD.countries.find((c) => c.id === 'INA')!;
  const base = Array.from({ length: 4 }, (_, i) => ({ gender: i % 2 ? 'F' : 'M' }) as Player);
  state.scouting = makeScouting(base, ina, rs.generator, { year: 2027, week: 1 }, makeRng(2), undefined, WORLD.cities);
  state.scouting.gems = [state.scouting.candidates[0].id];
  expect(weeklyNews(state, rs).find((n) => n.kind === 'gem')).toEqual({ kind: 'gem', ids: [state.scouting.candidates[0].id] });
  state.date.week = 5;
  expect(weeklyNews(state, rs).some((n) => n.kind === 'gem')).toBe(false);
});

it('berita siap promosi: minggu sesudah junior Pratama dinilai siap', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 9, { year: 2026, week: 10 }, 'INA');
  const p = state.players.find((x) => x.countryId === 'INA' && isPratama(x, state.date))!;
  p.readySince = absWeek({ year: 2026, week: 9 });
  expect(weeklyNews(state, rs).find((n) => n.kind === 'ready')).toEqual({ kind: 'ready', ids: [p.id] });
  state.date.week = 11;
  expect(weeklyNews(state, rs).some((n) => n.kind === 'ready')).toBe(false);
});
