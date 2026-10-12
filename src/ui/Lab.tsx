import { useMemo, useState } from 'react';
import { ageAt, currentAbility, generateWorld } from '../engine/generator';
import { BWF_2026 } from '../engine/presets/bwf2026';
import { BWF_2027 } from '../engine/presets/bwf2027';
import { WORLD } from '../engine/presets/world';
import { makeRng } from '../engine/rng';
import { t } from '../i18n';
import { MatchLab } from './MatchLab';
import { Ranking } from './Ranking';
import { Wizard } from './Wizard';

const PRESETS = [BWF_2026, BWF_2027];
const START = { year: 2026, week: 1 };

// ponytail: potensi tampil sebagai bintang kasar; akurasi bertahap menurut usia menyusul di Fase 7.
const stars = (pa: number) => '★'.repeat(Math.max(1, Math.round(pa / 20)));

export function Lab({ onBack }: { onBack: () => void }) {
  const [rulesetId, setRulesetId] = useState(PRESETS[0].id);
  const [seed, setSeed] = useState(1);
  const [countryId, setCountryId] = useState('INA');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [tab, setTab] = useState<'players' | 'match' | 'wizard' | 'ranking'>('players');

  const ruleset = PRESETS.find((r) => r.id === rulesetId)!;
  const world = useMemo(
    () => generateWorld(makeRng(seed), ruleset.generator, WORLD.countries, START),
    [seed, ruleset],
  );
  const byId = useMemo(() => new Map(world.players.map((p) => [p.id, p])), [world]);

  const players = world.players
    .filter((p) => (!countryId || p.countryId === countryId) && p.gender === gender)
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
  const pairs = world.pairs.filter((p) => !countryId || p.playerIds.some((id) => byId.get(id)!.countryId === countryId));

  return (
    <main>
      <h1>{t('lab')}</h1>
      <nav className="controls">
        <button onClick={onBack}>← {t('mainMenu')}</button>
        <button aria-pressed={tab === 'players'} onClick={() => setTab('players')}>{t('tabPlayers')}</button>
        <button aria-pressed={tab === 'match'} onClick={() => setTab('match')}>{t('tabMatch')}</button>
        <button aria-pressed={tab === 'wizard'} onClick={() => setTab('wizard')}>{t('tabWizard')}</button>
        <button aria-pressed={tab === 'ranking'} onClick={() => setTab('ranking')}>{t('tabRanking')}</button>
      </nav>
      {tab === 'ranking' ? <Ranking ruleset={ruleset} world={WORLD} seed={seed} />
      : tab === 'wizard' ? <Wizard players={world.players} pairs={world.pairs} ruleset={ruleset} world={WORLD} />
      : tab === 'match' ? <MatchLab players={world.players.filter((p) => p.gender === gender)} cfg={ruleset.match} /> : <>
      <div className="controls">
        <label>{t('ruleset')}
          <select value={rulesetId} onChange={(e) => setRulesetId(e.target.value)}>
            {PRESETS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>{t('seed')}
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 90 }} />
        </label>
        <label>{t('country')}
          <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
            <option value="">{t('allCountries')}</option>
            {WORLD.countries.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>{t('gender')}
          <select value={gender} onChange={(e) => setGender(e.target.value as 'M' | 'F')}>
            <option value="M">{t('men')}</option>
            <option value="F">{t('women')}</option>
          </select>
        </label>
        <span>{players.length} {t('players')}</span>
      </div>

      <div className="scroll">
        <table>
          <thead>
            <tr><th>{t('name')}</th><th>{t('country')}</th><th>{t('age')}</th><th>{t('hand')}</th><th>{t('ability')}</th><th>{t('potential')}</th></tr>
          </thead>
          <tbody>
            {players.slice(0, 300).map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.countryId}</td>
                <td className="num">{ageAt(p.birth, START)}</td>
                <td>{p.hand}</td>
                <td className="num">{currentAbility(p.attrs)}</td>
                <td className="stars">{stars(p.pa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t('pairs')}</h2>
      <div className="scroll">
        <table>
          <tbody>
            {pairs.slice(0, 150).map((p) => (
              <tr key={p.id}>
                <td>{p.discipline}</td>
                <td>{p.playerIds.map((id) => byId.get(id)!.name).join(' / ')}</td>
                <td className="num">{t('chemistry')} {p.chemistry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </main>
  );
}
