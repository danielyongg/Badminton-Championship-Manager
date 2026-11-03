import { it, expect } from 'vitest';
import { BWF_2027 } from './presets/bwf2027';
import { WORLD } from './presets/world';
import { makeRng } from './rng';
import { newSeason, playWeek } from './season';
import { currentAbility } from './generator';
// Dua musim penuh (BWF 2027+): satu atlet hanya di satu turnamen individu per minggu (tunggal & ganda, WTF, Super 1000
// dua minggu), dan nilai atlet/skor tetap dalam batas.
it('dua musim: tiap atlet satu turnamen individu per minggu; kelelahan, morale, kemampuan & skor dalam batas', async () => {
  const rs = structuredClone(BWF_2027); const rng = makeRng(42);
  const st = newSeason(WORLD, rs, 42, { year: 2027, week: 1 }, 'INA');
  const probs: string[] = [];
  while (st.date.year < 2029) {
    const before = st.matches.length;
    await playWeek(st, rs, WORLD, rng);
    const ms = st.matches.slice(before);
    const pairs = new Map(st.pairs.map((p) => [p.id, p.playerIds]));
    const evByPlayer = new Map<string, Set<string>>();
    for (const m of ms) { if (rs.team.events.some((e) => e.id === m.tournamentId) || m.tournamentId.endsWith('-team')) continue;
      for (const s of m.sides) for (const pid of pairs.get(s) ?? [s]) (evByPlayer.get(pid) ?? evByPlayer.set(pid, new Set()).get(pid)!).add(`${m.tournamentId}:${m.discipline}`); }
    for (const [pid, evs] of evByPlayer) if (new Set([...evs].map((x) => x.split(':')[0])).size > 1) probs.push(`${st.date.year}w${st.date.week} ${pid} in ${[...evs].join(',')}`);
    for (const p of st.players) { if (p.fatigue < 0 || p.fatigue > 100) probs.push(`fatigue ${p.id} ${p.fatigue}`); if (currentAbility(p.attrs) > 100 || currentAbility(p.attrs) < 1) probs.push(`ca ${p.id}`); if (p.form < -10 || p.form > 10) probs.push(`morale ${p.id} ${p.form}`); }
    for (const m of ms) for (const [a, b] of m.scores) if (!m.walkover && !m.retired && Math.max(a, b) < 15) probs.push(`score ${m.id} ${a}-${b}`);
  }
  expect(probs.slice(0, 10)).toEqual([]);
}, 600000);
