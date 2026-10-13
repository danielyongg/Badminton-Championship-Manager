import { useMemo, useRef, useState } from 'react';
import { absWeek, computeRace, computeRanking, expiringPoints } from '../engine/ranking';
import { presetPack } from '../engine/pack';
import { makeRng } from '../engine/rng';
import { isHeld, newSeason, playWeek, rankFromSnapshots, type SeasonState } from '../engine/season';
import { ageAt, currentAbility } from '../engine/generator';
import { ATTRS, DISCIPLINES, type Discipline, type Player, type Ruleset, type World } from '../engine/types';
import { dataName, numLocale, t } from '../i18n';
import { entrantLabel, eventName as eventNameOf } from './game';
import { Flag } from './Flag';

/** Lab: dunia simulasi sendiri dengan tombol maju minggu, menampilkan SeasonViews. */
export function Ranking({ ruleset, world, seed }: { ruleset: Ruleset; world: World; seed: number }) {
  // Dunia simulasi sendiri (objek atlet terpisah), karena musim mengubah kelelahan/lokasi atlet.
  const make = () => ({ state: newSeason(world, ruleset, seed, { year: ruleset.startYear, week: 1 }, null, presetPack(ruleset)), rng: makeRng(seed) });
  const sim = useRef(make());
  const [key, setKey] = useState(`${seed}:${ruleset.id}`);
  if (key !== `${seed}:${ruleset.id}`) { sim.current = make(); setKey(`${seed}:${ruleset.id}`); }
  const [version, setVersion] = useState(0);
  const { state } = sim.current;
  const advance = async (weeks: number) => {
    for (let i = 0; i < weeks; i++) await playWeek(state, ruleset, world, sim.current.rng);
    setVersion((x) => x + 1);
  };
  return (
    <section>
      <div className="controls">
        <b>{state.date.year} · {t('week')} {state.date.week}</b>
        <button onClick={() => advance(1)}>{t('playWeek')}</button>
        <button onClick={() => advance(52 - state.date.week + 1)}>{t('playSeason')}</button>
      </div>
      <SeasonViews state={state} ruleset={ruleset} world={world} version={version} />
    </section>
  );
}

/** Ranking dunia & Race, kalender & juara, Top Committed, perkembangan atlet — untuk satu SeasonState. */
export function SeasonViews({ state, ruleset, world, version, onOpenPlayer, onOpenEvent }: {
  state: SeasonState; ruleset: Ruleset; world: World; version: number; onOpenPlayer?: (id: string) => void; onOpenEvent?: (id: string, year: number) => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>('MS');
  const [mode, setMode] = useState<'world' | 'race' | 'junior'>('world');
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'ranking' | 'calendar' | 'committed' | 'players'>('ranking');
  const now = absWeek(state.date);
  const name = (id: string) => entrantLabel(state, id);
  const eventName = (id: string) => eventNameOf(ruleset, id) ?? t('preseason');

  const rows = useMemo(
    () => (mode === 'world' ? computeRanking(state.results, discipline, now, ruleset)
      : mode === 'junior' ? computeRanking(state.juniorResults ?? [], discipline, now, ruleset)
      : computeRace(state.results, discipline, state.date.year, ruleset)),
    [version, discipline, mode, now, ruleset],
  );
  const lastChampions = state.champions.filter((c) => c.year === state.date.year && ruleset.calendar.find((e) => e.id === c.tournamentId)?.week === state.date.week - 1);

  return (
    <section>
      <div className="controls">
        <label>{t('view')}
          <select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
            <option value="ranking">{t('viewRanking')}</option>
            <option value="calendar">{t('viewCalendar')}</option>
            <option value="committed">{t('viewCommitted')}</option>
            <option value="players">{t('viewPlayers')}</option>
          </select>
        </label>
        <label>{t('discipline')}
          <select value={discipline} onChange={(e) => { setDiscipline(e.target.value as Discipline); setSelected(undefined); }}>
            {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>{t('rankingType')}
          <select value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setSelected(undefined); }}>
            <option value="world">{t('worldRanking')}</option>
            <option value="race">{t('raceToFinals')}</option>
            <option value="junior">{t('juniorRanking')}</option>
          </select>
        </label>
      </div>
      {lastChampions.length > 0 && (
        <p><b>{t('lastWeekChampions')}:</b> {lastChampions.map((c) => `${eventName(c.tournamentId)} ${c.discipline}: ${name(c.winner).name}`).join(' · ')}</p>
      )}
      {view === 'calendar' && <Calendar state={state} ruleset={ruleset} world={world} short={(id) => name(id).name} onOpenEvent={onOpenEvent} />}
      {view === 'committed' && <Committed state={state} ruleset={ruleset} label={(id) => `${name(id).name} (${name(id).country})`} />}
      {view === 'players' && <Development state={state} world={world} onOpen={onOpenPlayer} />}
      {view === 'ranking' && <div className="split">
        <div className="scroll">
          <table>
            <thead><tr><th>#</th><th>{t('name')}</th><th>{t('country')}</th><th>{t('points')}</th><th>{t('tournaments')}</th></tr></thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr key={r.entrantId} onClick={() => setSelected(r.entrantId)} className={selected === r.entrantId ? 'sel' : ''} style={{ cursor: 'pointer' }}>
                  <td className="num">{r.rank}</td><td>{name(r.entrantId).name}</td><td><Flag id={name(r.entrantId).country} />{name(r.entrantId).country}</td>
                  <td className="num">{r.points.toLocaleString(numLocale())}</td><td className="num">{r.tournamentsPlayed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <Detail id={selected} label={name(selected).name} state={state} discipline={discipline} ruleset={ruleset} eventName={eventName} junior={mode === 'junior'} />}
      </div>}
    </section>
  );
}

