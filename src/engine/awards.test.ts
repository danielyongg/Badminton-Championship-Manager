import { expect, it } from 'vitest';
import { AWARD_CATS, AWARD_LEAD, AWARD_NOMINEES, awardsOf, RISING_MAX_AGE, seasonScores, wtfWeek } from './awards';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';

it('BWF Player of the Year: nominasi 3 minggu sebelum WTF, pemenang salah satu nominasi di minggu WTF', async () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 12, undefined, 'INA');
  const rng = makeRng(4);
  const w = wtfWeek(rs, 2026)!;
  while (state.date.week <= w - AWARD_LEAD) await playWeek(state, rs, WORLD, rng);
  const a = state.awards!.find((x) => x.year === 2026)!;
  expect(a.winners).toBeUndefined();
  for (const c of AWARD_CATS) expect(a.nominees[c]).toHaveLength(AWARD_NOMINEES);
  // Nominasi tunggal putra = 4 skor musim tertinggi.
  const ms = [...seasonScores(state, rs, 2026, 'MS')].sort((x, y) => y[1] - x[1]).slice(0, AWARD_NOMINEES).map(([id]) => id);
  expect(a.nominees.MS).toEqual(ms);
  // Rising Star: semua atlet ≤ 21 tahun.
  const birth = new Map(state.players.map((p) => [p.id, p.birth.year]));
  for (const id of a.nominees.rising)
    for (const p of state.pairs.find((x) => x.id === id)?.playerIds ?? [id]) expect(2026 - birth.get(p)!).toBeLessThanOrEqual(RISING_MAX_AGE);
  while (state.date.week <= w) await playWeek(state, rs, WORLD, rng);
  for (const c of AWARD_CATS) expect(a.nominees[c]).toContain(a.winners![c]);
  expect(awardsOf(state, [a.winners!.MS]).some((x) => x.won && x.cat === 'MS' && x.year === 2026)).toBe(true);
  expect(state.awards!.filter((x) => x.year === 2026)).toHaveLength(1);
}, 180000);
