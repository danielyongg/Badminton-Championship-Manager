import { describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { dayPlan, orderOfPlay } from './schedule';
import type { MatchResult } from './match';
import { makeRng } from './rng';
import { newTour, simPlay } from './tournament';
import { ATTRS, DISCIPLINES, type Match, type Player } from './types';

const tier = (rs: typeof BWF_2026, id: string) => rs.tiers.find((t) => t.id === id)!;
const plan = (id: string, rs = BWF_2026) => dayPlan(tier(rs, id), DISCIPLINES);

describe('jadwal harian', () => {
  it('Super 1000 2026: R32 Selasa–Rabu (separuh bagan per hari), R16 Kamis, QF/SF/F Jumat–Minggu', () => {
    const p = plan('S1000');
    expect(p.days).toBe(6);
    expect(p.day('MS', 'R32', { i: 0, n: 16 })).toBe(0);
    expect(p.day('MS', 'R32', { i: 15, n: 16 })).toBe(1);
    expect(['R16', 'QF', 'SF', 'F'].map((r) => p.day('XD', r as 'F'))).toEqual([2, 3, 4, 5]);
    expect(p.rounds).toEqual([['R32'], ['R32'], ['R16'], ['QF'], ['SF'], ['F']]);
  });

  it('Super 500: kualifikasi Q1 & Q2 hari pertama, R32 hari kedua', () => {
    const p = plan('S500');
    expect([p.day('MS', 'Q1'), p.day('MS', 'Q2'), p.day('MS', 'R32'), p.day('MS', 'R16')]).toEqual([0, 0, 1, 2]);
  });

  it('Kejuaraan Dunia: R64 dua hari; Finals: grup 3 hari lalu SF & F', () => {
    const wc = plan('WC');
    expect([wc.day('MS', 'R64', { i: 0, n: 32 }), wc.day('MS', 'R64', { i: 31, n: 32 }), wc.day('MS', 'R32'), wc.day('MS', 'R16'), wc.day('MS', 'F')]).toEqual([0, 1, 2, 3, 6]);
    const f = plan('WTF');
    expect([0, 1, 2].map((md) => f.day('MS', 'G', { i: 0, n: 2, md }))).toEqual([0, 1, 2]);
    expect([f.day('MS', 'SF'), f.day('MS', 'F')]).toEqual([3, 4]);
  });

  it('Super 1000 2027 (11 hari): grup tunggal & R32 ganda tersebar, final hari ke-11', () => {
    const p = plan('S1000', BWF_2027);
    expect(p.days).toBe(11);
    expect(p.day('MD', 'F')).toBe(10);
    expect(p.day('MS', 'R16', { i: 7, n: 8 })).toBe(7);
    expect(p.day('MS', 'G', { i: 0, n: 16, md: 0 })).toBe(0);
    for (const r of p.rounds) expect(r.length).toBeGreaterThan(0);
  });

  it('order of play: dua laga sehari seorang atlet berjarak ≥ 1 gelombang; unggulan di lapangan 1', () => {
    const list = [
      { key: 'MD', players: ['a', 'b'], prio: 0 }, { key: 'MD', players: ['c', 'd'], prio: 0 },
      { key: 'XD', players: ['a', 'x'], prio: 0 }, { key: 'XD', players: ['y', 'z'], prio: 5 },
    ];
    const o = orderOfPlay(list, 2);
    expect(o[0]).toEqual({ court: 1, order: 1 });
    expect(o[3].court).toBe(1); // prio tinggi
    expect(o[2].order).toBeGreaterThanOrEqual(o[0].order + 2); // atlet a: jeda satu gelombang
    expect(new Set(o.map((x) => `${x.court}-${x.order}`)).size).toBe(4);
  });
});

describe('simPlay dengan jadwal harian', () => {
  const mk = (id: string, mental = 70): Player => ({
    id, name: id, countryId: 'X', gender: 'M', hand: 'R', birth: { year: 2000, week: 1 },
    attrs: Object.fromEntries(ATTRS.map((a) => [a, mental])) as Player['attrs'], pa: 90, form: 0, fatigue: 0, attrHistory: [],
  } as Player);
  const setup = (injury?: (p: Player, n: number) => boolean) => {
    const players = new Map(['a', 'b', 'c', 'd'].map((x) => [x, mk(x)]));
    const matches: Match[] = [];
    const tour = newTour();
    const p = plan('S1000');
    const play = simPlay({ players, pairs: new Map(), cfg: BWF_2026.match, rng: makeRng(2), tournamentId: 't', year: 2026, discipline: 'MS', matches, plan: p, tour, injury });
    return { play, matches, tour, players };
  };

  it('laga kedua hari yang sama membawa beban lebih besar daripada keesokan harinya', () => {
    const { play, tour } = setup();
    play('a', 'b', 'R16');
    const cost = tour.log.get('a')![0].cost;
    expect(cost).toBeGreaterThan(5);
    const same = tour.log.get('a')!.reduce((t, x) => t + x.cost * 0.85, 0);
    const next = tour.log.get('a')!.reduce((t, x) => t + x.cost * 0.4, 0);
    expect(same).toBeGreaterThan(next);
  });

  it('atlet cedera: mundur di laga itu (atau selesai), lalu walkover di laga berikutnya', () => {
    const { play, matches, tour } = setup((p) => p.id === 'a');
    play('a', 'b', 'R16');
    expect(tour.out.has('a')).toBe(true);
    const r = play('a', 'c', 'QF') as MatchResult;
    expect(r.walkover).toBe(true);
    expect(r.winner).toBe(1);
    expect(matches.at(-1)!.walkover).toBe(true);
  });
});

describe('mundur & laga siaran', () => {
  const mk = (id: string): Player => ({
    id, name: id, countryId: 'X', gender: 'M', hand: 'R', birth: { year: 2000, week: 1 },
    attrs: Object.fromEntries(ATTRS.map((a) => [a, 70])) as Player['attrs'], pa: 90, form: 0, fatigue: 0, attrHistory: [],
  } as Player);
  it('peserta yang ditarik dari satu nomor: walkover di nomor itu saja', () => {
    const players = new Map(['a', 'b'].map((x) => [x, mk(x)]));
    const tour = newTour();
    const opts = { players, pairs: new Map(), cfg: BWF_2026.match, rng: makeRng(2), tournamentId: 't', year: 2026, matches: [] as Match[], tour };
    tour.withdrawn.add('MS:a');
    expect((simPlay({ ...opts, discipline: 'MS' })('a', 'b', 'R16') as MatchResult).walkover).toBe(true);
    expect((simPlay({ ...opts, discipline: 'WS' })('a', 'b', 'R16') as MatchResult).walkover).toBeUndefined();
  });
  it('Hawk-Eye hanya di laga siaran', () => {
    const players = new Map(['a', 'b'].map((x) => [x, mk(x)]));
    const seen: (boolean | undefined)[] = [];
    const live = (req: { review?: boolean }) => { seen.push(req.review); return null; };
    const play = simPlay({ players, pairs: new Map(), cfg: BWF_2026.match, rng: makeRng(2), tournamentId: 't', year: 2026, discipline: 'MS', matches: [], review: true, live, tv: (_s, r) => r === 'F' });
    play('a', 'b', 'R16'); play('a', 'b', 'F');
    expect(seen).toEqual([false, true]);
  });
});
