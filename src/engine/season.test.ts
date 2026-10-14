import { beforeAll, describe, expect, it } from 'vitest';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { absWeek, computeRanking } from './ranking';
import { presetPack, PRESETS } from './pack';
import { makeRng } from './rng';
import { formPairs, newSeason, playWeek, wtfQualifiers } from './season';
import { ATTRS, DISCIPLINES } from './types';

describe('satu musim penuh (BWF 2026)', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 1);
  const startRanking = computeRanking(state.results, 'MS', absWeek(state.date), rs);
  // Catatan turnamen lama (> 2 musim) harus terhapus di akhir musim.
  state.eventRecords.push({ tournamentId: 'kuno', year: 2024, discipline: 'MS', entry: { main: [], wildcards: [], qualifying: [], reserves: [], qualifierSlots: 0 }, qualRounds: [], steps: [], slots: [], rounds: [[null]] });
  const rng = makeRng(2);
  let qualifiers: Record<string, ReturnType<typeof wtfQualifiers>> = {};
  let ms = 0;
  beforeAll(async () => {
    const t0 = performance.now();
    // Sampai minggu 49: kualifikasi WTF diperiksa sebelum WTF dimainkan.
    while (state.date.week < 50) await playWeek(state, rs, WORLD, rng);
    qualifiers = Object.fromEntries(DISCIPLINES.map((d) => [d, wtfQualifiers(state, d, rs)]));
    while (state.date.year === 2026) await playWeek(state, rs, WORLD, rng);
    ms = performance.now() - t0;
  }, 60000);

  const eventsOf = (entrant: string) => new Set(state.matches.filter((m) => m.sides.includes(entrant)).map((m) => m.tournamentId));
  const tierOfEvent = (id: string) => rs.calendar.find((e) => e.id === id)?.tierId;

  it('cukup cepat', () => expect(ms).toBeLessThan(30000));

  it('catatan turnamen: tiap nomor yang dimainkan tercatat, yang > 2 musim dihapus, ukuran wajar', () => {
    const played = new Set(state.matches.filter((m) => m.year === 2026 && rs.calendar.some((e) => e.id === m.tournamentId)).map((m) => `${m.tournamentId}:${m.discipline}`));
    const recorded = new Set(state.eventRecords.filter((r) => r.year === 2026).map((r) => `${r.tournamentId}:${r.discipline}`));
    expect([...played].filter((k) => !recorded.has(k))).toEqual([]);
    expect(state.eventRecords.some((r) => r.year < 2025)).toBe(false);
    const mb = JSON.stringify(state.eventRecords).length / 1e6;
    console.log(`catatan turnamen 1 musim: ${mb.toFixed(2)} MB, ${state.eventRecords.length} nomor`);
    expect(mb).toBeLessThan(6);
  });

  it('hadiah uang: juara tunggal S1000 dapat 7,5% hadiah; juara ganda 7,9% dibagi dua; total sesuai tabel', () => {
    const ev = rs.calendar.find((e) => e.id === 'malaysia-open')!;
    const tier = rs.tiers.find((x) => x.id === ev.tierId)!;
    const champ = (d: string) => state.champions.find((c) => c.tournamentId === ev.id && c.year === 2026 && c.discipline === d)!.winner;
    const earned = state.earnings[2026];
    expect(earned[champ('MS')]).toBeGreaterThanOrEqual((ev.prizeUsd * tier.prizeSplit.singles[0]) / 100);
    const pair = state.pairs.find((p) => p.id === champ('MD'))!;
    for (const id of pair.playerIds) expect(earned[id]).toBeGreaterThanOrEqual((ev.prizeUsd * tier.prizeSplit.doubles[0]) / 200);
    // Total hadiah musim = jumlah (hadiah × % babak) seluruh peserta main draw — dicek kasar: positif & < total hadiah kalender.
    const total = Object.values(earned).reduce((x, y) => x + y, 0);
    const pool = rs.calendar.reduce((x, e) => x + e.prizeUsd, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(pool);
  });

  it('bagan tercatat cocok dengan laga & juara resmi', () => {
    for (const r of state.eventRecords.filter((x) => x.year === 2026)) {
      const ms = state.matches.filter((m) => m.tournamentId === r.tournamentId && m.year === 2026 && m.discipline === r.discipline);
      const met = (a: string, b: string) => ms.some((m) => m.sides.includes(a) && m.sides.includes(b));
      r.rounds.slice(0, -1).forEach((field) => {
        for (let k = 0; k < field.length; k += 2)
          if (field[k] && field[k + 1]) expect(met(field[k]!, field[k + 1]!), `${r.tournamentId} ${r.discipline}`).toBe(true);
      });
      for (const sec of r.qualRounds)
        for (let k = 0; k < sec[0].length; k += 2) if (sec[0][k] && sec[0][k + 1]) expect(met(sec[0][k]!, sec[0][k + 1]!)).toBe(true);
      const champ = state.champions.find((c) => c.tournamentId === r.tournamentId && c.year === 2026 && c.discipline === r.discipline)!;
      expect(r.rounds.at(-1)![0]).toBe(champ.winner);
    }
  });

  it('atlet top bermain jumlah turnamen yang realistis (±10–26, cedera bisa mengurangi)', async () => {
    for (const r of startRanking.slice(0, 10)) {
      const n = eventsOf(r.entrantId).size;
      expect(n, r.entrantId).toBeGreaterThanOrEqual(10);
      expect(n, r.entrantId).toBeLessThanOrEqual(26);
    }
  });

  it('Top Committed: top 15 tunggal hadir di Super 1000 & Super 750 (absen hanya karena cedera → tanpa pelanggaran)', async () => {
    const big = rs.calendar.filter((e) => e.tierId === 'S1000' || e.tierId === 'S750').map((e) => e.id);
    let missed = 0;
    for (const r of startRanking.filter((x) => x.rank <= 15)) {
      const played = eventsOf(r.entrantId);
      missed += big.filter((id) => !played.has(id)).length;
    }
    expect(missed).toBeLessThanOrEqual(15 * big.length * 0.15); // sebagian besar hadir
    expect(state.violations).toHaveLength(0); // setiap absen dikecualikan karena cedera
  });

  it('Top Committed juga wajib 2 Super 500 (absen hanya karena cedera)', async () => {
    const short = startRanking.filter((x) => x.rank <= 15)
      .filter((r) => [...eventsOf(r.entrantId)].filter((id) => tierOfEvent(id) === 'S500').length < 2);
    expect(short.length).toBeLessThanOrEqual(2);
    expect(state.violations).toHaveLength(0);
  });

  it('WTF: 8 peserta, maks 2 per negara (kecuali juara dunia), juara dunia lolos, format grup → SF → F', async () => {
    const wcIds = new Set(rs.calendar.filter((e) => e.tierId === 'WC').map((e) => e.id));
    for (const d of DISCIPLINES) {
      const q = qualifiers[d];
      expect(q).toHaveLength(8);
      const champ = state.champions.find((c) => c.year === 2026 && c.discipline === d && wcIds.has(c.tournamentId))!.winner;
      expect(q.some((c) => c.id === champ), `${d} juara dunia`).toBe(true);
      const perCountry: Record<string, number> = {};
      q.filter((c) => c.id !== champ).forEach((c) => (perCountry[c.countryId] = (perCountry[c.countryId] ?? 0) + 1));
      expect(Math.max(...Object.values(perCountry))).toBeLessThanOrEqual(2);

      const wtf = state.matches.filter((m) => m.tournamentId === 'world-tour-finals' && m.discipline === d);
      expect(wtf.filter((m) => m.round === 'G')).toHaveLength(12); // 2 grup × 6 laga
      expect(wtf.filter((m) => m.round === 'SF')).toHaveLength(2);
      expect(wtf.filter((m) => m.round === 'F')).toHaveLength(1);
    }
  });

  it('kelelahan tetap 0–100', async () => {
    for (const p of state.players) {
      expect(p.fatigue).toBeGreaterThanOrEqual(0);
      expect(p.fatigue).toBeLessThanOrEqual(100);
    }
  });
});

