import { describe, expect, it } from 'vitest';
import { teamLevel } from './career';
import { BWF_2026 } from './presets/bwf2026';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { entrantsFor, entryDeadline, finalsTeams, newSeason, playWeek, teamStrengths, type SeasonState, type TeamHook, type WeekHooks } from './season';
import { isJuniorAge } from './generator';
import { adHocId, autoLineup, rankOrder, autoSquad, lineupError, playTie, squadError, type Lineup, type TeamEntrant } from './team';
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

  it('Thomas: tunggal 1–3 & ganda 1–2 diurutkan menurut ranking; tanpa ranking di belakang', () => {
    const order = BWF_2026.team.order.thomas; // MS MD MS MD MS
    const pts: Record<string, number> = { a: 500, b: 900, ad: 100, ef: 700 };
    expect(rankOrder(['a', 'ad', 'x', 'ef', 'b'], order, (id) => pts[id] ?? 0)).toEqual(['b', 'ef', 'a', 'ad', 'x']);
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
      // Juara kontinental lolos; bila timnya tak bisa turun (cedera), diganti tim dari konfederasi yang sama.
      for (const c of state.teamResults.filter((x) => x.confederation && x.format === r.format)) {
        const champ = Object.keys(c.reached).find((k) => c.reached[k] === 'W')!;
        if (!r.teams.includes(champ)) expect(r.teams.some((t) => c.teams.includes(t))).toBe(true);
      }
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
    const finals = state.teamResults.filter((r) => !r.confederation && !r.games); // tanpa beregu multi-event (African Games minggu 10)
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

  it('kursi kontinental juara bertahan jatuh ke tim Asia berperingkat tertinggi berikutnya (bukan urutan finis)', () => {
    const state = newSeason(WORLD, BWF_2026, 5, undefined, null);
    const all = teamStrengths(state, BWF_2026, 'thomas');
    const conf = new Map(WORLD.countries.map((c) => [c.id, c.confederation as string]));
    const asia = all.filter((t) => conf.get(t.countryId) === 'BA').map((t) => t.countryId).slice(0, 8);
    // Juara bertahan = juara Asia; finis lain dibalik dari ranking (tim terlemah finis lebih baik).
    const [holder, ...rest] = asia;
    const order = [holder, ...rest.reverse()];
    const rounds = ['W', 'F', 'SF', 'SF', 'QF', 'QF', 'QF', 'QF'] as const;
    state.teamResults.push(
      { eventId: 'thomas-uber-cup', year: 2024, format: 'thomas', teams: [holder], reached: { [holder]: 'W' }, ties: [], squads: {} },
      { eventId: 'asia-team', year: 2026, format: 'thomas', confederation: 'BA', teams: asia, reached: Object.fromEntries(order.map((c, i) => [c, rounds[i]])), ties: [], squads: {} },
    );
    const rs = structuredClone(BWF_2026);
    rs.team.finals.teams = 6; // DEN + juara bertahan + 4 kursi Asia
    const expected = ['DEN', holder, order[1], order[2], order[3], asia.find((c) => !order.slice(0, 4).includes(c))!];
    expect(finalsTeams(state, rs, 'thomas', 'DEN', all, 6, conf).sort()).toEqual(expected.sort());
  });

  it('peserta final ditetapkan setelah kejuaraan kontinental; target beregu langsung "lolos"', async () => {
    const state = newSeason(WORLD, BWF_2026, 9, undefined, 'INA');
    await until(state, BWF_2026, 8, 9);
    const q = state.teamQualifiers?.['2026:thomas'];
    expect(q).toHaveLength(16);
    const ina = q!.includes('INA');
    expect(teamLevel(state, 'INA', 2026, 'thomas')).toBe(ina ? 1 : 0);
    await until(state, BWF_2026, 19, 9);
    const finals = state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.year === 2026 && r.format === 'thomas')!;
    // Tim lolos yang tak bisa menurunkan line-up lengkap di minggu final diganti tim dari konfederasi yang sama.
    const conf = (c: string) => WORLD.countries.find((x) => x.id === c)!.confederation;
    const out = q!.filter((c) => !finals.teams.includes(c)), added = finals.teams.filter((c) => !q!.includes(c));
    expect(finals.teams).toHaveLength(16);
    expect(out.map(conf).sort()).toEqual(added.map(conf).sort());
    expect(out.length).toBeLessThanOrEqual(2);
  }, 60000);

  it('live drawing: undian pot putaran final beregu ditampilkan & tersimpan untuk putar ulang', async () => {
    const state = newSeason(WORLD, BWF_2026, 9, undefined, 'INA');
    const team: DrawShow[] = [];
    await until(state, BWF_2026, 19, 9, { draw: (d) => { if (!d.discipline) team.push(d); return null; } });
    // Kejuaraan kontinental (fase grup) ikut diundi; Asia 4 grup.
    expect(team.filter((d) => d.tournamentId === 'asia-team').map((d) => d.groups)).toEqual([4, 4]);
    const finalsDraws = team.filter((d) => d.tournamentId === 'thomas-uber-cup');
    expect(finalsDraws).toHaveLength(2);
    for (const d of finalsDraws) {
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
    const rng = makeRng(6);
    while (state.date.week < 17) await playWeek(state, BWF_2026, WORLD, rng, {}); // line-up disusun tepat sebelum putaran final (ranking & cedera minggu itu)
    const ina = teamStrengths(state, BWF_2026, 'thomas').find((t) => t.countryId === 'INA')!;
    const fourth = ina.pool.MS[3].id; // tunggal ke-4 tidak masuk line-up otomatis
    expect(ina.lineup).not.toContain(fourth);
    // Skuad manajer memuat tunggal ke-4 (skuad otomatis belum tentu: tergantung tumpang tindih atlet ganda).
    const { order, maxMatchesPerPlayer, squadSize } = BWF_2026.team;
    const squad = autoSquad(order.thomas, ina.pool, maxMatchesPerPlayer, squadSize.thomas.max - 1);
    state.teamSquads.thomas = squad.includes(fourth) ? squad : [...squad, fourth];
    state.teamLineups.thomas = [fourth, ...ina.lineup.slice(1)];
    state.teamLineups.uber = [null, null, null, null, null];
    while (state.date.week < 18) await playWeek(state, BWF_2026, WORLD, rng, {});
    const ms = state.matches.filter((m) => m.tournamentId === 'thomas-uber-cup' && m.discipline === 'MS' && m.sides.includes(fourth));
    expect(ms.length).toBeGreaterThanOrEqual(3); // setiap laga grup
    expect(state.matches.some((m) => m.tournamentId === 'thomas-uber-cup' && m.discipline === 'WS' && m.sides.some((s) => s.startsWith('INA')))).toBe(true);
  });

  it('manajer menominasikan skuad sebelum batas entry & line-up tiap pertandingan; pilihan tidak sah → otomatis', async () => {
    const state = newSeason(WORLD, BWF_2026, 8, undefined, 'INA');
    const lineupCalls: { eventId: string; round: string; opponent: string }[] = [];
    // Nominasi skuad lewat form entry (sebelum batas entry): Thomas = skuad minimum (3 tunggal + 2 pasangan, ≤ 7 atlet);
    // Uber = tidak sah → skuad otomatis.
    const nominate = () => {
      const pool = teamStrengths(state, BWF_2026, 'thomas').find((x) => x.countryId === 'INA')!.pool;
      state.teamSquads.thomas = autoSquad(BWF_2026.team.order.thomas, pool, 2, 7);
      state.teamSquads.uber = ['bukan-atlet'];
      return state.teamSquads.thomas;
    };
    nominate();
    for (const id of ['asia-team', 'thomas-uber-cup']) (state.entriesSubmitted ??= {})[`2026:${id}`] = true;
    let firstLineup: Lineup | undefined;
    const hook: TeamHook = {
      squad: () => { throw new Error('skuad tidak lagi ditanyakan saat turnamen (sudah dinominasikan)'); },
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
    // Nominasi final diperbarui di minggu batas entry (2 minggu sebelum Thomas & Uber Cup).
    const rng = makeRng(8);
    const deadline = entryDeadline(BWF_2026, 'thomas-uber-cup', 2026)!;
    while (state.date.week < deadline) await playWeek(state, BWF_2026, WORLD, rng, { team: hook });
    const chosen = nominate();
    while (state.date.week < 19) await playWeek(state, BWF_2026, WORLD, rng, { team: hook });
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
    // Tunggal 1 & 3 ditukar manajer → dikembalikan menurut ranking: partai 1 = tunggal berperingkat tertinggi (saran semula).
    const first = state.matches.find((m) => m.tournamentId === 'asia-team' && m.discipline === 'MS' && m.sides.some((s) => s.startsWith('INA')))!;
    expect(first.sides).toContain(firstLineup![4]);
    // Uber: skuad tidak sah diganti otomatis.
    expect(state.teamResults.find((r) => r.eventId === 'thomas-uber-cup' && r.format === 'uber')!.squads.INA).not.toContain('bukan-atlet');
  });
});
