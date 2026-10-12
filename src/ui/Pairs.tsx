import { useMemo, useState } from 'react';
import { dissolvePair, formPair, promoteTrial } from '../engine/career';
import { ageAt, currentAbility } from '../engine/generator';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import type { Pair } from '../engine/types';
import { t } from '../i18n';
import { lookup, saveGame, useGame } from './game';

const DOUBLES: Pair['discipline'][] = ['MD', 'WD', 'XD'];

export function Pairs({ onOpen }: { onOpen: (id: string) => void }) {
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
    return Object.fromEntries(DOUBLES.map((x) => [x, rankMap(computeRanking(state.results, x, now, ruleset))]));
  }, [version, state, ruleset]);

  const commit = () => { changed(); void saveGame(game); };
  const mine = state.pairs.filter((p) => !p.dissolved && !p.adHoc && players.get(p.playerIds[0])?.countryId === country);
  const athletes = (gender: 'M' | 'F') => state.players
    .filter((p) => p.countryId === country && p.retired === undefined && p.gender === gender)
    .sort((x, y) => currentAbility(y.attrs) - currentAbility(x.attrs));
  const genders: Record<Pair['discipline'], ['M' | 'F', 'M' | 'F']> = { MD: ['M', 'M'], WD: ['F', 'F'], XD: ['M', 'F'] };
  const option = (id: string) => {
    const p = players.get(id)!;
    return <option key={id} value={id}>{p.name} ({ageAt(p.birth, state.date)} {t('yearsShort')}, {currentAbility(p.attrs)})</option>;
  };

  return (
    <>
      {DOUBLES.map((disc) => (
        <section key={disc} className="card">
          <h3>{disc}</h3>
          <table>
            <thead><tr><th>{t('pair')}</th><th>{t('chemistry')}</th><th>{t('matchesTogether')}</th><th>{t('rank')}</th><th></th></tr></thead>
            <tbody>{mine.filter((p) => p.discipline === disc).map((p) => (
              <tr key={p.id}>
                <td>{p.playerIds.map((id, i) => (
                  <span key={id}>{i > 0 && ' / '}<a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{players.get(id)!.name}</a>{players.get(id)!.injury ? ' 🩹' : ''}</span>
                ))}{p.trial && <> <span className="tag">{t('trialPair')}</span></>}</td>
                <td className="num">{Math.round(p.chemistry)}</td>
                <td className="num">{p.matchesTogether}</td>
                <td className="num">{ranks[disc].get(p.id) ?? '—'}</td>
                <td>
                  {p.trial && <button onClick={() => { if (confirm(t('confirmPromote'))) { promoteTrial(state, p.id); commit(); } }}>{t('promoteTrial')}</button>}
                  <button onClick={() => { if (p.trial || confirm(t('confirmDissolve'))) { dissolvePair(state, p.id); commit(); } }}>{t('dissolve')}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
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
