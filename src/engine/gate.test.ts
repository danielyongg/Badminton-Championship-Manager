import { describe, expect, it } from 'vitest';
import { roundOrder, type RoundShow } from './gate';
import { simulateMatch } from './match';
import { BWF_2026 } from './presets/bwf2026';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { liveTeamResults, newSeason, playWeek, weekKey, type ChooseEvent, type WeekHooks } from './season';
import type { LiveRequest } from './tournament';

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
  it('semua turnamen individu minggu 2: babak berurutan, tiap babak sekali (pending → done), hasil lengkap', async () => {
    const ids = rs.calendar.filter((e) => e.week === 2).map((e) => e.id);
    const shows: RoundShow[] = [];
    const state = await weekOf(2, () => ({ chooseEvent: choose(ids), round: (r) => { shows.push({ ...r, matches: r.matches.map((m) => ({ ...m })) }); return Promise.resolve(); } }));
    for (const id of ids) {
      const mine = shows.filter((s) => s.tournamentId === id);
      const rounds = mine.filter((s) => s.phase === 'pending').map((s) => s.round);
      expect(mine.filter((s) => s.phase === 'done').map((s) => s.round)).toEqual(rounds);
      expect(new Set(rounds).size).toBe(rounds.length);
      expect(rounds.map(roundOrder)).toEqual([...rounds.map(roundOrder)].sort((a, b) => a - b));
      expect(rounds.at(-1)).toBe('F');
      // Semua laga turnamen tampil di layar babak dengan skor; final = juara kelima nomor.
      const done = mine.filter((s) => s.phase === 'done').flatMap((s) => s.matches);
      expect(done.every((m) => m.result)).toBe(true);
      expect(done.length).toBe(state.matches.filter((m) => m.tournamentId === id).length);
      const champs = state.champions.filter((c) => c.tournamentId === id && c.year === 2026);
      const finals = mine.find((s) => s.round === 'F' && s.phase === 'done')!.matches;
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

  it('entry yang diubah dari layar minggu (sebelum turnamen pertama) dipakai minggu itu', async () => {
    const auto = await weekOf(2);
    const ina = auto.matches.find((m) => m.tournamentId === 'malaysia-open' && m.discipline === 'MS' && m.sides.some((x) => x.startsWith('INA')))!;
    const id = ina.sides.find((x) => x.startsWith('INA'))!;
    const state = await weekOf(2, (st) => ({
      chooseEvent: async ({ played }) => {
        if (!played.length) st.manualEntries[weekKey(st.date)] = { [id]: 'rest' }; // diatur saat layar minggu terbuka
        return played.length ? null : 'malaysia-open';
      },
    }));
    expect(state.matches.some((m) => m.tournamentId === 'malaysia-open' && m.sides.includes(id))).toBe(false);
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
    const state = await weekOf(18, (s) => ({
      chooseEvent: choose(['thomas-uber-cup']),
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
    expect(shows.map((s) => s.round)).toEqual(['G', 'QF', 'SF', 'F']);
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
