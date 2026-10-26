import { describe, expect, it } from 'vitest';
import { ageAt, isJuniorAge } from './generator';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { absWeek, computeRanking } from './ranking';
import { makeRng } from './rng';
import { entrantsFor, entryDeadline, newSeason, playWeek, weekKey, weekOf } from './season';
import { currentAbility } from './generator';
import { isDoubles, type Discipline } from './types';

const rs = BWF_2026;
const juniorEvents = (r = rs) => r.calendar.filter((e) => r.tiers.find((t) => t.id === e.tierId)?.junior);

describe('turnamen junior', () => {
  it('ada di kalender 2026 & 2027+: 5 kontinental (minggu 28) + Kejuaraan Dunia Junior (minggu 41) + junior internasional terbuka sepanjang musim', () => {
    for (const r of [BWF_2026, BWF_2027]) {
      const js = juniorEvents(r);
      expect(js.filter((e) => e.week === 28 && e.confederation).map((e) => e.confederation).sort()).toEqual(['BA', 'BAM', 'BCA', 'BE', 'BO']);
      expect(js.filter((e) => e.week === 41 && !e.confederation)).toHaveLength(1);
      expect(js.filter((e) => e.week < 28 && !e.confederation).length).toBeGreaterThanOrEqual(3); // ranking junior terisi sebelum kejuaraan kontinental
    }
  });

  it('negara manajer tanpa pasangan junior otomatis (ganda junior hanya bentukan manajer); negara lain tetap otomatis', async () => {
    const state = newSeason(WORLD, rs, 21, undefined, 'INA');
    const rng = makeRng(21);
    while (state.date.week < 30) await playWeek(state, rs, WORLD, rng);
    const country = new Map(state.players.map((p) => [p.id, p.countryId]));
    const auto = state.pairs.filter((p) => p.adHoc && p.junior);
    expect(auto.some((p) => country.get(p.playerIds[0]) !== 'INA')).toBe(true);
    expect(auto.filter((p) => country.get(p.playerIds[0]) === 'INA')).toHaveLength(0);
  });

  it('hanya U19, kontinental hanya konfederasinya, tanpa poin senior; ranking junior terbentuk; tidak bentrok dengan turnamen senior', async () => {
    const state = newSeason(WORLD, rs, 21, undefined, 'INA');
    const rng = makeRng(21);
    while (state.date.week < 42) await playWeek(state, rs, WORLD, rng);
    const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation]));
    const players = new Map(state.players.map((p) => [p.id, p]));
    const pairs = new Map(state.pairs.map((p) => [p.id, p]));
    const idsOf = (s: string) => pairs.get(s)?.playerIds ?? [s];
    const ids = new Set(juniorEvents().map((e) => e.id));
    const jm = state.matches.filter((m) => ids.has(m.tournamentId));
    expect(jm.length).toBeGreaterThan(100);
    for (const m of jm) {
      const ev = rs.calendar.find((e) => e.id === m.tournamentId)!;
      for (const id of m.sides.flatMap(idsOf)) {
        const p = players.get(id)!;
        expect(ageAt(p.birth, { year: 2026, week: ev.week })).toBeLessThanOrEqual(18);
        if (ev.confederation) expect(conf.get(p.countryId)).toBe(ev.confederation);
      }
    }
    expect(state.results.some((r) => ids.has(r.tournamentId))).toBe(false); // tanpa poin ranking senior
    expect(computeRanking(state.juniorResults, 'MS', absWeek(state.date), rs).length).toBeGreaterThan(20);
    // Indonesia (termasuk junior pratama) ikut Kejuaraan Dunia Junior.
    const wjc = juniorEvents().find((e) => e.week === 41)!;
    expect(state.matches.some((m) => m.tournamentId === wjc.id && m.sides.flatMap(idsOf).some((id) => players.get(id)!.countryId === 'INA'))).toBe(true);
    // Atlet di turnamen junior tidak bermain di turnamen senior minggu yang sama.
    for (const week of [28, 41]) {
      const evs = rs.calendar.filter((e) => e.week === week);
      const inJunior = new Set(state.matches.filter((m) => ids.has(m.tournamentId) && evs.some((e) => e.id === m.tournamentId)).flatMap((m) => m.sides.flatMap(idsOf)));
      const inSenior = state.matches.filter((m) => !ids.has(m.tournamentId) && evs.some((e) => e.id === m.tournamentId) && m.year === 2026).flatMap((m) => m.sides.flatMap(idsOf));
      expect(inSenior.filter((id) => inJunior.has(id))).toEqual([]);
    }
    // Kuota per negara di Kejuaraan Dunia Junior & pasangan junior otomatis tidak masuk turnamen senior.
    const rec = (d: Discipline) => state.eventRecords.find((r) => r.tournamentId === wjc.id && r.discipline === d)!;
    for (const d of ['MS', 'XD'] as Discipline[]) {
      const entered = [...rec(d).entry.main, ...rec(d).entry.qualifying, ...rec(d).entry.reserves];
      const per = new Map<string, number>();
      for (const c of entered) per.set(c.countryId, (per.get(c.countryId) ?? 0) + 1);
      expect(Math.max(...per.values())).toBeLessThanOrEqual(isDoubles(d) ? 2 : 3);
    }
    const auto = state.pairs.filter((p) => p.junior);
    expect(auto.length).toBeGreaterThan(0);
    expect(auto.every((p) => p.adHoc && !entrantsFor(state, p.discipline).some((e) => e.id === p.id))).toBe(true);
    // Pasangan otomatis dibentuk saat turnamen junior pertama yang diikuti: kedua atlet U19 pada minggu itu.
    const firstWeek = Math.min(...juniorEvents().map((e) => e.week));
    expect(auto.every((p) => p.playerIds.every((id) => isJuniorAge(players.get(id)!, { year: 2026, week: firstWeek })))).toBe(true);
  }, 60000);
});

