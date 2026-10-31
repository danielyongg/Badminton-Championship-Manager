import { expect, it } from 'vitest';
import { generateWorld } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { nextDayForm, runEvent, simPlay, tournamentWildcards, type DrawShow, type EventRecord, type HotForm } from './tournament';
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

it('World Tour 6.4.2: wildcard S1000–S500 maks 2 per turnamen, berkurang per entri tuan rumah di 32/28 besar', () => {
  const tier = (id: string) => BWF_2026.tiers.find((t) => t.id === id)!;
  // Tiap nomor 40 peserta; wakil tuan rumah (HOS) di peringkat yang ditentukan.
  const field = (hostRanks: number[]) => [
    ...Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, countryId: `C${i}`, rank: i + 1 })).filter((c) => !hostRanks.includes(c.rank)),
    ...hostRanks.map((r) => ({ id: `h${r}`, countryId: 'HOS', rank: r })),
  ];
  const wc = (id: string, byD: Partial<Record<'MS' | 'WS' | 'MD', number[]>>) =>
    Object.fromEntries(tournamentWildcards(tier(id), Object.entries(byD).map(([d, r]) => [d as 'MS', field(r!)]), 'HOS'));
  // Tanpa entri di 32 besar: 2 wildcard, ke nomor dengan wakil terbaik.
  expect(wc('S1000', { MS: [35], WS: [33], MD: [38] })).toEqual({ WS: ['h33'], MS: ['h35'] });
  // Satu entri di 32 besar: 1 wildcard; dua entri: tidak ada.
  expect(wc('S750', { MS: [10], WS: [33], MD: [36] })).toEqual({ WS: ['h33'] });
  expect(wc('S750', { MS: [10, 34], WS: [20, 33] })).toEqual({});
  // Super 500: batasnya 28 besar.
  expect(wc('S500', { MS: [30], WS: [29] })).toEqual({ WS: ['h29'], MS: ['h30'] });
  // Satu nomor maksimal satu wildcard.
  expect(wc('S1000', { MS: [33, 34] })).toEqual({ MS: ['h33'] });
});

it('WTF (format grup): catatan sementara sejak undian, klasemen terisi per grup, lalu bagan gugur', async () => {
  const rs = BWF_2026;
  const world = generateWorld(makeRng(1), rs.generator, WORLD.countries, { year: 2026, week: 1 });
  const players = new Map(world.players.map((p) => [p.id, p]));
  const event = rs.calendar.find((e) => e.tierId === 'WTF')!;
  const candidates = world.players.filter((p) => p.gender === 'M').slice(0, 8).map((p, i) => ({ id: p.id, countryId: p.countryId, rank: i + 1 }));
  const rng = makeRng(2);
  const sim = simPlay({ players, pairs: new Map(), cfg: rs.match, rng, tournamentId: event.id, year: 2026, discipline: 'MS', matches: [] });
  let rec: EventRecord | undefined;
  const seen: number[] = [];
  const play: typeof sim = (a, b, round) => {
    if (round === 'G') seen.push(rec!.groups!.standings.filter(Boolean).length); else expect(rec!.rounds.length).toBeGreaterThan(0);
    return sim(a, b, round);
  };
  const draws: DrawShow[] = [];
  const run = await runEvent({ tournament: event, discipline: 'MS', year: 2026, hostCountryId: 'CHN', candidates, ruleset: rs, rng, play, onRecord: (r) => { rec = r; }, onDraw: (d) => { draws.push(d); return null; } });
  // Undian grup saja: pasangan SF Finals sudah pasti (juara A vs runner-up B), tanpa live drawing babak gugur.
  expect(draws.map((d) => !!d.ko)).toEqual([false]);
  expect(seen[0]).toBe(0); // grup pertama dimainkan: belum ada klasemen final
  expect(seen.at(-1)).toBe(1); // grup terakhir: grup pertama sudah final
  expect(rec!.groups!.standings).toEqual(run.groups!.standings);
  expect(rec!.rounds.at(-1)).toEqual([run.main.rounds.at(-1)![0]]);
});

it('on fire: kondisi hari itu terbawa antar laga (sebaran tetap), bonus kemenangan dibatasi', () => {
  const cfg = BWF_2026.match, rng = makeRng(4);
  const pairs: [number, number][] = [];
  for (let i = 0; i < 4000; i++) {
    const hot: HotForm = {};
    const a = nextDayForm(hot, 'x', cfg, rng);
    pairs.push([a, nextDayForm(hot, 'x', cfg, rng)]);
  }
  const sd = (xs: number[]) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };
  const [first, second] = [pairs.map((p) => p[0]), pairs.map((p) => p[1])];
  expect(Math.abs(sd(second) - cfg.dayForm.sd)).toBeLessThan(0.15);
  const corr = pairs.reduce((s, [x, y]) => s + x * y, 0) / pairs.length / (sd(first) * sd(second));
  expect(Math.abs(corr - cfg.dayForm.carry)).toBeLessThan(0.05);
  const hot: HotForm = { x: { v: 0, wins: 10 } };
  const v = nextDayForm(hot, 'x', cfg, rng);
  expect(v - hot.x.v).toBe(cfg.dayForm.winCap);
});