function Detail({ id, label, state, discipline, ruleset, eventName, junior }: {
  id: string; label: string; state: SeasonState; discipline: Discipline; ruleset: Ruleset; eventName: (id: string) => string; junior?: boolean;
}) {
  const now = absWeek(state.date);
  const history = rankFromSnapshots(state, id, discipline);
  const expiring = expiringPoints(junior ? state.juniorResults ?? [] : state.results, id, discipline, now, 12, ruleset);
  return (
    <aside>
      <h3>{label}</h3>
      <h4>{t('rankHistory')}</h4>
      <RankChart history={history} />
      <h4>{t('expiringSoon')}</h4>
      {expiring.length === 0 ? <p>—</p> : (
        <table>
          <tbody>{expiring.map((e, i) => (
            <tr key={i}><td>{eventName(e.entry.tournamentId)} {e.entry.year}</td><td className="num">{e.entry.points}</td>
              <td>{e.weeksLeft} {t('weeksLeft')}</td><td>{e.counted ? t('counted') : t('notCounted')}</td></tr>
          ))}</tbody>
        </table>
      )}
    </aside>
  );
}

/** Grafik garis peringkat (peringkat 1 di atas). */
export function RankChart({ history }: { history: { absWeek: number; rank?: number }[] }) {
  const ranked = history.filter((h) => h.rank !== undefined);
  if (ranked.length < 2) return <p>—</p>;
  const W = 300, H = 120;
  const maxRank = Math.max(...ranked.map((h) => h.rank!), 10);
  const x = (i: number) => (i / (history.length - 1)) * (W - 30) + 25;
  const y = (r: number) => ((r - 1) / (maxRank - 1)) * (H - 20) + 10;
  const pts = history.map((h, i) => (h.rank === undefined ? null : `${x(i)},${y(h.rank)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label="Grafik peringkat">
      <text x="0" y="14" fontSize="10" fill="currentColor">1</text>
      <text x="0" y={H - 6} fontSize="10" fill="currentColor">{maxRank}</text>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  );
}

/** Musim yang ditampilkan: di minggu 1 (musim baru belum dimulai) tampilkan musim yang baru selesai. */
const shownYear = (s: SeasonState) => (s.date.week === 1 ? s.date.year - 1 : s.date.year);

function Calendar({ state, ruleset, world, short, onOpenEvent }: { state: SeasonState; ruleset: Ruleset; world: World; short: (id: string) => string; onOpenEvent?: (id: string, year: number) => void }) {
  const year = shownYear(state);
  const events = ruleset.calendar.filter((e) => isHeld(e, year)).sort((a, b) => a.week - b.week);
  const city = new Map(world.cities.map((c) => [c.id, c]));
  return (
    <div className="scroll">
      <table>
        <thead><tr><th>{t('week')}</th><th>{t('tournament')}</th><th>{t('tier')}</th><th>{t('city')}</th><th>{t('prize')}</th>{DISCIPLINES.map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>{events.map((e) => (
          <tr key={e.id} className={year === state.date.year && e.week === state.date.week ? 'sel' : ''}>
            <td className="num">{e.week}</td><td>{onOpenEvent ? <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenEvent(e.id, year); }}>{dataName(e.name)}</a> : dataName(e.name)}</td><td>{e.tierId}</td>
            <td>{dataName(city.get(e.cityId)?.name)} ({city.get(e.cityId)?.countryId})</td>
            <td className="num">{e.prizeUsd ? `$${e.prizeUsd.toLocaleString(numLocale())}` : '—'}</td>
            {DISCIPLINES.map((d) => {
              const c = state.champions.find((x) => x.year === year && x.tournamentId === e.id && x.discipline === d);
              return <td key={d}>{c ? short(c.winner) : ''}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Committed({ state, ruleset, label }: { state: SeasonState; ruleset: Ruleset; label: (id: string) => string }) {
  const name = (id: string) => eventNameOf(ruleset, id) ?? id;
  const played = (entrant: string) => new Set(state.matches.filter((m) => m.year === shownYear(state) && m.sides.includes(entrant)).map((m) => m.tournamentId));
  return (
    <>
      <div className="scroll">
        <table>
          <thead><tr><th>{t('name')}</th><th>{t('requiredEvents')}</th></tr></thead>
          <tbody>{Object.entries(state.commitments).map(([id, events]) => {
            const p = played(id);
            return <tr key={id}><td>{label(id)}</td><td>{events.map((e) => (p.has(e) ? '✅ ' : '◻️ ') + name(e)).join(' · ')}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <h3>{t('violations')}</h3>
      {state.violations.length === 0 ? <p>{t('none')}</p>
        : <ul>{state.violations.map((v, i) => <li key={i}>{label(v.entrantId)} — {name(v.tournamentId)} {v.year}</li>)}</ul>}
    </>
  );
}

const arrow = (d?: number) => (!d ? '' : d > 0 ? ` ▲${d}` : ` ▼${-d}`);

/** Perkembangan atlet satu negara: CA dengan panah perubahan kuartal terakhir, dan riwayat atribut per musim. */
function Development({ state, world, onOpen }: { state: SeasonState; world: World; onOpen?: (id: string) => void }) {
  const [countryId, setCountryId] = useState('INA');
  const [showRetired, setShowRetired] = useState(false);
  const [selected, setSelected] = useState<Player>();
  const list = state.players
    .filter((p) => p.countryId === countryId && (showRetired || p.retired === undefined))
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
  return (
    <>
      <div className="controls">
        <label>{t('country')}
          <select value={countryId} onChange={(e) => { setCountryId(e.target.value); setSelected(undefined); }}>
            {world.countries.map((c) => <option key={c.id} value={c.id}>{dataName(c.name)}</option>)}
          </select>
        </label>
        <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />{t('showRetired')}
        </label>
      </div>
      <div className="split">
        <div className="scroll">
          <table>
            <thead><tr><th>{t('name')}</th><th>{t('gender')}</th><th>{t('age')}</th><th>{t('ability')}</th><th>{t('potential')}</th><th>{t('status')}</th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} onClick={() => (onOpen ? onOpen(p.id) : setSelected(p))} className={selected?.id === p.id ? 'sel' : ''} style={{ cursor: 'pointer' }}>
                <td>{p.name}</td><td>{p.gender}</td>
                <td className="num">{ageAt(p.birth, state.date)}</td>
                <td className="num">{currentAbility(p.attrs)}<span className={p.caDelta! > 0 ? 'up' : 'down'}>{arrow(p.caDelta)}</span></td>
                <td className="stars">{'★'.repeat(Math.max(1, Math.round(p.pa / 20)))}</td>
                <td>{p.retired !== undefined ? `${t('retired')} ${p.retired}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {selected && (
          <aside className="scroll">
            <h3>{selected.name}</h3>
            <table>
              <thead><tr><th></th>{selected.attrHistory.map((h) => <th key={h.year}>{h.year}</th>)}<th>{t('now')}</th></tr></thead>
              <tbody>{ATTRS.map((a) => (
                <tr key={a}><td>{t(a)}</td>{selected.attrHistory.map((h) => <td className="num" key={h.year}>{Math.round(h.attrs[a])}</td>)}<td className="num"><b>{Math.round(selected.attrs[a])}</b></td></tr>
              ))}
              <tr><td><b>{t('ability')}</b></td>{selected.attrHistory.map((h) => <td className="num" key={h.year}>{currentAbility(h.attrs)}</td>)}<td className="num"><b>{currentAbility(selected.attrs)}</b></td></tr>
              </tbody>
            </table>
          </aside>
        )}
      </div>
    </>
  );
}
