import { describe, expect, it } from 'vitest';
import { createMatch, headToHead, matchConfigFor, playRally, simulateMatch, type SideInput } from './match';
import { BWF_2026 } from './presets/bwf2026';
import { makeRng } from './rng';
import { ATTRS, STRATEGIES, type Attrs, type Match, type Player, type Strategy } from './types';

const cfg = BWF_2026.match;
const flat = (v: number): Attrs => Object.fromEntries(ATTRS.map((a) => [a, v])) as Attrs;
const player = (attrs: Attrs, extra: Partial<Player> = {}): Player => ({
  id: 'p', name: 'P', countryId: 'X', gender: 'M', hand: 'R', birth: { year: 2000, week: 1 },
  attrs, pa: 100, form: 0, fatigue: 0, attrHistory: [], ...extra,
});
const side = (p: Player): SideInput => ({ players: [p] });

/** Persentase kemenangan sisi A dari n laga. */
function winRate(a: SideInput, b: SideInput, n = 1000, seed = 7) {
  const rng = makeRng(seed);
  let wins = 0;
  for (let i = 0; i < n; i++) if (simulateMatch([a, b], cfg, rng).winner === 0) wins++;
  return wins / n;
}

describe('mesin pertandingan', () => {
  it('skor selalu sah: 21 dgn selisih 2, deuce s/d 30, best of 3', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 2000; i++) {
      const r = simulateMatch([side(player(flat(60))), side(player(flat(60)))], cfg, rng);
      expect(r.scores.length).toBeGreaterThanOrEqual(2);
      expect(r.scores.length).toBeLessThanOrEqual(3);
      for (const [a, b] of r.scores) {
        const w = Math.max(a, b), l = Math.min(a, b);
        const valid = (w === 21 && l <= 19) || (w > 21 && w <= 30 && w - l === 2) || (w === 30 && l === 29);
        expect(valid, `${a}-${b}`).toBe(true);
      }
      const gamesWon = r.scores.filter(([a, b]) => (r.winner === 0 ? a > b : b > a)).length;
      expect(gamesWon).toBe(2);
      const totalPoints = r.scores.flat().reduce((s, x) => s + x, 0);
      const statPoints = Object.values(r.stats).flat().reduce((s, x) => s + x, 0);
      expect(statPoints).toBe(totalPoints);
    }
  });

  it('pemain setara ≈ 50%', () => {
    const r = winRate(side(player(flat(70))), side(player(flat(70))));
    expect(r).toBeGreaterThan(0.44);
    expect(r).toBeLessThan(0.56);
  });

  it('pemain lebih kuat (+10) menang > 70%, tapi tetap bisa kalah', () => {
    const r = winRate(side(player(flat(80))), side(player(flat(70))));
    expect(r).toBeGreaterThan(0.7);
    expect(r).toBeLessThan(0.99);
  });

  it('stamina tinggi unggul (energi turun lebih lambat)', () => {
    const r = winRate(side(player({ ...flat(70), stamina: 90 })), side(player({ ...flat(72), stamina: 40 })));
    expect(r).toBeGreaterThan(0.5);
  });

  it('kelelahan menurunkan performa', () => {
    const r = winRate(side(player(flat(70))), side(player(flat(70), { fatigue: 90 })));
    expect(r).toBeGreaterThan(0.55);
  });

  it('ganda: chemistry tinggi mengalahkan pasangan setara chemistry rendah', () => {
    const p = player(flat(70));
    const r = winRate({ players: [p, p], chemistry: 90 }, { players: [p, p], chemistry: 20 });
    expect(r).toBeGreaterThan(0.6);
  });

  it('pemain smash tinggi mencetak lebih banyak poin smash', () => {
    const rng = makeRng(3);
    const smasher = side(player({ ...flat(70), smash: 95, net: 55 }));
    const netter = side(player({ ...flat(70), smash: 55, net: 95 }));
    let smash: [number, number] = [0, 0], net: [number, number] = [0, 0];
    for (let i = 0; i < 300; i++) {
      const s = simulateMatch([smasher, netter], cfg, rng).stats;
      smash = [smash[0] + s.smash[0], smash[1] + s.smash[1]];
      net = [net[0] + s.net[0], net[1] + s.net[1]];
    }
    expect(smash[0]).toBeGreaterThan(smash[1]);
    expect(net[1]).toBeGreaterThan(net[0]);
  });

  it('seed sama → hasil sama', () => {
    const run = () => simulateMatch([side(player(flat(70))), side(player(flat(68)))], cfg, makeRng(99));
    expect(run()).toEqual(run());
  });
});

