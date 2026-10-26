import { describe, expect, it } from 'vitest';
import { developQuarter } from './development';
import { currentAbility, generatePlayer } from './generator';
import { createMatch, matchConfigFor, simulateMatch } from './match';
import { BWF_2026 as rs } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import { chemistryMult, ensureTraits, hasTrait, injuryMult, QUICK_RECOVERY, rollTraits, traitShare, TRAITS, visibleTraits } from './traits';
import { ATTRS, type Player } from './types';

const withTraits = (traits: string[], extra: object = {}) => ({ traits, ...extra }) as unknown as Player;

describe('sifat: pengacakan', () => {
  it('deterministik per id, 0–2 sifat, tanpa pasangan bertentangan', () => {
    expect(rollTraits('INA-M1')).toEqual(rollTraits('INA-M1'));
    const all = Array.from({ length: 5000 }, (_, i) => rollTraits(`X-${i}`));
    expect(all.every((t) => t.length <= 2 && new Set(t).size === t.length && t.every((x) => TRAITS.includes(x)))).toBe(true);
    const bad = [['ironBody', 'injuryProne'], ['clutch', 'choker'], ['idealPartner', 'awkwardPartner']];
    expect(all.some((t) => bad.some(([a, b]) => t.includes(a as never) && t.includes(b as never)))).toBe(false);
    const share = (n: number) => all.filter((t) => t.length === n).length / all.length;
    expect(share(0)).toBeGreaterThan(0.55); expect(share(0)).toBeLessThan(0.65);
    expect(share(2)).toBeGreaterThan(0.07); expect(share(2)).toBeLessThan(0.13);
  });
  it('ensureTraits hanya mengisi yang belum punya; traitShare', () => {
    const a = { id: 'a' } as Player, b = { id: 'b', traits: ['clutch'] } as Player;
    ensureTraits([a, b]);
    expect(a.traits).toEqual(rollTraits('a'));
    expect(b.traits).toEqual(['clutch']);
    expect(hasTrait(b, 'clutch')).toBe(true);
    expect(traitShare([b, withTraits([])], 'clutch')).toBe(0.5);
  });
  it('dunia baru: semua atlet sudah punya sifat', () => {
    const state = newSeason(WORLD, rs, 5, undefined, 'INA');
    expect(state.players.every((p) => Array.isArray(p.traits))).toBe(true);
    expect(state.traitsRolled).toBe(true);
  });
});

describe('sifat terungkap', () => {
  it('fisik setelah 2 musim, mental/morale/ganda setelah 30 laga', () => {
    const p = withTraits(['ironBody', 'clutch'], { trait: 'late', attrHistory: [{}] });
    expect(visibleTraits(p, 10)).toEqual([]);
    expect(visibleTraits(p, 30)).toEqual(['clutch']);
    p.attrHistory.push({} as never);
    expect(visibleTraits(p, 30).sort()).toEqual(['clutch', 'ironBody', 'late'].sort());
  });
});

describe('sifat fisik', () => {
  it('pengali cedera', () => {
    expect(injuryMult(withTraits(['ironBody']))).toBe(0.5);
    expect(injuryMult(withTraits(['injuryProne']))).toBe(1.8);
    expect(injuryMult(withTraits([]))).toBe(1);
  });
  it('cepat pulih: kelelahan turun 1,5× lebih banyak dalam seminggu tanpa main', async () => {
    const state = newSeason(WORLD, rs, 31, undefined, 'INA');
    const [a, b] = state.players.filter((p) => p.retired === undefined).slice(0, 2);
    for (const p of [a, b]) { p.fatigue = 60; p.injury = { weeksLeft: 3, level: 'moderate', type: 'ankle' }; }
    a.traits = ['quickRecovery']; b.traits = [];
    await playWeek(state, rs, WORLD, makeRng(31));
    expect(60 - a.fatigue).toBeCloseTo((60 - b.fatigue) * QUICK_RECOVERY, 5);
  }, 60000);
  it('awet muda: atlet 32 tahun menurun lebih sedikit (rng sama)', () => {
    const country = WORLD.countries.find((c) => c.id === 'INA')!;
    const date = { year: 2026, week: 1 };
    const base = generatePlayer(makeRng(9), rs.generator, country, 'M', 32, date, 'vet');
    base.pa = currentAbility(base.attrs);
    const a = { ...structuredClone(base), traits: [] } as Player, b = { ...structuredClone(base), traits: ['ageless'] } as Player;
    const ctx = { date, experience: new Map(), doublesPlayers: new Set<string>() };
    developQuarter(a, rs.development, ctx, makeRng(4));
    developQuarter(b, rs.development, ctx, makeRng(4));
    expect(ATTRS.reduce((s, x) => s + b.attrs[x], 0)).toBeGreaterThan(ATTRS.reduce((s, x) => s + a.attrs[x], 0));
  });
});

