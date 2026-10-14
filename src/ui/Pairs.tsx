import { useMemo, useState } from 'react';
import { dissolvePair, formPair, promoteTrial } from '../engine/career';
import { ageAt, currentAbility } from '../engine/generator';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import type { Pair } from '../engine/types';
import { t, type TextKey } from '../i18n';
import { FatigueBar } from './Squad';
import { JUNIOR_MAX_AGE, lookup, saveGame, useGame } from './game';

const DOUBLES: Pair['discipline'][] = ['MD', 'WD', 'XD'];

/** Pasangan negara sendiri untuk satu kelompok usia: junior = kedua atlet junior, selain itu senior. */
export function Pairs({ onOpen, juniors = false }: { onOpen: (id: string) => void; juniors?: boolean }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const { players } = lookup(state);
  const [d, setD] = useState<Pair['discipline']>('MD');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [trial, setTrial] = useState(false);

  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    const of = (results: typeof state.results) => Object.fromEntries(DOUBLES.map((x) => [x, rankMap(computeRanking(results, x, now, ruleset))]));
    return { senior: of(state.results), junior: of(state.juniorResults ?? []) };
  }, [version, state, ruleset]);
  const [sort, setSort] = useState({ key: 'sector', desc: false });

  const commit = () => { changed(); void saveGame(game); };
  const isJunior = (id: string) => ageAt(players.get(id)!.birth, state.date) <= JUNIOR_MAX_AGE;
  const mine = state.pairs.filter((p) => !p.dissolved && !p.adHoc && players.get(p.playerIds[0])?.countryId === country && p.playerIds.every(isJunior) === juniors);
  const athletes = (gender: 'M' | 'F') => state.players
    .filter((p) => p.countryId === country && p.retired === undefined && p.gender === gender && p.focus !== 'S' && isJunior(p.id) === juniors)
    .sort((x, y) => currentAbility(y.attrs) - currentAbility(x.attrs));
  const genders: Record<Pair['discipline'], ['M' | 'F', 'M' | 'F']> = { MD: ['M', 'M'], WD: ['F', 'F'], XD: ['M', 'F'] };
  const option = (id: string) => {
    const p = players.get(id)!;
    return <option key={id} value={id}>{p.name} ({ageAt(p.birth, state.date)} {t('yearsShort')}, {currentAbility(p.attrs)})</option>;
  };

  // Tabel bergaya sama dengan daftar pemain (Single): satu baris per pasangan, kolom bisa diurutkan.
  const avg = (p: Pair, f: (x: NonNullable<ReturnType<typeof players.get>>) => number) => p.playerIds.reduce((t, id) => t + f(players.get(id)!), 0) / p.playerIds.length;
  const rankList = (p: Pair) => [
    { d: p.discipline as string, r: ranks.senior[p.discipline].get(p.id) },
    ...(juniors ? [{ d: `${p.discipline} ${t('juniorShort')}`, r: ranks.junior[p.discipline].get(p.id) }] : []),
  ].filter((x) => x.r !== undefined).sort((a, b) => a.r! - b.r!);
  const COLS: { key: string; label: TextKey; num?: boolean; value: (p: Pair) => string | number; desc?: boolean }[] = [
    { key: 'pair', label: 'pair', value: (p) => p.playerIds.map((id) => players.get(id)!.name).join(' / ') },
    { key: 'sector', label: 'sector', value: (p) => DOUBLES.indexOf(p.discipline) },
    { key: 'status', label: 'status', value: (p) => (p.trial ? 1 : 0) },
    { key: 'age', label: 'age', num: true, value: (p) => avg(p, (x) => ageAt(x.birth, state.date)) },
    { key: 'ability', label: 'ability', num: true, value: (p) => avg(p, (x) => currentAbility(x.attrs)), desc: true },
    { key: 'chem', label: 'chemistry', num: true, value: (p) => p.chemistry, desc: true },
    { key: 'together', label: 'matchesTogether', num: true, value: (p) => p.matchesTogether, desc: true },
    { key: 'fatigue', label: 'fatigue', value: (p) => Math.max(...p.playerIds.map((id) => players.get(id)!.fatigue)), desc: true },
    { key: 'rank', label: 'bwfRank', num: true, value: (p) => rankList(p)[0]?.r ?? Infinity },
  ];
  const col = COLS.find((c) => c.key === sort.key)!;
  const cmp = (a: Pair, b: Pair) => {
    const x = col.value(a), y = col.value(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (sort.desc ? -r : r) || DOUBLES.indexOf(a.discipline) - DOUBLES.indexOf(b.discipline) || (rankList(a)[0]?.r ?? Infinity) - (rankList(b)[0]?.r ?? Infinity);
  };
  const list = [...mine].sort(cmp);

  return (
    <>
      {list.length === 0 ? <p className="hint">—</p> : (
        <div className="scroll">
          <table>
            <thead><tr>{COLS.map((c) => (
              <th key={c.key} className={`sortable${c.num ? ' num' : ''}`} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !!c.desc })}>
                {t(c.label)}{sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}<th></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id}>
                <td>{p.playerIds.map((id, i) => (
                  <span key={id}>{i > 0 && ' / '}<a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{players.get(id)!.name}</a></span>
                ))}</td>
                <td><span className="chip sector">{p.discipline}</span></td>
                <td>{p.trial ? <span className="tag muted-tag">{t('trialPair')}</span> : <span className="tag">{t('mainPair')}</span>}</td>
                <td className="num">{Math.round(avg(p, (x) => ageAt(x.birth, state.date)))}</td>
                <td className="num">{Math.round(avg(p, (x) => currentAbility(x.attrs)))}</td>
                <td className="num">{Math.round(p.chemistry)}</td>
                <td className="num">{p.matchesTogether}</td>
                <td><FatigueBar value={Math.max(...p.playerIds.map((id) => players.get(id)!.fatigue))} />{p.playerIds.some((id) => players.get(id)!.injury) ? ' 🩹' : ''}</td>
                <td className="num">{rankList(p).map((x, i) => <span key={x.d}>{i > 0 && <span className="muted-text"> · </span>}{x.r} <small className="muted-text">{x.d}</small></span>)}{rankList(p).length === 0 && '—'}</td>
                <td>
                  {p.trial && <button className="mini" onClick={() => { if (confirm(t('confirmPromote'))) { promoteTrial(state, p.id); commit(); } }}>{t('promoteTrial')}</button>}
                  {' '}<button className="mini" onClick={() => { if (p.trial || confirm(t('confirmDissolve'))) { dissolvePair(state, p.id); commit(); } }}>{t('dissolve')}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <section className="card">
        <h3>{t('formPair')}</h3>
        <div className="controls">
          <select value={d} onChange={(e) => { setD(e.target.value as Pair['discipline']); setA(''); setB(''); setError(''); }}>
            {DOUBLES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select value={a} onChange={(e) => setA(e.target.value)}><option value="">—</option>{athletes(genders[d][0]).map((p) => option(p.id))}</select>
          <select value={b} onChange={(e) => setB(e.target.value)}><option value="">—</option>{athletes(genders[d][1]).map((p) => option(p.id))}</select>
          <button disabled={!a || !b} onClick={() => {
            const r = formPair(state, d, a, b, game.rng, trial);
            if (typeof r === 'string') setError(r);
            else { setError(''); setA(''); setB(''); commit(); }
          }}>{t('formPair')}</button>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} /> {t('trialCheckbox')}</label>
        </div>
        {trial && <p className="hint">{t('trialHint')}</p>}
        {error && <p className="down">{error}</p>}
      </section>
    </>
  );
}
