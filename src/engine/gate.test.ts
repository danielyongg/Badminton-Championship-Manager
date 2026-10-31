import { describe, expect, it } from 'vitest';
import { roundOrder, type RoundShow } from './gate';
import { simulateMatch } from './match';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { liveTeamResults, newSeason, playWeek, weekKey, type ChooseEvent, type WeekHooks } from './season';
import type { DrawShow, LiveRequest } from './tournament';

const rs = BWF_2026;
const weekOf = async (week: number, hooks: (s: ReturnType<typeof newSeason>) => WeekHooks = () => ({}), seed = 3) => {
  const state = newSeason(WORLD, rs, seed, undefined, 'INA');
  const rng = makeRng(seed);
  while (state.date.week < week) await playWeek(state, rs, WORLD, rng);
  await playWeek(state, rs, WORLD, rng, hooks(state));
  return state;
};
/** Mainkan turnamen-turnamen ini satu per satu, lalu lewati sisanya. */
const choose = (ids: string[]): ChooseEvent => async ({ played }) => ids.find((id) => !played.includes(id)) ?? null;

describe('gerbang babak (turnamen dimainkan per babak)', () => {
  it('semua turnamen individu minggu 2: per hari pertandingan (hari maju, babak urut), order of play, hasil lengkap', async () => {
    const ids = rs.calendar.filter((e) => e.week === 2).map((e) => e.id);
    const shows: RoundShow[] = [];
    const state = await weekOf(2, () => ({ chooseEvent: choose(ids), round: (r) => { shows.push({ ...r, matches: r.matches.map((m) => ({ ...m })) }); return Promise.resolve(); } }));
    for (const id of ids) {
      const mine = shows.filter((s) => s.tournamentId === id);
      const days = mine.filter((s) => s.phase === 'pending').map((s) => s.day!);
      expect(days).toEqual([...days].sort((a, b) => a - b));
      const pend = mine.filter((s) => s.phase === 'pending');
      expect(pend.flatMap((s) => s.matches.filter((m) => !m.result).map((m) => m.round!)).map(roundOrder))
        .toEqual(pend.flatMap((s) => s.matches.filter((m) => !m.result).map((m) => roundOrder(m.round!))).sort((a, b) => a - b));
      expect(mine.at(-1)!.round).toBe('F');
      expect(mine.at(-1)!.day).toBe(mine.at(-1)!.plan!.days - 1);
      // Semua laga turnamen tampil sekali di layar hari dengan skor, lapangan & urutan; final = juara kelima nomor.
      const lastOfDay = new Map(mine.filter((s) => s.phase === 'done').map((s) => [s.day, s.matches]));
      const done = [...lastOfDay.values()].flat();
      expect(done.every((m) => m.result && m.court! >= 1 && m.order! >= 1)).toBe(true);
      for (const ms of lastOfDay.values()) expect(new Set(ms.map((m) => `${m.court}-${m.order}`)).size).toBe(ms.length);
      expect(done.length).toBe(state.matches.filter((m) => m.tournamentId === id).length);
      const champs = state.champions.filter((c) => c.tournamentId === id && c.year === 2026);
      const finals = mine.filter((s) => s.round === 'F' && s.phase === 'done').at(-1)!.matches;
      expect(champs.length).toBe(finals.length);
      for (const f of finals) expect(champs.find((c) => c.discipline === f.key)!.winner).toBe(f.sides[f.result!.winner]);
      expect(state.eventRecords.filter((r) => r.tournamentId === id && r.year === 2026).length).toBe(champs.length);
    }
  });

  it('turnamen dengan kualifikasi: entry & bagan kualifikasi di undian, babak Q sebelum R32, catatan terisi selama turnamen', async () => {
    const id = 'thailand-masters';
    const log: string[] = [];
    let drawn = 0;
    const listed: string[][] = [];
    const quals: string[] = [];
    const state = await weekOf(5, (s) => ({
      chooseEvent: choose([id]),
      // Daftar entry kelima nomor sekaligus, sebelum undian mana pun.
      entries: (e) => { expect(drawn).toBe(0); listed.push(e.lists.map((x) => x.discipline)); return Promise.resolve(); },
      // Bagan kualifikasi kelima nomor sekaligus di undian pertama; undian berikutnya tanpa kualifikasi.
      draw: (d) => {
        if (drawn++) expect(d.quals).toEqual([]);
        else for (const q of d.quals!) expect(q.sections.length).toBe(s.eventRecords.find((r) => r.tournamentId === id && r.discipline === q.discipline)!.entry.qualifierSlots);
        quals.push(...(d.quals ?? []).map((q) => q.discipline));
        return null;
      },
      round: (r) => {
        if (r.phase !== 'pending') return null;
        log.push(r.round);
        const recs = s.eventRecords.filter((x) => x.tournamentId === id && x.year === 2026);
        expect(recs.length).toBeGreaterThan(0);
        if (r.round === 'R32') for (const rec of recs) expect(rec.qualRounds.every((q) => q.at(-1)!.length === 1)).toBe(true); // kualifikasi selesai
        if (r.round === 'R16') for (const rec of recs) expect(rec.rounds[1].length).toBe(16); // R32 sudah terisi di catatan
        return null;
      },
    }));
    expect(drawn).toBe(5);
    expect(quals).toEqual(['MS', 'WS', 'MD', 'WD', 'XD']);
    expect(listed).toEqual([['MS', 'WS', 'MD', 'WD', 'XD']]);
    expect(log.indexOf('Q1')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('Q1')).toBeLessThan(log.indexOf('R32'));
    // Catatan akhir: satu per nomor, bagan lengkap sampai juara.
    const recs = state.eventRecords.filter((x) => x.tournamentId === id && x.year === 2026);
    expect(new Set(recs.map((r) => r.discipline)).size).toBe(recs.length);
    for (const rec of recs) expect(rec.rounds.at(-1)!.length).toBe(1);
  });

  it('langsung "Lewati semua" (null) = sama persis dengan jalur otomatis', async () => {
    const a = await weekOf(2, () => ({ chooseEvent: () => Promise.resolve(null) }));
    const b = await weekOf(2);
    expect(a.matches).toEqual(b.matches);
    expect(a.champions).toEqual(b.champions);
  });

  it('entry diubah sebelum batas entry dipakai; setelah daftar entry terbit, perubahan entry tidak berlaku (hanya mundur)', async () => {
    const auto = await weekOf(2);
    const ina = auto.matches.find((m) => m.tournamentId === 'malaysia-open' && m.discipline === 'MS' && m.sides.some((x) => x.startsWith('INA')))!;
    const id = ina.sides.find((x) => x.startsWith('INA'))!;
    const run = async (setAtWeek: number) => {
      const state = newSeason(WORLD, rs, 3, undefined, 'INA');
      const rng = makeRng(3);
      while (state.date.week <= 2) {
        if (state.date.week === setAtWeek) (state.manualEntries[weekKey({ year: 2026, week: 2 })] ??= {})[id] = 'rest';
        await playWeek(state, rs, WORLD, rng);
      }
      return state.matches.some((m) => m.tournamentId === 'malaysia-open' && m.sides.includes(id));
    };
    expect(await run(1)).toBe(false); // batas entry Malaysia Open (Super 1000) = minggu 1
    expect(await run(2)).toBe(true); // daftar sudah terbit: tetap ikut
  });

  it('live match hanya di turnamen yang dimainkan, di dalam babaknya; turnamen lain tanpa hook', async () => {
    const [id] = rs.calendar.filter((e) => e.week === 2).map((e) => e.id);
    const log: string[] = [];
    const live = (req: LiveRequest) => {
      if (!req.entrants.some((e) => e.startsWith('INA'))) return null;
      log.push(`live:${req.tournamentId}:${req.round}`);
      return Promise.resolve(simulateMatch(req.sides, rs.match, makeRng(1)));
    };
    const state = await weekOf(2, () => ({ chooseEvent: choose([id]), live, round: (r) => { if (r.phase !== 'playing') log.push(`${r.phase}:${r.round}`); return null; } }));
    const lives = log.filter((x) => x.startsWith('live'));
    expect(lives.length).toBe(state.matches.filter((m) => m.tournamentId === id && m.sides.some((s) => s.startsWith('INA'))).length);
    expect(lives.every((x) => x.startsWith(`live:${id}:`))).toBe(true);
    // Tiap live match berada di antara pending & done babaknya.
    log.forEach((x, i) => {
      if (!x.startsWith('live')) return;
      const round = x.split(':')[2];
      expect(log.slice(0, i).reverse().find((y) => !y.startsWith('live'))).toBe(`pending:${round}`);
    });
  });

  it('beregu (Thomas & Uber Cup): line-up tiap pertandingan INA, skor sah, babak berurutan', async () => {
    const lineups: string[] = [];
    const shows: RoundShow[] = [];
    const liveTies: number[] = []; // hasil sementara (halaman turnamen) saat tiap babak dimulai
    const koDraws: DrawShow[] = [];
    const state = await weekOf(17, (s) => ({
      chooseEvent: choose(['thomas-uber-cup']),
      draw: (d) => { if (d.ko) koDraws.push(d); return null; },
      team: { squad: () => null, lineup: (req) => { lineups.push(`${req.format}:${req.round}`); return Promise.resolve(req.suggested); } },
      round: (r) => {
        if (r.phase === 'done') shows.push(r);
        if (r.phase === 'pending') {
          const live = liveTeamResults.get(s) ?? [];
          expect(live.map((x) => x.format).sort()).toEqual(['thomas', 'uber']);
          expect(live.every((x) => x.groups?.length)).toBe(true);
          // Babak gugur pertama dimulai: klasemen grup & pasangan laga gugur sudah tercatat sebelum dimainkan.
          if (r.round === 'QF') for (const x of live) { expect(x.standings?.length).toBe(x.groups!.length); expect(x.bracket![0].filter(Boolean).length).toBe(8); }
          liveTies.push(live.reduce((n, x) => n + x.ties.length, 0));
        }
        return null;
      },
    }), 8);
    expect(liveTies[0]).toBe(0);
    expect(liveTies).toEqual([...liveTies].sort((a, b) => a - b));
    expect(liveTies.at(-1)).toBeGreaterThan(0);
    expect(liveTeamResults.get(state)).toEqual([]); // selesai → pindah ke teamResults
    const res = state.teamResults.filter((r) => r.eventId === 'thomas-uber-cup' && r.year === 2026);
    expect(res.map((r) => r.format).sort()).toEqual(['thomas', 'uber']);
    for (const r of res) expect(r.bracket!.at(-1)).toEqual([Object.keys(r.reached).find((c) => r.reached[c] === 'W')]);
    const inaTies = res.flatMap((r) => r.ties.filter((t) => t.sides.includes('INA')).map((t) => `${r.format}:${t.round}`));
    expect(lineups.sort()).toEqual(inaTies.sort());
    for (const r of res) for (const t of r.ties) expect(Math.max(...t.score)).toBeGreaterThanOrEqual(3);
    expect(shows.map((s) => s.round)).toEqual(['G', 'G', 'G', 'QF', 'SF', 'F']); // grup: satu matchday (tie) per hari
    // Undian babak gugur (live drawing) sekali per format: 4 juara grup di posisi tetap, 4 runner-up di paruh lain.
    expect(koDraws.map((d) => d.format).sort()).toEqual(['thomas', 'uber']);
    for (const d of koDraws) {
      expect(d.size).toBe(8);
      const win = d.steps.filter((x) => x.key === 'step_winner'), run = d.steps.filter((x) => x.key === 'step_runnerUp');
      expect([win.length, run.length]).toEqual([4, 4]);
      for (const r of run) expect(r.pos! <= 4).not.toBe(win.find((w) => w.vars.g === r.vars.g)!.pos! <= 4);
    }
    expect(shows.flatMap((s) => s.matches).length).toBe(res.reduce((n, r) => n + r.ties.length, 0));
  });
});

