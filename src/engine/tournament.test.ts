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

it.each(['peru-ic', 'vietnam-open'])('GCR 7.11: wildcard grade 3 & Super 100 hanya bila tuan rumah tidak punya wakil di bagan utama (%s)', async (eventId) => {
  const rs = BWF_2026;
  const world = generateWorld(makeRng(1), rs.generator, WORLD.countries, { year: 2026, week: 1 });
  const players = new Map(world.players.map((p) => [p.id, p]));
  const pairs = new Map(world.pairs.map((p) => [p.id, p]));
  const event = rs.calendar.find((e) => e.id === eventId)!;
  const hostId = event.id === 'peru-ic' ? 'PER' : 'VIE';
  const men = world.players.filter((p) => p.gender === 'M');
  const run = async (hostRank: number) => {
    const others = men.filter((p) => p.countryId !== hostId).slice(0, 120).map((p, i) => ({ id: p.id, countryId: p.countryId, rank: i + 1 + (i + 1 >= hostRank ? 1 : 0) }));
    const hp = men.find((p) => p.countryId === hostId)!;
    const candidates = [...others, { id: hp.id, countryId: hostId, rank: hostRank }];
    const rng = makeRng(3);
    const play = simPlay({ players, pairs, cfg: rs.match, rng, tournamentId: event.id, year: 2026, discipline: 'MS', matches: [] });
    return runEvent({ tournament: event, discipline: 'MS', year: 2026, hostCountryId: hostId, candidates, ruleset: rs, rng, play });
  };
  expect((await run(5)).entry.wildcards).toHaveLength(0); // tuan rumah sudah di bagan utama
  expect((await run(110)).entry.wildcards.map((w) => w.countryId)).toEqual([hostId]);
});
