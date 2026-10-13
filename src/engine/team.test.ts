import { describe, expect, it } from 'vitest';
import { teamLevel } from './career';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { entrantsFor, finalsTeams, newSeason, playWeek, teamStrengths, type SeasonState, type TeamHook, type WeekHooks } from './season';
import { isJuniorAge } from './generator';
import { adHocId, autoLineup, autoSquad, lineupError, playTie, squadError, type Lineup, type TeamEntrant } from './team';
import type { DrawShow } from './tournament';
import type { Ruleset } from './types';

const until = async (state: SeasonState, rs: Ruleset, week: number, seed = 1, hooks: WeekHooks = {}) => {
  const rng = makeRng(seed);
  while (state.date.week < week) await playWeek(state, rs, WORLD, rng, hooks);
};
const single = (id: string): TeamEntrant => ({ id, playerIds: [id] });
const pair = (a: string, b: string): TeamEntrant => ({ id: `${a}${b}`, playerIds: [a, b] });

describe('line-up beregu', () => {
  it('Sudirman: atlet maks 2 partai, line-up otomatis melewati atlet yang sudah 2 kali', () => {
    const order = BWF_2026.team.order.sudirman; // XD WS MS WD MD
    const pool = { XD: [pair('m1', 'w1')], WS: [single('w1'), single('w2')], MS: [single('m1')], WD: [pair('w1', 'w3'), pair('w2', 'w3')], MD: [pair('m1', 'm2'), pair('m2', 'm3')] };
    const lineup = autoLineup(order, pool, 2);
    expect(lineup).toEqual(['m1w1', 'w1', 'm1', 'w2w3', 'm2m3']);
    const all = new Map(Object.values(pool).flat().map((e) => [e.id, e]));
    expect(lineupError(lineup, order, all, 2)).toBeNull();
    expect(lineupError(['m1w1', 'w1', 'm1', 'w2w3', 'm1m2'], order, all, 2)).toMatch(/maksimal 2/);
  });

  it('Thomas: atlet tidak boleh dua kali di tunggal; partai kosong = galat', () => {
    const order = BWF_2026.team.order.thomas;
    const all = new Map([single('a'), single('b'), single('c'), pair('a', 'd'), pair('e', 'f')].map((e) => [e.id, e]));
    expect(lineupError(['a', 'ad', 'b', 'ef', 'c'], order, all, 2)).toBeNull();
    expect(lineupError(['a', 'ad', 'a', 'ef', 'c'], order, all, 2)).toMatch(/dua kali/);
    expect(lineupError(['a', 'ad', 'b', null, 'c'], order, all, 2)).toMatch(/Partai 4/);
  });

  it('babak gugur berhenti di 3–0; fase grup memainkan kelima partai', async () => {
    const order = BWF_2026.team.order.thomas;
    let played = 0;
    const win = () => () => { played++; return { winner: 0 as const, scores: [[21, 10], [21, 10]] as [number, number][] }; };
    const lineups: [string[], string[]] = [['a', 'b', 'c', 'd', 'e'], ['f', 'g', 'h', 'i', 'j']];
    const ko = await playTie(lineups, order, 'QF', win, false);
    expect([ko.winner, played, ko.scores.length]).toEqual([0, 3, 3]);
    played = 0;
    const g = await playTie(lineups, order, 'G', win, true);
    expect([played, g.scores]).toEqual([5, Array(5).fill([2, 0])]);
  });
});

describe('skuad beregu', () => {
  const order = BWF_2026.team.order.thomas;
  const pool = {
    MS: ['a', 'b', 'c', 'd', 'e'].map(single),
    MD: [pair('a', 'f'), pair('g', 'h'), pair('i', 'j')],
  };
  const size = { min: 4, max: 10 };

  it('skuad otomatis: atlet line-up terbaik masuk, maksimal sesuai ukuran, line-up bisa diisi', () => {
    const squad = autoSquad(order, pool, 2, 6);
    expect(squad.length).toBeLessThanOrEqual(6);
    expect(squad).toEqual(expect.arrayContaining(['a', 'b', 'c', 'f', 'g', 'h'])); // MS a,b,c + MD af, gh
    expect(squadError(squad, order, pool, 2, size)).toBeNull();
  });

  it('aturan skuad: jumlah, atlet tersedia, dan kelima partai harus bisa diisi', () => {
    expect(squadError(['a', 'b', 'c'], order, pool, 2, size)).toMatch(/4–10/);
    expect(squadError(['a', 'b', 'c', 'zz'], order, pool, 2, size)).toMatch(/tidak tersedia/);
    expect(squadError(['a', 'b', 'c', 'd', 'e'], order, pool, 2, size)).toMatch(/kelima partai/); // tanpa pasangan ganda
  });
});

