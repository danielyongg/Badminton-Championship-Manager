import { describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { newSeason, playWeek } from './season';
import { currentAbility, isPratama } from './generator';
import { absWeek } from './ranking';
import { EARLY_WEEKS, isEarly, isHeldBack, isReady, LATE_WEEKS, promote, promotionLine, readyLines, updateReadiness } from './promotion';
import { ATTRS } from './types';
import { developQuarter, quarterReport } from './development';
import { makeRng } from './rng';

describe('promosi junior', () => {
  const rs = BWF_2026;
  const fresh = () => newSeason(WORLD, rs, 4, { year: 2026, week: 10 }, 'INA');
  const pratama = (s: ReturnType<typeof fresh>) => s.players.filter((p) => p.countryId === 'INA' && isPratama(p, s.date) && p.focus !== 'D');

  it('ambang = CA peringkat 200 tunggal segender; siap bila di atasnya', () => {
    const s = fresh(), l = readyLines(s, rs);
    expect(l.M).toBeGreaterThan(40);
    expect(l.M).toBeLessThan(90);
    const p = pratama(s)[0];
    expect(promotionLine(p, l)).toBe(l[p.gender]);
    for (const a of ATTRS) p.attrs[a] = Math.ceil(l[p.gender]) + 1;
    expect(isReady(p, l)).toBe(true);
    for (const a of ATTRS) p.attrs[a] = 10;
    expect(isReady(p, { ...l, juniorTop: new Set() })).toBe(false);
    expect(isReady(p, { ...l, juniorTop: new Set([p.id]) })).toBe(true);
  });

  it('updateReadiness mencatat minggu pertama siap sekali saja', () => {
    const s = fresh(), l = readyLines(s, rs), p = pratama(s)[0];
    for (const a of ATTRS) p.attrs[a] = Math.ceil(l[p.gender]) + 1;
    p.pa = 99;
    updateReadiness(s, rs);
    expect(p.readySince).toBe(absWeek(s.date));
    s.date.week += 1;
    updateReadiness(s, rs);
    expect(p.readySince).toBe(absWeek(s.date) - 1);
  });

  it('promosi terlalu cepat menandai earlyPromo 26 minggu; siap tidak', () => {
    const s = fresh(), l = readyLines(s, rs);
    const [weak, strong] = pratama(s);
    for (const a of ATTRS) weak.attrs[a] = 10;
    for (const a of ATTRS) strong.attrs[a] = Math.ceil(l[strong.gender]) + 1;
    strong.pa = 99;
    promote(s, rs, weak.id);
    promote(s, rs, strong.id);
    expect(weak.promoted && strong.promoted).toBe(true);
    expect(weak.earlyPromo).toBe(absWeek(s.date) + EARLY_WEEKS);
    expect(strong.earlyPromo).toBeUndefined();
    expect(isEarly(weak, absWeek(s.date) + EARLY_WEEKS)).toBe(true);
    expect(isEarly(weak, absWeek(s.date) + EARLY_WEEKS + 1)).toBe(false);
  });

  it('tertahan: siap > 26 minggu dan masih Pratama', () => {
    const s = fresh(), p = pratama(s)[0], now = absWeek(s.date);
    p.readySince = now - LATE_WEEKS;
    expect(isHeldBack(p, s.date)).toBe(false);
    p.readySince = now - LATE_WEEKS - 1;
    expect(isHeldBack(p, s.date)).toBe(true);
    p.promoted = true;
    expect(isHeldBack(p, s.date)).toBe(false);
    expect(currentAbility(p.attrs)).toBeGreaterThan(0);
  });

  it('tertahan memperlambat pertumbuhan kuartal ×0,9 & tampil di laporan kuartal', () => {
    const s = fresh(), p = pratama(s)[0];
    const twin = structuredClone(p);
    const ctx = { date: s.date, experience: new Map<string, number>(), doublesPlayers: new Set<string>() };
    developQuarter(p, rs.development, { ...ctx, heldBack: new Set([p.id]) }, makeRng(1));
    developQuarter(twin, rs.development, ctx, makeRng(1));
    expect(currentAbility(p.attrs)).toBeLessThanOrEqual(currentAbility(twin.attrs));
    p.readySince = absWeek(s.date) - LATE_WEEKS - 1;
    p.caDelta = 0;
    expect(quarterReport(s.players, 'INA', s.date).heldBack).toContain(p);
  });

  it('Pratama siap ikut turnamen senior grade 3 (IC/IS/FS) saja; Pratama belum siap tidak ke senior', async () => {
    const s = newSeason(WORLD, rs, 6, { year: 2026, week: 1 }, 'INA');
    const ps = pratama(s).sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
    const star = ps[0], weak = ps[ps.length - 1];
    for (const a of ATTRS) star.attrs[a] = 75;
    star.pa = 90;
    star.readySince = absWeek(s.date);
    const rng = makeRng(6);
    while (s.date.week < 30) await playWeek(s, rs, WORLD, rng);
    const tierOf = (id: string) => rs.calendar.find((e) => e.id === id)?.tierId;
    const senior = (id: string) => s.matches.filter((m) => m.sides.some((x) => x === id || s.pairs.find((p) => p.id === x)?.playerIds.includes(id)))
      .map((m) => tierOf(m.tournamentId)).filter((t) => t && !rs.tiers.find((x) => x.id === t)?.junior);
    const starTiers = new Set(senior(star.id));
    expect(starTiers.size).toBeGreaterThan(0);
    expect([...starTiers].every((t) => ['IC', 'IS', 'FS'].includes(t!))).toBe(true);
    if (weak.readySince === undefined) expect(senior(weak.id)).toEqual([]);
  }, 120000);
});
