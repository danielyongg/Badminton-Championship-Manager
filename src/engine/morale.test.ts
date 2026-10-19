import { describe, expect, it } from 'vitest';
import { matchConfigFor, moraleTier, simulateMatch } from './match';
import { BWF_2026 as rs } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import { ATTRS, type Player } from './types';

const pl = (v: number, form: number) => ({ id: 'x', attrs: Object.fromEntries(ATTRS.map((a) => [a, v])), form, fatigue: 0 }) as unknown as Player;
const winRate = (a: Player, b: Player, n = 1500) => {
  const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(3);
  let w = 0;
  for (let i = 0; i < n; i++) if (simulateMatch([{ players: [a] }, { players: [b] }], cfg, rng).winner === 0) w++;
  return w / n;
};

describe('morale', () => {
  it('tingkat: −10..+10 → sangat rendah … sangat tinggi', () => {
    expect([-9, -4, 0, 4, 8].map(moraleTier)).toEqual(['veryLow', 'low', 'normal', 'high', 'veryHigh']);
  });

  it('kalibrasi: 80 Tinggi vs 90 Sangat rendah ≈ 60%; 80 vs 90 sama-sama Normal: kejutan jarang', () => {
    const upset = winRate(pl(80, 4), pl(90, -8));
    expect(upset).toBeGreaterThan(0.5);
    expect(upset).toBeLessThan(0.7);
    const normal = winRate(pl(80, 0), pl(90, 0));
    expect(normal).toBeGreaterThan(0.04);
    expect(normal).toBeLessThan(0.2);
  }, 120000);

  it('berbasis hasil: juara naik, tetap dalam −10..+10, mayoritas atlet Normal', async () => {
    const state = newSeason(WORLD, rs, 4, undefined, 'INA');
    const rng = makeRng(4);
    while (state.date.week < 12) await playWeek(state, rs, WORLD, rng);
    const before = state.champions.length;
    const form = new Map(state.players.map((p) => [p.id, p.form]));
    await playWeek(state, rs, WORLD, rng);
    const players = new Map(state.players.map((p) => [p.id, p]));
    const pairs = new Map(state.pairs.map((p) => [p.id, p]));
    const champs = state.champions.slice(before).flatMap((c) => pairs.get(c.winner)?.playerIds ?? [c.winner]);
    expect(champs.length).toBeGreaterThan(0);
    // Juara minggu ini: morale naik dibanding sebelum minggu ini (setelah pemulihan mingguan).
    expect(champs.filter((id) => players.get(id)!.form > form.get(id)! * rs.match.morale.weeklyDecay).length).toBe(champs.length);
    expect(state.players.every((p) => p.form >= -10 && p.form <= 10)).toBe(true);
    const active = state.players.filter((p) => p.retired === undefined);
    expect(active.filter((p) => moraleTier(p.form) === 'normal').length / active.length).toBeGreaterThan(0.6);
  }, 120000);
});