describe('spesialis ganda', () => {
  it('tidak masuk nomor tunggal (individu, beregu, junior)', async () => {
    const { juniorTeamEntrants } = await import('./junior');
    const { teamStrengths } = await import('./season');
    const state = newSeason(WORLD, rs, 3, undefined, 'INA');
    state.players.filter((p) => p.gender === 'M').forEach((p, i) => { if (i % 2) p.focus = 'D'; });
    const d = new Set(state.players.filter((p) => p.focus === 'D').map((p) => p.id));
    expect(entrantsFor(state, 'MS').some((e) => d.has(e.id))).toBe(false);
    expect(juniorTeamEntrants(state, 'MS').some((e) => d.has(e.id))).toBe(false);
    expect(teamStrengths(state, rs, 'thomas').some((s) => s.pool.MS?.some((e) => d.has(e.id)))).toBe(false);
  });
  it('entry manual manajer: "Main" pasti ikut walau lemah (didahulukan dalam kuota), "Istirahat" tidak ikut', async () => {
    const state = newSeason(WORLD, rs, 7, undefined, 'INA');
    const rng = makeRng(7);
    const ev = juniorEvents().find((e) => e.tierId === 'JGP')!;
    while (state.date.week < entryDeadline(rs, ev.id, 2026)!) await playWeek(state, rs, WORLD, rng); // entry diisi sebelum batas entry
    const date = { year: 2026, week: ev.week };
    const ina = state.players.filter((p) => p.countryId === 'INA' && p.gender === 'M' && !p.injury && p.retired === undefined && isJuniorAge(p, date))
      .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    expect(ina.length).toBeGreaterThan(rs.tiers.find((t) => t.id === ev.tierId)!.junior!.quota.singles);
    const [best] = ina, weakest = ina.at(-1)!;
    state.manualEntries[weekKey(date)] = { [weakest.id]: ev.id, [best.id]: 'rest' };
    while (state.date.week <= ev.week) {
      for (const p of [best, weakest]) p.injury = undefined; // yang diuji entry, bukan cedera
      await playWeek(state, rs, WORLD, rng);
    }
    const rec = state.eventRecords.find((r) => r.tournamentId === ev.id && r.discipline === 'MS')!;
    const entered = [...rec.entry.main, ...rec.entry.qualifying, ...rec.entry.reserves].map((c) => c.id);
    expect(entered).toContain(weakest.id);
    expect(entered).not.toContain(best.id);
    // Didahulukan hanya untuk kuota: peringkat entry (unggulan) tetap menurut ranking junior/kemampuan.
    const all = [...rec.entry.main, ...rec.entry.qualifying, ...rec.entry.reserves];
    expect(all.find((c) => c.id === weakest.id)!.rank).toBeGreaterThan(1);
  }, 60000);
});

describe('entry yang sudah di-submit', () => {
  it('atlet sendiri yang tidak dicentang tidak diisi AI ke turnamen itu; tanpa submit tetap diisi asisten AI', async () => {
    const state = newSeason(WORLD, rs, 11, undefined, 'INA');
    const rng = makeRng(11);
    while (state.date.week < 20) await playWeek(state, rs, WORLD, rng);
    // Minggu batas entry dengan turnamen yang (tanpa submit) diikuti atlet INA dari pilihan AI.
    for (let tries = 0; tries < 30; tries++) {
      const { year, week } = state.date;
      const due = rs.calendar.filter((e) => entryDeadline(rs, e.id, year) === week && weekOf(e, year) > week).map((e) => e.id);
      const free = structuredClone(state);
      await playWeek(free, rs, WORLD, makeRng(99));
      const ina = new Set(free.players.filter((p) => p.countryId === 'INA').map((p) => p.id));
      const pairIds = new Map(free.pairs.map((p) => [p.id, p.playerIds]));
      const mine = (s: typeof state, id: string) => Object.values(s.entryLists?.[`${year}:${id}`] ?? {}).flat()
        .filter((c) => (pairIds.get(c!.id) ?? [c!.id]).some((x) => ina.has(x)) && !state.commitments[c!.id]?.length).map((c) => c!.id);
      const ids = due.filter((id) => mine(free, id).length);
      if (ids.length) {
        const done = structuredClone(state);
        for (const id of ids) (done.entriesSubmitted ??= {})[`${year}:${id}`] = true;
        await playWeek(done, rs, WORLD, makeRng(99));
        expect(ids.flatMap((id) => mine(done, id))).toEqual([]);
        return;
      }
      await playWeek(state, rs, WORLD, rng);
    }
    throw new Error('tidak ada minggu dengan entry AI atlet INA');
  }, 120000);
});