it('head-to-head menghitung kemenangan, abaikan walkover', () => {
  const m = (sides: [string, string], winner: 0 | 1, walkover = false) =>
    ({ sides, winner, walkover }) as Match;
  const ms = [m(['a', 'b'], 0), m(['b', 'a'], 0), m(['a', 'b'], 0), m(['a', 'c'], 0), m(['a', 'b'], 1, true)];
  expect(headToHead(ms, 'a', 'b')).toEqual([2, 1]);
});

describe('strategi Live', () => {
  const rate = (a: Attrs, b: Attrs, s: Strategy) => {
    const rng = makeRng(1);
    let w = 0;
    for (let i = 0; i < 2000; i++) if (simulateMatch([side(player(a)), side(player(b))], cfg, rng, [s, 'balanced']).winner === 0) w++;
    return w / 2000;
  };

  it('tidak ada strategi yang dominan saat lawan setara (±4%)', () => {
    for (const s of STRATEGIES) expect(Math.abs(rate(flat(70), flat(70), s) - 0.5), s).toBeLessThan(0.04);
  });

  it('strategi yang cocok dengan matchup menaikkan peluang secara terukur', () => {
    const deceiver = { ...flat(70), deception: 90 }, slow = { ...flat(70), speed: 55 };
    expect(rate(deceiver, slow, 'deceptive')).toBeGreaterThan(rate(deceiver, slow, 'balanced') + 0.03);
    const smasher = { ...flat(70), smash: 88 }, weakDef = { ...flat(70), defense: 55 };
    expect(rate(smasher, weakDef, 'attacking')).toBeGreaterThan(rate(smasher, weakDef, 'balanced') + 0.02);
  });

  it('strategi yang salah merugikan: menyerang ke lawan bertahan kuat', () => {
    const smasher = { ...flat(70), smash: 85, defense: 60 }, wall = { ...flat(70), defense: 92 };
    expect(rate(smasher, wall, 'attacking')).toBeLessThan(rate(smasher, wall, 'balanced'));
  });

  it('risiko unforced error strategi menentukan reli: makin berisiko makin sering kalah, terutama bila Consistency rendah', () => {
    const risky = (error: number) => ({ ...cfg, strategies: { ...cfg.strategies, balanced: { ...cfg.strategies.balanced, error } } });
    const rateWith = (c: typeof cfg, a: Attrs) => {
      const rng = makeRng(1);
      let w = 0;
      for (let i = 0; i < 2000; i++) if (simulateMatch([side(player(a)), side(player(flat(70)))], c, rng, ['balanced', 'attacking']).winner === 0) w++;
      return w / 2000;
    };
    // Sisi 0 memakai 'balanced' yang risikonya dinaikkan; lawan tetap 'attacking' bawaan.
    const drop = (a: Attrs) => rateWith(cfg, a) - rateWith(risky(0.03), a);
    expect(drop(flat(70))).toBeGreaterThan(0.05);
    expect(drop({ ...flat(70), consistency: 45 })).toBeGreaterThan(drop({ ...flat(70), consistency: 95 }));
  });

  it('momentum bergerak ke sisi yang mencetak poin beruntun', () => {
    const st = createMatch([side(player(flat(70))), side(player(flat(70)))], cfg, makeRng(1));
    const rng = makeRng(5);
    let maxAbs = 0;
    while (st.winner === undefined) { playRally(st, cfg, rng); maxAbs = Math.max(maxAbs, Math.abs(st.momentum)); }
    expect(maxAbs).toBeGreaterThan(0.3);
    expect(maxAbs).toBeLessThanOrEqual(1);
  });
});

it('sistem skor 3×15 mulai 2027: game 15 poin, deuce unggul 2, batas 21; 2026 masih 21 poin', () => {
  expect(matchConfigFor(cfg, 2026).pointsToWin).toBe(21);
  const c = matchConfigFor(cfg, 2027);
  expect([c.pointsToWin, c.cap, c.intervalAt]).toEqual([15, 21, 8]);
  const rng = makeRng(3);
  for (let i = 0; i < 40; i++) {
    const r = simulateMatch([side(player(flat(60))), side(player(flat(60), { id: 'b' }))], c, rng);
    for (const [a, b] of r.scores) {
      const [w, l] = [Math.max(a, b), Math.min(a, b)];
      expect(w === 15 && l <= 13 || w > 15 && w <= 21 && (w - l === 2 || w === 21)).toBe(true);
    }
  }
});