describe('Thomas, Uber & Sudirman Cup', () => {
  it('tahun genap: kontinental + Thomas & Uber (16 tim, 4 grup × 4 → QF), tanpa Sudirman', async () => {
    const state = newSeason(WORLD, BWF_2026, 3, undefined, 'INA');
    await until(state, BWF_2026, 19, 3);
    const finals = state.teamResults.filter((r) => !r.confederation);
    expect(finals.map((r) => r.format).sort()).toEqual(['thomas', 'uber']);
    for (const r of finals) {
      expect(r.teams).toHaveLength(16);
      expect(r.groups!.map((g) => g.length)).toEqual([4, 4, 4, 4]);
      expect(r.ties.filter((t) => t.round === 'G')).toHaveLength(24);
      expect(r.ties.filter((t) => t.round === 'G').every((t) => t.score[0] + t.score[1] === 5)).toBe(true);
      expect(r.ties.filter((t) => t.round !== 'G').map((t) => t.round)).toEqual(['QF', 'QF', 'QF', 'QF', 'SF', 'SF', 'F']);
      expect(r.ties.filter((t) => t.round !== 'G').every((t) => Math.max(...t.score) === 3)).toBe(true);
      expect(r.teams).toContain('DEN'); // tuan rumah (Horsens)
      // Tiap konfederasi terwakili (juara kontinental lolos), termasuk Afrika & Oseania.
      const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation]));
      expect(new Set(r.teams.map((c) => conf.get(c)))).toEqual(new Set(['BA', 'BE', 'BAM', 'BCA', 'BO']));
      for (const c of state.teamResults.filter((x) => x.confederation && x.format === r.format))
        expect(r.teams).toContain(Object.keys(c.reached).find((k) => c.reached[k] === 'W'));
      // Juara grup & runner-up yang sama tidak bertemu di QF.
      for (const t of r.ties.filter((x) => x.round === 'QF'))
        expect(r.groups!.some((g) => g.includes(t.sides[0]) && g.includes(t.sides[1]))).toBe(false);
    }
    expect(state.matches.some((m) => m.tournamentId === 'thomas-uber-cup' && m.discipline === 'WD')).toBe(true);
    expect(state.matches.some((m) => m.tournamentId === 'sudirman-cup')).toBe(false);
    // Target federasi beregu sesuai hasil.
    const thomas = state.career!.goals.find((g) => g.kind === 'team' && g.format === 'thomas')!;
    expect(thomas.target).toBeGreaterThan(0);
    expect(teamLevel(state, 'INA', 2026, 'thomas')).toBeGreaterThanOrEqual(1);
  });

  it('tahun ganjil: Sudirman Cup (XD, WS, MS, WD, MD), tanpa Thomas & Uber', async () => {
    const state = newSeason(WORLD, BWF_2027, 4, { year: 2027, week: 1 }, null);
    await until(state, BWF_2027, 19, 4);
    const finals = state.teamResults.filter((r) => !r.confederation);
    expect(finals.map((r) => r.format)).toEqual(['sudirman']);
    expect(finals[0].teams).toHaveLength(16);
    expect(state.teamResults.filter((r) => r.confederation).every((r) => r.format === 'sudirman')).toBe(true);
    const disc = new Set(state.matches.filter((m) => m.tournamentId === 'sudirman-cup').map((m) => m.discipline));
    expect([...disc].sort()).toEqual(['MD', 'MS', 'WD', 'WS', 'XD']);
  });

  it('kuota kontinental: 4 teratas Asia (semifinalis) lolos; yang sudah lolos sebagai juara bertahan → kursi ke tim berikutnya', () => {
    const state = newSeason(WORLD, BWF_2026, 5, undefined, null);
    const all = teamStrengths(state, BWF_2026, 'thomas');
    const asia = ['CHN', 'INA', 'JPN', 'KOR', 'MAS', 'TPE', 'THA', 'IND'];
    // Finis: JPN juara, TPE final, KOR & INA semifinal, sisanya QF. CHN juara bertahan.
    const reached = { JPN: 'W', TPE: 'F', KOR: 'SF', INA: 'SF', CHN: 'QF', MAS: 'QF', THA: 'QF', IND: 'QF' } as const;
    state.teamResults.push(
      { eventId: 'thomas-uber-cup', year: 2024, format: 'thomas', teams: ['CHN'], reached: { CHN: 'W' }, ties: [], squads: {} },
      { eventId: 'asia-team', year: 2026, format: 'thomas', confederation: 'BA', teams: asia, reached: { ...reached }, ties: [], squads: {} },
    );
    const teams = finalsTeams(state, BWF_2026, 'thomas', 'DEN', all);
    expect(teams).toHaveLength(16);
    expect(teams).toEqual(expect.arrayContaining(['DEN', 'CHN', 'JPN', 'TPE', 'KOR', 'INA']));
  });

  it('juara bertahan semifinalis kontinental: kursinya jatuh ke tim Asia berikutnya', () => {
    const state = newSeason(WORLD, BWF_2026, 5, undefined, null);
    // Hanya 5 tim Asia agar urutan "berikutnya" jelas; semua tim lain non-Asia dikeluarkan dari daftar kekuatan.
    const all = teamStrengths(state, BWF_2026, 'thomas').filter((t) => ['CHN', 'INA', 'JPN', 'KOR', 'MAS', 'DEN'].includes(t.countryId));
    state.teamResults.push(
      { eventId: 'thomas-uber-cup', year: 2024, format: 'thomas', teams: ['CHN'], reached: { CHN: 'W' }, ties: [], squads: {} },
      { eventId: 'asia-team', year: 2026, format: 'thomas', confederation: 'BA', teams: ['CHN', 'INA', 'JPN', 'KOR', 'MAS'],
        reached: { CHN: 'W', INA: 'F', JPN: 'SF', KOR: 'SF', MAS: 'QF' }, ties: [], squads: {} },
    );
    const rs = structuredClone(BWF_2026);
    rs.team.finals.teams = 6; // DEN + CHN + 4 Asia → tidak ada kursi ranking tersisa
    // CHN (juara Asia) sudah lolos sebagai juara bertahan → kursi Asia ke-4 jatuh ke MAS (kalah QF).
    expect(finalsTeams(state, rs, 'thomas', 'DEN', all).sort()).toEqual(['CHN', 'DEN', 'INA', 'JPN', 'KOR', 'MAS']);
  });

  it('live drawing: undian pot putaran final beregu ditampilkan & tersimpan untuk putar ulang', async () => {
    const state = newSeason(WORLD, BWF_2026, 9, undefined, 'INA');
    const team: DrawShow[] = [];
    await until(state, BWF_2026, 19, 9, { draw: (d) => { if (!d.discipline) team.push(d); return null; } });
    expect(team.map((d) => d.tournamentId)).toEqual(['thomas-uber-cup', 'thomas-uber-cup']);
    for (const d of team) {
      expect(d.groups).toBe(4);
      expect(d.steps.filter((s) => s.key === 'step_pot')).toHaveLength(16);
    }
    const finals = state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.format === 'thomas')!;
    expect(finals.drawSteps).toHaveLength(16);
  });

  it('ganda dadakan: dua atlet skuad yang tidak berpasangan bisa main ganda beregu (pasangan khusus, tanpa ranking)', async () => {
    const state = newSeason(WORLD, BWF_2026, 10, undefined, 'INA');
    let token = '';
    const hook: TeamHook = {
      squad: () => null,
      lineup: (req) => {
        if (req.format !== 'thomas' || token) return token ? Promise.resolve(req.suggested) : null;
        // Partai 2 (MD): dua atlet skuad yang BELUM berpasangan MD; partai 4 = pasangan terdaftar tanpa keduanya.
        const paired = (x: string, y: string) => state.pairs.some((p) => p.discipline === 'MD' && !p.dissolved && p.playerIds.includes(x) && p.playerIds.includes(y));
        const l = [...req.suggested];
        const singles = [l[0]!, l[2]!, l[4]!];
        for (const x of req.squad) for (const y of req.squad)
          if (!token && x < y && !paired(x, y) && state.players.find((p) => p.id === x)!.gender === 'M' && state.players.find((p) => p.id === y)!.gender === 'M') {
            const md2 = req.pool.MD.find((e) => !e.playerIds.includes(x) && !e.playerIds.includes(y));
            const busy = [x, y].filter((id) => singles.includes(id)).length;
            if (md2 && busy <= 2) { token = adHocId(x, y); l[1] = token; l[3] = md2.id; }
          }
        return Promise.resolve(l);
      },
    };
    await until(state, BWF_2026, 8, 10, { team: hook });
    const [a, b] = token.slice('adhoc:'.length).split('+');
    const pair = state.pairs.find((p) => p.discipline === 'MD' && p.playerIds.includes(a) && p.playerIds.includes(b) && !p.dissolved)!;
    expect(pair).toBeDefined();
    expect(state.matches.some((m) => m.discipline === 'MD' && m.sides.includes(pair.id))).toBe(true);
    expect(pair.adHoc).toBe(true);
    expect(entrantsFor(state, 'MD').some((e) => e.id === pair.id)).toBe(false); // bukan peserta turnamen individu
  });

  it('tiap pertandingan beregu menyimpan laga per partai (untuk detail laga)', async () => {
    const state = newSeason(WORLD, BWF_2026, 9, undefined, null);
    await until(state, BWF_2026, 19, 9);
    const finals = state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.format === 'thomas')!;
    const byId = new Map(state.matches.map((m) => [m.id, m]));
    for (const tie of finals.ties) {
      const ms = tie.matchIds!.map((id) => byId.get(id)!);
      expect(ms.length).toBe(tie.score[0] + tie.score[1]);
      expect(ms.every((m) => m.tournamentId === 'thomas-uber-cup' && m.round === tie.round)).toBe(true);
      expect(ms.map((m) => m.discipline)).toEqual(BWF_2026.team.order.thomas.slice(0, ms.length));
    }
  });

  it('Suhandinata Cup (minggu 40): beregu campuran U19 tiap tahun, s/d 32 tim, ranking junior; tidak masuk target musim', async () => {
    for (const r of [BWF_2026, BWF_2027]) expect(r.team.events.filter((e) => e.formats?.includes('suhandinata') && !e.everyYears && e.week === 40)).toHaveLength(1);
    const state = newSeason(WORLD, BWF_2026, 12, undefined, 'INA');
    await until(state, BWF_2026, 41, 12);
    const res = state.teamResults.find((r) => r.format === 'suhandinata')!;
    expect(res.teams.length).toBeGreaterThan(16); // semua negara yang bisa menurunkan tim junior lengkap, maks 32
    expect(res.teams.length).toBeLessThanOrEqual(32);
    expect(res.ties.filter((t) => t.round === 'R16')).toHaveLength(8);
    expect(res.teams).toContain('INA');
    const players = new Map(state.players.map((p) => [p.id, p]));
    const pairs = new Map(state.pairs.map((p) => [p.id, p]));
    const ids = res.ties.flatMap((t) => t.matchIds!).map((id) => state.matches.find((m) => m.id === id)!);
    expect(ids.length).toBeGreaterThan(60);
    for (const m of ids) for (const s of m.sides) for (const id of pairs.get(s)?.playerIds ?? [s])
      expect(isJuniorAge(players.get(id)!, { year: 2026, week: 40 })).toBe(true);
    expect(Object.values(res.squads).flat().every((id) => isJuniorAge(players.get(id)!, { year: 2026, week: 40 }))).toBe(true);
    expect(state.career!.goals.some((g) => g.format === 'suhandinata')).toBe(false);
    // Kejuaraan kontinental tidak memainkan format junior.
    expect(state.teamResults.some((r) => r.confederation && r.format === 'suhandinata')).toBe(false);
  }, 60000);

  it('juara bertahan lolos ke putaran final walau timnya lemah', () => {
    const state = newSeason(WORLD, BWF_2026, 5, undefined, null);
    const all = teamStrengths(state, BWF_2026, 'thomas');
    const weak = all.at(-1)!.countryId;
    state.teamResults.push({ eventId: 'thomas-uber-cup', year: 2024, format: 'thomas', teams: [weak], reached: { [weak]: 'W' }, ties: [], squads: {} });
    const teams = finalsTeams(state, BWF_2026, 'thomas', 'DEN', all);
    expect(teams).toHaveLength(16);
    expect(teams).toContain(weak);
    expect(teams).toContain('DEN');
  });

  it('line-up manajer dipakai; line-up tidak sah diganti otomatis', async () => {
    const state = newSeason(WORLD, BWF_2026, 6, undefined, 'INA');
    const ina = teamStrengths(state, BWF_2026, 'thomas').find((t) => t.countryId === 'INA')!;
    const fourth = ina.pool.MS[3].id; // tunggal ke-4 tidak masuk line-up otomatis
    expect(ina.lineup).not.toContain(fourth);
    state.teamLineups.thomas = [fourth, ...ina.lineup.slice(1)];
    state.teamLineups.uber = [null, null, null, null, null];
    await until(state, BWF_2026, 19, 6);
    const ms = state.matches.filter((m) => m.tournamentId === 'thomas-uber-cup' && m.discipline === 'MS' && m.sides.includes(fourth));
    expect(ms.length).toBeGreaterThanOrEqual(3); // setiap laga grup
    expect(state.matches.some((m) => m.tournamentId === 'thomas-uber-cup' && m.discipline === 'WS' && m.sides.some((s) => s.startsWith('INA')))).toBe(true);
  });

  it('manajer memilih skuad sebelum turnamen & line-up tiap pertandingan; pilihan tidak sah → otomatis', async () => {
    const state = newSeason(WORLD, BWF_2026, 8, undefined, 'INA');
    const squadCalls: string[] = [];
    const lineupCalls: { eventId: string; round: string; opponent: string }[] = [];
    let chosen: string[] = [];
    let firstLineup: Lineup | undefined;
    const hook: TeamHook = {
      squad: (req) => {
        squadCalls.push(`${req.eventId}:${req.format}`);
        if (req.format === 'uber') return Promise.resolve(['bukan-atlet']); // tidak sah → skuad otomatis
        // Skuad minimum: 3 tunggal terbaik + 2 pasangan terbaik yang tidak bentrok (≤ 7 atlet).
        chosen = autoSquad(BWF_2026.team.order.thomas, req.pool, 2, 7);
        return Promise.resolve(chosen);
      },
      lineup: (req) => {
        lineupCalls.push({ eventId: req.eventId, round: req.round, opponent: req.opponent });
        if (req.format !== 'thomas') return null;
        // Tukar tunggal 1 & 3 dari saran.
        const l = [...req.suggested];
        [l[0], l[4]] = [l[4], l[0]];
        firstLineup ??= l;
        return Promise.resolve(l);
      },
    };
    await until(state, BWF_2026, 19, 8, { team: hook });
    expect(squadCalls).toEqual(expect.arrayContaining(['asia-team:thomas', 'asia-team:uber', 'thomas-uber-cup:thomas', 'thomas-uber-cup:uber']));
    const finals = state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.format === 'thomas')!;
    expect(finals.squads.INA).toEqual(chosen);
    // Semua atlet INA yang bermain di final Thomas berasal dari skuad terdaftar.
    const pairs = new Map(state.pairs.map((p) => [p.id, p.playerIds]));
    const inaMatches = state.matches.filter((m) => m.tournamentId === 'thomas-uber-cup' && (m.discipline === 'MS' || m.discipline === 'MD'));
    const used = inaMatches.flatMap((m) => m.sides).flatMap((s) => pairs.get(s) ?? [s]).filter((id) => id.startsWith('INA'));
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((id) => chosen.includes(id))).toBe(true);
    // Line-up diminta tiap pertandingan INA (grup = 3 di final), lawan diberitahu.
    const finalsCalls = lineupCalls.filter((c) => c.eventId === 'thomas-uber-cup');
    expect(finalsCalls.filter((c) => c.round === 'G').length).toBeGreaterThanOrEqual(6); // 3 Thomas + 3 Uber
    expect(finalsCalls.every((c) => c.opponent && c.opponent !== 'INA')).toBe(true);
    // Partai 1 pertandingan Thomas pertama INA = pilihan manajer.
    const first = state.matches.find((m) => m.tournamentId === 'asia-team' && m.discipline === 'MS' && m.sides.some((s) => s.startsWith('INA')))!;
    expect(first.sides).toContain(firstLineup![0]);
    // Uber: skuad tidak sah diganti otomatis.
    expect(state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.format === 'uber')!.squads.INA).not.toContain('bukan-atlet');
  });
});