it('BWF 2027: tunggal Super 1000 memakai fase grup 16 × 3 → R16', async () => {
  const rs = BWF_2027;
  const state = newSeason(WORLD, rs, 3, { year: 2027, week: 1 });
  const rng = makeRng(4);
  while (state.date.week <= 2) await playWeek(state, rs, WORLD, rng); // Malaysia Open minggu 2
  const ms = state.matches.filter((m) => m.tournamentId === 'malaysia-open' && m.discipline === 'MS');
  expect(ms.filter((m) => m.round === 'G')).toHaveLength(16 * 3);
  expect(ms.filter((m) => m.round === 'R16')).toHaveLength(8);
  const md = state.matches.filter((m) => m.tournamentId === 'malaysia-open' && m.discipline === 'MD');
  expect(md.filter((m) => m.round === 'G')).toHaveLength(0);
});

describe('beberapa musim (perkembangan, pensiun, regenerasi)', () => {
  const rs = BWF_2026;
  const state = newSeason(WORLD, rs, 7);
  const active = (c?: string) => state.players.filter((p) => p.retired === undefined && (!c || p.countryId === c)).length;
  const start = { all: active(), chn: active('CHN'), nzl: active('NZL') };
  const rng = makeRng(8);
  beforeAll(async () => {
    while (state.date.year < 2031) await playWeek(state, rs, WORLD, rng);
  }, 60000);

  it('populasi atlet stabil (±30%) setelah 5 musim', async () => {
    for (const [c, n] of [[undefined, start.all], ['CHN', start.chn]] as const) {
      expect(active(c)).toBeGreaterThan(n * 0.7);
      expect(active(c)).toBeLessThan(n * 1.3);
    }
  });

  it('ada pensiunan, junior baru, dan riwayat atribut per musim', async () => {
    expect(state.players.some((p) => p.retired !== undefined)).toBe(true);
    expect(state.players.some((p) => p.id.includes('2030'))).toBe(true);
    const veteran = state.players.find((p) => p.retired === undefined && p.attrHistory.length >= 5)!;
    expect(veteran.attrHistory.map((h) => h.year)).toEqual([2025, 2026, 2027, 2028, 2029, 2030]);
  });

  it('pasangan aktif tidak berisi pensiunan; jumlah pasangan dipertahankan AI', async () => {
    const retired = new Set(state.players.filter((p) => p.retired !== undefined).map((p) => p.id));
    const activePairs = state.pairs.filter((p) => !p.dissolved);
    for (const p of activePairs) expect(p.playerIds.some((id) => retired.has(id))).toBe(false);
    const chnMD = activePairs.filter((p) => p.discipline === 'MD' && p.id.startsWith('CHN')).length;
    expect(chnMD).toBeGreaterThanOrEqual(6);
  });

  it('CA tidak pernah melampaui PA', async () => {
    for (const p of state.players) expect(ATTRS.reduce((s, a) => s + p.attrs[a], 0) / ATTRS.length).toBeLessThanOrEqual(p.pa + 1e-9);
  });
});

describe('pembentukan pasangan AI', () => {
  it('id pasangan tetap unik bila dibentuk lagi di tahun yang sama (akhir musim)', () => {
    const pack = presetPack(PRESETS[0]);
    const state = newSeason(pack.world, pack.ruleset, 1, undefined, 'INA', pack);
    const ai = state.pairs.filter((p) => /2026-\d+$/.test(p.id));
    expect(ai.length).toBeGreaterThan(0);
    for (const p of ai.filter((_, i) => i % 2 === 0)) p.dissolved = { ...state.date }; // sebagian bubar → AI membentuk lagi
    formPairs(state, pack.ruleset, pack.world, makeRng(9));
    const ids = state.pairs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