const pl = (v: number, traits: string[] = []) => ({ id: Math.random().toString(), gender: 'M', attrs: Object.fromEntries(ATTRS.map((a) => [a, v])), form: 0, fatigue: 0, traits }) as unknown as Player;

describe('sifat pertandingan', () => {
  it('konsisten: sebaran kondisi hari itu lebih kecil', () => {
    const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(8);
    const sd = (traits: string[]) => {
      const xs = Array.from({ length: 500 }, () => createMatch([{ players: [pl(80, traits)] }, { players: [pl(80)] }], cfg, rng).sides[0].attrs.speed);
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    };
    expect(sd(['consistent'])).toBeLessThan(sd([]) * 0.6);
  });
  it('starter lambat: lebih sering kalah game 1, lebih sering menang rubber game', () => {
    const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(9);
    let g1 = 0, rubbers = 0, rubberWins = 0;
    const n = 6000;
    for (let i = 0; i < n; i++) {
      const r = simulateMatch([{ players: [pl(80, ['slowStarter'])] }, { players: [pl(80)] }], cfg, rng);
      if (r.scores[0][0] > r.scores[0][1]) g1++;
      if (r.scores.length === 3) { rubbers++; if (r.winner === 0) rubberWins++; }
    }
    expect(g1 / n).toBeLessThan(0.49); // pemanasan berat hanya di awal game 1: efek kecil
    expect(rubberWins / rubbers).toBeGreaterThan(0.52);
  }, 120000);
  it('pengali chemistry', () => {
    expect(chemistryMult([withTraits(['idealPartner']), withTraits([])])).toBe(2);
    expect(chemistryMult([withTraits(['idealPartner']), withTraits(['idealPartner'])])).toBe(4);
    expect(chemistryMult([withTraits(['awkwardPartner']), withTraits(['idealPartner'])])).toBe(1);
    expect(chemistryMult([withTraits([]), withTraits([])])).toBe(1);
  });
});

describe('mental juara & demam panggung', () => {
  const winRate = (a: Player, b: Player, big: boolean, n = 1500) => {
    const cfg = matchConfigFor(rs.match, 2026), rng = makeRng(3);
    let w = 0;
    for (let i = 0; i < n; i++) if (simulateMatch([{ players: [a], big }, { players: [b], big }], cfg, rng).winner === 0) w++;
    return w / n;
  };
  it('clutch menang lebih sering melawan atlet setara; efeknya lebih besar di laga besar', () => {
    const normal = winRate(pl(80, ['clutch']), pl(80), false);
    const big = winRate(pl(80, ['clutch']), pl(80), true);
    expect(normal).toBeGreaterThan(0.51); // poin kritis hanya dari skor 18 (2026): efek kecil tapi nyata
    expect(big).toBeGreaterThan(normal);
  }, 120000);
  it('choker kalah lebih sering di laga besar', () => {
    expect(winRate(pl(80, ['choker']), pl(80), true)).toBeLessThan(0.45);
  }, 120000);
});
