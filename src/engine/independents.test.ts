import { describe, expect, it } from 'vitest';
import { releasePlayer } from './career';
import { currentAbility, isJuniorAge } from './generator';
import { isCrossNation, PAIR_GAP, pairIndependents, RELEASE_KEEP, releaseAthletes } from './independents';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, type SeasonState } from './season';
import type { Player } from './types';

const rs = BWF_2026;
const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation]));
const byId = (state: SeasonState) => new Map(state.players.map((p) => [p.id, p]));
/** Atlet ganda senior aktif (bukan junior, bukan spesialis tunggal). */
const doublesPlayers = (state: SeasonState, country: string, gender: 'M' | 'F') => state.players
  .filter((p) => p.countryId === country && p.gender === gender && p.retired === undefined && p.focus !== 'S' && !isJuniorAge(p, state.date));
/** Lepas atlet tanpa pemasangan otomatis (untuk menyusun skenario). */
const free = (state: SeasonState, p: Player) => releasePlayer(state, p.id);

describe('negara AI melepas atlet', () => {
  it('10 besar per gender & junior tidak pernah dilepas; PA rendah lebih sering dilepas', () => {
    let young = { low: 0, lowN: 0, high: 0, highN: 0 };
    for (let seed = 1; seed <= 6; seed++) {
      const state = newSeason(WORLD, rs, seed, undefined, 'INA');
      const before = byId(state);
      const keep = new Set<string>();
      const bar = new Map<string, number>();
      for (const c of WORLD.countries) for (const g of ['M', 'F'] as const) {
        const list = state.players.filter((p) => p.countryId === c.id && p.gender === g && p.retired === undefined && p.released === undefined && !isJuniorAge(p, state.date))
          .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
        list.slice(0, RELEASE_KEEP).forEach((p) => keep.add(p.id));
        if (list.length > RELEASE_KEEP) bar.set(`${c.id}${g}`, currentAbility(list[RELEASE_KEEP - 1].attrs));
      }
      const out = new Set(releaseAthletes(state, makeRng(seed)));
      expect(out.size).toBeGreaterThan(0);
      for (const id of out) {
        const p = before.get(id)!;
        expect(keep.has(id)).toBe(false);
        expect(isJuniorAge(p, state.date)).toBe(false);
        expect(p.countryId).not.toBe('INA'); // negara manajer: hanya manajer yang melepas
        expect(p.released).toBe(state.date.year);
      }
      for (const p of state.players) {
        const b = bar.get(`${p.countryId}${p.gender}`);
        if (b === undefined || keep.has(p.id) || isJuniorAge(p, state.date) || p.countryId === 'INA' || p.retired !== undefined) continue;
        const age = state.date.year - p.birth.year;
        if (age < 19 || age >= 24) continue;
        if (p.pa < b) { young.lowN++; if (out.has(p.id)) young.low++; } else { young.highN++; if (out.has(p.id)) young.high++; }
      }
      // pasangan dengan atlet federasi bubar
      for (const pair of state.pairs.filter((x) => !x.dissolved && x.playerIds.some((id) => out.has(id))))
        expect(pair.playerIds.every((id) => before.get(id)!.released !== undefined)).toBe(true);
    }
    expect(young.low / young.lowN).toBeGreaterThan(young.high / Math.max(1, young.highN));
  });
});

