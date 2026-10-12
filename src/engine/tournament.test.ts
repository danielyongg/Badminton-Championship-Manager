import { expect, it } from 'vitest';
import { generateWorld } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { runEvent, simPlay } from './tournament';
import type { Match } from './types';

it('satu turnamen lengkap: S100 MS (draw 48 + kualifikasi) dan ganda', async () => {
  const rs = BWF_2026;
  const world = generateWorld(makeRng(1), rs.generator, WORLD.countries, { year: 2026, week: 1 });
  const players = new Map(world.players.map((p) => [p.id, p]));
  const pairs = new Map(world.pairs.map((p) => [p.id, p]));
  const event = rs.calendar.find((e) => e.id === 'vietnam-open')!;

  for (const discipline of ['MS', 'XD'] as const) {
    const pool = discipline === 'MS'
      ? world.players.filter((p) => p.gender === 'M').map((p) => ({ id: p.id, countryId: p.countryId }))
      : world.pairs.filter((p) => p.discipline === 'XD').map((p) => ({ id: p.id, countryId: players.get(p.playerIds[0])!.countryId }));
    const candidates = pool.map((c, i) => ({ ...c, rank: i + 1 }));
    const matches: Match[] = [];
    const rng = makeRng(5);
    const play = simPlay({ players, pairs, cfg: rs.match, rng, tournamentId: event.id, year: 2026, discipline, matches });
    const run = await runEvent({ tournament: event, discipline, year: 2026, hostCountryId: 'VIE', candidates, ruleset: rs, rng, play });

    const size = rs.tiers.find((t) => t.id === 'S100')!.drawSize[discipline];
    const inMain = run.slots.filter((s) => s.entrant).map((s) => s.entrant!);
    expect(inMain).toHaveLength(size);
    expect(new Set(inMain).size).toBe(size);
    expect(run.main.rounds.at(-1)![0]).toBeTruthy();
    expect([...run.main.reached.values()].filter((r) => r === 'W')).toHaveLength(1);
    // Wildcard dari negara tuan rumah.
    expect(run.entry.wildcards.every((w) => w.countryId === 'VIE')).toBe(true);
    // Semua qualifier berasal dari daftar kualifikasi.
    const qIds = new Set(run.entry.qualifying.map((c) => c.id));
    expect(run.slots.filter((s) => s.qualifier).every((s) => qIds.has(s.entrant!))).toBe(true);
    expect(matches.length).toBeGreaterThan(size - 16);
  }
});
