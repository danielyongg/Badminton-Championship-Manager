import { useMemo, useState } from 'react';
import type { SeasonState } from '../engine/season';
import type { Ruleset, TeamFormat, World } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { CAL_GROUPS, entrantLabel, groupLabel, lookup, tierGroup } from './game';
import { Flag } from './Flag';
import { formatName, winnerOf } from './Team';

// Klasemen negara (medali per musim) & Rekor + Hall of Fame (gaya BWF), dihitung dari riwayat save ini.

// Sub-tab = kelompok badge tier seperti filter kalender (Grade 1–3, Multi-sport, Continental, Junior).
type Scope = 'all' | (typeof CAL_GROUPS)[number];
// Rekor gelar: World Tour + Majors (OG, Kejuaraan Dunia, WTF).
const MAJORS = new Set(['OG', 'WC', 'WTF']);
const TOUR = new Set(['S1000', 'S750', 'S500', 'S300', 'S100']);

/**
 * Klasemen negara satu musim: emas = juara, perak = finalis, perunggu = semifinalis (tanpa laga perebutan perunggu,
 * seperti Kejuaraan Dunia BWF). Beregu: juara / finalis / semifinalis per format.
 */
export function NationsTable({ state, ruleset, world }: { state: SeasonState; ruleset: Ruleset; world: World }) {
  const years = [...new Set([...state.matches.map((m) => m.year), ...state.teamResults.map((r) => r.year)])].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0] ?? state.date.year);
  const [scope, setScope] = useState<Scope>('all');
  const managed = state.career?.countryId;
  const individualGroup = (id: string) => { const ev = ruleset.calendar.find((e) => e.id === id); return ev && tierGroup(ruleset.tiers.find((x) => x.id === ev.tierId)); };
  const teamGroup = (id: string) => { const ev = ruleset.team.events.find((e) => e.id === id); return ev && tierGroup(undefined, ev); };
  const rows = useMemo(() => {
    const tally = new Map<string, [number, number, number]>();
    const add = (c: string, i: 0 | 1 | 2) => { const v = tally.get(c) ?? [0, 0, 0]; v[i]++; tally.set(c, v); };
    for (const m of state.matches) {
        if (m.year !== year || (m.round !== 'F' && m.round !== 'SF')) continue;
        const g = individualGroup(m.tournamentId);
        if (!g) continue; // partai beregu: dihitung per format di bawah
        if (scope === 'all' ? g === 'junior' : g !== scope) continue; // "Semua" = senior
        const country = (id: string) => entrantLabel(state, id).country;
        if (m.round === 'F') { add(country(m.sides[m.winner]), 0); add(country(m.sides[1 - m.winner]), 1); } else add(country(m.sides[1 - m.winner]), 2);
      }
    for (const r of state.teamResults) {
        // Kejuaraan beregu kontinental (kualifikasi Piala Thomas/Uber/Sudirman) hanya di sub-tab Continental.
        if (r.year !== year || (scope === 'all' ? r.confederation : teamGroup(r.eventId) !== scope)) continue;
        for (const [c, reached] of Object.entries(r.reached)) if (reached === 'W') add(c, 0); else if (reached === 'F') add(c, 1); else if (reached === 'SF') add(c, 2);
      }
    return [...tally].sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2]);
  }, [state.matches.length, state.teamResults.length, year, scope, ruleset]);
  const name = (c: string) => dataName(world.countries.find((x) => x.id === c)?.name) ?? c;
  const scopes: Scope[] = ['all', ...CAL_GROUPS.filter((g) => ruleset.calendar.some((e) => individualGroup(e.id) === g) || ruleset.team.events.some((e) => teamGroup(e.id) === g))];
  return (
    <section>
      <nav className="controls subnav">{scopes.map((s) => <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>{groupLabel(s)}</button>)}</nav>
      <div className="controls">
        <label>{t('year')}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
        </label>
      </div>
      <p className="hint">{t('nationsHint')}</p>
      {rows.length === 0 ? <p className="hint">{t('noChampions')}</p> : (
        <table className="fit" style={{ maxWidth: 560 }}>
          <thead><tr><th className="num">#</th><th>{t('country')}</th><th className="num">🥇</th><th className="num">🥈</th><th className="num">🥉</th><th className="num">{t('total')}</th></tr></thead>
          <tbody>{rows.map(([c, [g, s, b]], i) => (
            <tr key={c} className={c === managed ? 'sel' : undefined}>
              <td className="num">{i + 1}</td><td><Flag id={c} />{name(c)}</td>
              <td className="num"><b>{g}</b></td><td className="num">{s}</td><td className="num">{b}</td><td className="num">{g + s + b}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

/**
 * Rekor & Hall of Fame. Rekor mengikuti kategori yang dicatat BWF (gelar terbanyak, juara dunia, emas Olimpiade,
 * World Tour Finals, All England, minggu di peringkat 1, beregu per negara). Hall of Fame: atlet pensiun dengan
 * prestasi puncak (juara Olimpiade / dunia, ≥15 gelar World Tour, atau ≥52 minggu peringkat 1).
 * Semua dihitung sejak awal karier di save ini.
 */
export function Records({ state, ruleset, world, onOpenPlayer }: { state: SeasonState; ruleset: Ruleset; world: World; onOpenPlayer?: (id: string) => void }) {
  const { players, pairs } = lookup(state);
  const managed = state.career?.countryId;
  const data = useMemo(() => {
    const tierOf = (id: string) => ruleset.calendar.find((e) => e.id === id)?.tierId;
    const count = (pred: (tid: string, tier?: string) => boolean) => {
      const n = new Map<string, number>();
      for (const c of state.champions) if (pred(c.tournamentId, tierOf(c.tournamentId)))
        for (const p of pairs.get(c.winner)?.playerIds ?? [c.winner]) n.set(p, (n.get(p) ?? 0) + 1);
      return n;
    };
    const titles = count((_, tier) => !!tier && (TOUR.has(tier) || MAJORS.has(tier)));
    const wc = count((_, tier) => tier === 'WC');
    const og = count((_, tier) => tier === 'OG');
    const wtf = count((_, tier) => tier === 'WTF');
    const ae = count((id) => id === 'all-england');
    // Minggu di peringkat 1: snapshot ranking tiap 4 minggu (peringkat 1 snapshot ≈ 4 minggu).
    const weeks1 = new Map<string, number>();
    for (const s of state.rankSnapshots) if (s.ids[0]) for (const p of pairs.get(s.ids[0])?.playerIds ?? [s.ids[0]]) weeks1.set(p, (weeks1.get(p) ?? 0) + 4);
    const team = new Map<string, number>();
    for (const r of state.teamResults) { const w = !r.confederation && !r.games ? winnerOf(r) : undefined; if (w) team.set(`${r.format}:${w}`, (team.get(`${r.format}:${w}`) ?? 0) + 1); }
    const hof = state.players.filter((p) => p.retired !== undefined
      && ((og.get(p.id) ?? 0) > 0 || (wc.get(p.id) ?? 0) > 0 || (titles.get(p.id) ?? 0) >= 15 || (weeks1.get(p.id) ?? 0) >= 52))
      .sort((a, b) => (og.get(b.id) ?? 0) - (og.get(a.id) ?? 0) || (wc.get(b.id) ?? 0) - (wc.get(a.id) ?? 0) || (titles.get(b.id) ?? 0) - (titles.get(a.id) ?? 0));
    return { titles, wc, og, wtf, ae, weeks1, team, hof };
  }, [state.champions.length, state.rankSnapshots.length, state.teamResults.length, state.players.length]);
  const who = (id: string) => {
    const p = players.get(id);
    return <span className={p?.countryId === managed ? 'mine' : undefined}><Flag id={p?.countryId} />{onOpenPlayer
      ? <a href="#" onClick={(e) => { e.preventDefault(); onOpenPlayer(id); }}>{p?.name ?? id}</a> : p?.name ?? id}</span>;
  };
  const top = (m: Map<string, number>, title: TextKey, unit?: TextKey) => {
    const list = [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return (
      <section className="card" key={title}>
        <h3>{t(title)}</h3>
        {list.length === 0 ? <p className="hint">—</p> : (
          <table className="fit"><tbody>{list.map(([id, n], i) => (
            <tr key={id}><td className="num muted-text">{i + 1}</td><td>{who(id)}</td><td className="num"><b>{n}</b>{unit && <small className="muted-text"> {t(unit)}</small>}</td></tr>
          ))}</tbody></table>
        )}
      </section>
    );
  };
  const country = (c: string) => dataName(world.countries.find((x) => x.id === c)?.name) ?? c;
  const teamRows = [...data.team].sort((a, b) => b[1] - a[1]);
  const formats = [...new Set(teamRows.map(([k]) => k.split(':')[0]))];
  return (
    <section>
      <p className="hint">{t('recordsHint', { y: Math.min(...state.champions.map((c) => c.year), state.date.year) })}</p>
      <section className="card">
        <h3>🏛 {t('hallOfFame')}</h3>
        <p className="hint">{t('hofCriteria')}</p>
        {data.hof.length === 0 ? <p className="hint">{t('hofEmpty')}</p> : (
          <table className="fit"><tbody>{data.hof.map((p) => (
            <tr key={p.id}>
              <td>{who(p.id)}<br /><small className="muted-text">{t('retired')} {p.retired}</small></td>
              <td className="num">{[(data.og.get(p.id) ?? 0) && `🥇 OG ×${data.og.get(p.id)}`, (data.wc.get(p.id) ?? 0) && `WC ×${data.wc.get(p.id)}`, `${data.titles.get(p.id) ?? 0} ${t('titlesShort')}`].filter(Boolean).join(' · ')}</td>
            </tr>
          ))}</tbody></table>
        )}
      </section>
      <div className="split">
        {top(data.titles, 'recTitles')}
        {top(data.weeks1, 'recWeeks1', 'weeks')}
      </div>
      <div className="split">
        {top(data.wc, 'recWC')}
        {top(data.og, 'recOG')}
      </div>
      <div className="split">
        {top(data.wtf, 'recWTF')}
        {top(data.ae, 'recAE')}
      </div>
      <section className="card">
        <h3>{t('recTeam')}</h3>
        {teamRows.length === 0 ? <p className="hint">—</p> : formats.map((f) => (
          <p key={f}><b>{formatName(f as TeamFormat)}</b>: {teamRows.filter(([k]) => k.startsWith(`${f}:`)).map(([k, n]) => <span key={k} className="evres"><Flag id={k.split(':')[1]} />{country(k.split(':')[1])} ×{n}</span>)}</p>
        ))}
      </section>
    </section>
  );
}