describe('pasangan pemain independen', () => {
  it('senegara dulu, lalu sekonfederasi, lalu bebas; selisih kemampuan ≤ 5', () => {
    const state = newSeason(WORLD, rs, 3, undefined, 'INA');
    state.results = []; // tanpa ranking: tidak ada spesialis tunggal top 64 yang dikecualikan
    const ps = byId(state);
    // DEN (Eropa): dua putra mirip → pasangan senegara.
    const [d1, d2] = doublesPlayers(state, 'DEN', 'M');
    d2.attrs = { ...d1.attrs };
    // ENG + FRA (Eropa) putri, JPN putri: ENG berpasangan dengan FRA, bukan JPN.
    const [e1] = doublesPlayers(state, 'ENG', 'F'), [f1] = doublesPlayers(state, 'FRA', 'F'), [j1] = doublesPlayers(state, 'JPN', 'F');
    f1.attrs = { ...e1.attrs }; j1.attrs = Object.fromEntries(Object.entries(e1.attrs).map(([k, v]) => [k, v - 3])) as typeof e1.attrs; // JPN sedikit lebih lemah: diproses sesudahnya
    // CAN putra sendirian di Pan Am, putra KOR mirip → lintas konfederasi.
    const [c1] = doublesPlayers(state, 'CAN', 'M'), [k1] = doublesPlayers(state, 'KOR', 'M');
    k1.attrs = { ...c1.attrs };
    for (const p of [d1, d2, e1, f1, j1, c1, k1]) free(state, p);
    const made = pairIndependents(state, rs, WORLD, makeRng(1));
    const md = (a: string, b: string) => made.find((x) => x.playerIds.includes(a) && x.playerIds.includes(b));
    expect(md(d1.id, d2.id)?.discipline).toBe('MD');
    expect(md(e1.id, f1.id)?.discipline).toBe('WD');
    expect(md(c1.id, k1.id)?.discipline).toBe('MD');
    for (const p of made) {
      const [a, b] = p.playerIds.map((id) => ps.get(id)!);
      expect(a.released !== undefined && b.released !== undefined).toBe(true);
      expect(Math.abs(currentAbility(a.attrs) - currentAbility(b.attrs))).toBeLessThanOrEqual(PAIR_GAP);
    }
    expect(currentAbility(j1.attrs)).toBeLessThan(currentAbility(e1.attrs));
    expect(isCrossNation(md(e1.id, f1.id)!.playerIds, (id) => ps.get(id)?.countryId)).toBe(true);
    expect(conf.get('ENG')).toBe(conf.get('FRA'));
  });

  it('spesialis tunggal tidak dipasangkan', () => {
    const state = newSeason(WORLD, rs, 4, undefined, 'INA');
    state.results = []; // tanpa ranking: tidak ada spesialis tunggal top 64 yang dikecualikan
    const [a, b] = doublesPlayers(state, 'DEN', 'M');
    b.attrs = { ...a.attrs };
    a.focus = 'S';
    free(state, a); free(state, b);
    const made = pairIndependents(state, rs, WORLD, makeRng(1));
    expect(made.some((p) => p.playerIds.includes(a.id))).toBe(false);
  });

  it('manajer melepas atlet ganda: langsung dicarikan pasangan independen', () => {
    const state = newSeason(WORLD, rs, 5, undefined, 'INA');
    state.results = []; // tanpa ranking: tidak ada spesialis tunggal top 64 yang dikecualikan
    const [x] = doublesPlayers(state, 'INA', 'M');
    const [m] = doublesPlayers(state, 'MAS', 'M');
    m.attrs = { ...x.attrs };
    free(state, m);
    releasePlayer(state, x.id, { rs, world: WORLD, rng: makeRng(2) });
    const pair = state.pairs.find((p) => !p.dissolved && p.discipline === 'MD' && p.playerIds.includes(x.id));
    expect(pair?.playerIds).toContain(m.id);
  });
});

describe('turnamen pasangan beda negara', () => {
  it('hanya turnamen terbuka (World Tour, IC/IS/FS), tidak Kejuaraan Dunia/kontinental/multi-event', async () => {
    const { playWeek } = await import('./season');
    const { absWeek, computeRanking } = await import('./ranking');
    const state = newSeason(WORLD, rs, 8, undefined, 'INA');
    // Pasangan MD peringkat 3 dijadikan pasangan beda negara (poin ranking tetap): biasanya ikut kontinental & WC.
    const top = computeRanking(state.results, 'MD', absWeek(state.date), rs)[2].entrantId;
    const pair = state.pairs.find((p) => p.id === top)!;
    const [a, b] = pair.playerIds.map((id) => state.players.find((p) => p.id === id)!);
    b.countryId = a.countryId === 'MAS' ? 'THA' : 'MAS';
    a.released = b.released = 2026;
    const rng = makeRng(3);
    while (state.date.year === 2026 && state.date.week <= 40) {
      for (const p of [a, b]) { p.injury = undefined; p.fatigue = 0; }
      await playWeek(state, rs, WORLD, rng);
    }
    const tierOf = new Map([...rs.calendar].map((e) => [e.id, e.tierId]));
    const played = new Set(state.matches.filter((m) => m.sides.includes(top)).map((m) => tierOf.get(m.tournamentId) ?? 'team'));
    expect(played.size).toBeGreaterThan(0);
    for (const t of played) expect([...rs.race.tiers, 'WTF', 'IC', 'IS', 'FS']).toContain(t);
  }, 120000);
});