describe('urutan babak', () => {
  it('kualifikasi → grup → babak utama; QF bukan babak kualifikasi', () => {
    const order = ['Q1', 'Q2', 'G', 'R64', 'R32', 'R16', 'QF', 'SF', 'F'] as const;
    expect(order.map(roundOrder)).toEqual([...order.map(roundOrder)].sort((a, b) => a - b));
    expect(order.map(roundOrder).every(Number.isFinite)).toBe(true);
  });
});

it('jadwal harian: bagan selalu memajukan pemenang laga yang tercatat (juga gelombang kedua di hari yang sama, mis. Q2 setelah Q1)', async () => {
  const id = 'thailand-masters'; // Super 300 dengan kualifikasi: Q1 & Q2 di hari pertama (dua gelombang)
  const state = await weekOf(5, () => ({ chooseEvent: choose([id]), round: () => Promise.resolve() }));
  const ms = state.matches.filter((m) => m.tournamentId === id && m.year === 2026);
  expect(ms.length).toBeGreaterThan(0);
  let checked = 0;
  for (const rec of state.eventRecords.filter((r) => r.tournamentId === id && r.year === 2026))
    for (const rounds of [rec.rounds, ...rec.qualRounds])
      rounds.forEach((field, r) => {
        const next = rounds[r + 1];
        if (!next) return;
        for (let k = 0; k < field.length / 2; k++) {
          const a = field[2 * k], b = field[2 * k + 1];
          if (!a || !b) continue;
          const m = ms.find((x) => x.discipline === rec.discipline && x.sides.includes(a) && x.sides.includes(b));
          expect(next[k], `${rec.discipline} ${a} vs ${b}`).toBe(m!.sides[m!.winner]);
          checked++;
        }
      });
  expect(checked).toBeGreaterThan(50);
});
