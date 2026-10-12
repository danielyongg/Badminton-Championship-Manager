import { describe, expect, it } from 'vitest';
import { makeDraw, type DrawEntrant } from './draw';
import { bowlAt, replayDraw } from './drawReplay';
import { groupDraw } from './groups';
import { BWF_2026 } from './presets/bwf2026';
import { makeRng } from './rng';
import { runEvent, type DrawShow } from './tournament';

const rs = BWF_2026;
// Banyak peserta senegara → memaksa langkah "pemisahan negara" (tukar posisi).
const entrants = (n: number): DrawEntrant[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, countryId: ['CHN', 'INA', 'JPN', `C${i}`][i % 4], rank: i + 1 }));

describe('live drawing: putar ulang langkah undian', () => {
  it.each([
    [32, 0, 2], [28, 0, 1], [24, 4, 2], [48, 0, 2], [56, 8, 3], [64, 0, 1],
  ])('bagan %i peserta + %i qualifier (grade %i): hasil putar ulang = bagan asli', (n, q, grade) => {
    for (let seed = 1; seed <= 5; seed++) {
      const draw = makeDraw(entrants(n), q, grade, rs, makeRng(seed));
      const board = replayDraw(draw.steps);
      for (const s of draw.slots) {
        const b = board.slots[s.pos] ?? {};
        expect({ e: b.entrant, seed: b.seed, bye: !!b.bye, q: !!b.qualifier }, `pos ${s.pos}`)
          .toEqual({ e: s.entrant, seed: s.seed, bye: !!s.bye, q: !!s.qualifier });
      }
    }
  });

  it('mencakup langkah tukar posisi (pemisahan negara)', () => {
    let swaps = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const draw = makeDraw(entrants(32), 0, 2, rs, makeRng(seed));
      swaps += draw.steps.filter((x) => x.key === 'step_swap').length;
      const board = replayDraw(draw.steps);
      for (const sl of draw.slots) expect(board.slots[sl.pos]?.entrant).toBe(sl.entrant);
    }
    expect(swaps).toBeGreaterThan(0);
  });

  it('undian grup (pot): hasil putar ulang = grup asli; mangkuk berisi sisa pot', () => {
    const es = entrants(16);
    const drawn = groupDraw(es, { groups: 4, perGroup: 4, advance: 2 }, makeRng(3));
    const board = replayDraw(drawn.steps);
    expect(['A', 'B', 'C', 'D'].map((g) => board.groups[g])).toEqual(drawn.groups.map((g) => g.map((e) => e.id)));
    // Langkah pertama pot 2: mangkuk = keempat anggota pot 2.
    const i = drawn.steps.findIndex((s) => s.vars.k === 2);
    expect(bowlAt(drawn.steps, i)).toHaveLength(4);
    expect(bowlAt(drawn.steps, i + 3)).toHaveLength(1);
  });

  it('undian ditampilkan sebelum laga pertama (turnamen menunggu sampai ditutup)', async () => {
    const tournament = rs.calendar.find((e) => e.tierId === 'S300')!;
    let played = 0;
    const shows: DrawShow[] = [];
    await runEvent({
      tournament, discipline: 'MS', year: 2026, hostCountryId: 'XXX', ruleset: rs, rng: makeRng(1),
      candidates: entrants(40).map((e) => ({ id: e.id, countryId: e.countryId, rank: e.rank })),
      play: () => { played++; return { winner: 0, scores: [[21, 10], [21, 10]] }; },
      onDraw: (d) => { shows.push(d); expect(played).toBe(0); return Promise.resolve(); },
    });
    expect(shows).toHaveLength(1);
    expect(shows[0].size).toBe(32);
    expect(played).toBeGreaterThan(0);
  });
});
