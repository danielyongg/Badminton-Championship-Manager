import { useMemo, useState } from 'react';
import { ageAt, currentAbility } from '../engine/generator';
import { PRESETS, presetPack } from '../engine/pack';
import { WORLD } from '../engine/presets/world';
import { newSeason } from '../engine/season';
import { dataName, t } from '../i18n';
import { MatchLab } from './MatchLab';
import { Ranking } from './Ranking';
import { Wizard } from './Wizard';


// ponytail: potensi tampil sebagai bintang kasar; akurasi bertahap menurut usia menyusul di Fase 7.
const stars = (pa: number) => '★'.repeat(Math.max(1, Math.round(pa / 20)));

export function Lab({ onBack }: { onBack: () => void }) {
  const [rulesetId, setRulesetId] = useState(PRESETS[0].id);
  const [seed, setSeed] = useState(1);
  const [countryId, setCountryId] = useState('INA');
  const [gender, setGender] = useState<'M' | 'F'>('M');
  const [tab, setTab] = useState<'players' | 'match' | 'wizard' | 'ranking'>('players');

  const ruleset = PRESETS.find((r) => r.id === rulesetId)!;
  const start = { year: ruleset.startYear, week: 1 };
  // Dunia sama seperti New Game dengan paket bawaan: atlet asli BWF + pelengkap fiktif dari seed.
  const world = useMemo(() => newSeason(WORLD, ruleset, seed, start, null, presetPack(ruleset)), [seed, ruleset]);
  const byId = useMemo(() => new Map(world.players.map((p) => [p.id, p])), [world]);

  const players = world.players
    .filter((p) => (!countryId || p.countryId === countryId) && p.gender === gender)
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
  const pairs = world.pairs.filter((p) => !countryId || p.playerIds.some((id) => byId.get(id)!.countryId === countryId));

  return (
    <main>
      {/* Kerangka sama dengan layar karier: bilah atas, menu tab (laptop: menu samping), isi di .page. */}
      <header className="controls shell">
        <span className="title"><b>{t('lab')}</b></span>
        <button className="menu-btn" onClick={onBack}>{t('mainMenu')}</button>
      </header>
      <nav className="controls maintabs">
        <button aria-pressed={tab === 'players'} onClick={() => setTab('players')}>{t('tabPlayers')}</button>
        <button aria-pressed={tab === 'match'} onClick={() => setTab('match')}>{t('tabMatch')}</button>
        <button aria-pressed={tab === 'wizard'} onClick={() => setTab('wizard')}>{t('tabWizard')}</button>
        <button aria-pressed={tab === 'ranking'} onClick={() => setTab('ranking')}>{t('tabRanking')}</button>
      </nav>
      <div className="page">
      {tab === 'ranking' ? <Ranking ruleset={ruleset} world={WORLD} seed={seed} />
      : tab === 'wizard' ? <Wizard players={world.players} pairs={world.pairs} ruleset={ruleset} world={WORLD} />
      : tab === 'match' ? <MatchLab players={world.players.filter((p) => p.gender === gender && p.focus !== 'D')} cfg={ruleset.match} /> : <>
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
            {WORLD.countries.map((c) => <option key={c.id} value={c.id}>{dataName(c.name)}</option>)}
          </select>
        </label>
        <label>{t('gender')}
          <select value={gender} onChange={(e) => setGender(e.target.value as 'M' | 'F')}>
            <option value="M">{t('men')}</option>
            <option value="F">{t('women')}</option>
          </select>
        </label>
        <span className="count">{players.length} {t('players')}</span>
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
                <td className="num">{ageAt(p.birth, start)}</td>
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
      </div>
    </main>
  );
}
