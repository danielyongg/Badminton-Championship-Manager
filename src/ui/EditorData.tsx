import { useState } from 'react';
import { CONFEDERATIONS } from '../engine/pack';
import { DISCIPLINES, ROUNDS, type AgeBand, type NamePool, type Ruleset } from '../engine/types';
import { numLocale, t } from '../i18n';
import { AddById, Num, removeAt, Sel, Txt, type SectionProps } from './Editor';

// Bagian Editor untuk data ruleset & dunia: kalender, tier, kota, negara, aturan lain.

const NAME_POOLS: NamePool[] = ['id', 'cn', 'jp', 'kr', 'th', 'my', 'in', 'vn', 'nordic', 'en', 'fr', 'de', 'es', 'generic'];

// Mengubah kota / minggu di Editor = tetap tiap tahun (tuan rumah / jadwal per tahun bawaan preset dihapus).
export function Calendar({ data, mode, ch }: SectionProps) {
  const rs = data.ruleset;
  const cities = data.world.cities.map((c): [string, string] => [c.id, `${c.name} (${c.countryId})`]);
  const tiers = rs.tiers.map((x): [string, string] => [x.id, x.id]);
  const every = (e: { everyYears?: { interval: number; offset: number; invert?: boolean } }) =>
    e.everyYears ? `${e.everyYears.invert ? t('exceptEvery') : t('every')} ${e.everyYears.interval} ${t('years')}` : '';
  return (
    <>
      <section className="card scroll">
        <table>
          <thead><tr><th>id</th><th>{t('name')}</th><th>{t('city')}</th><th>{t('week')}</th><th>{t('tier')}</th><th>{t('prize')} (USD)</th><th></th><th></th></tr></thead>
          <tbody>{rs.calendar.map((e) => (
            <tr key={e.id}>
              <td><small>{e.id}</small></td><td><Txt o={e} k="name" ch={ch} w={200} /></td><td><Sel o={e} k="cityId" ch={() => { delete e.hosts; delete e.rotation; ch(); }} options={cities} /></td>
              <td><Num o={e} k="week" ch={() => { delete e.weeks; ch(); }} w={50} /></td><td><Sel o={e} k="tierId" ch={ch} options={tiers} /></td>
              <td><Num o={e} k="prizeUsd" ch={ch} w={100} /></td><td><small>{every(e)}</small></td>
              <td>{mode === 'pack' && <button onClick={() => { removeAt(rs.calendar, e); ch(); }}>✕</button>}</td>
            </tr>
          ))}</tbody>
        </table>
        <AddById taken={[...rs.calendar, ...rs.team.events].map((e) => e.id)} onAdd={(id) => {
          const tier = rs.tiers.at(-1)!;
          rs.calendar.push({ id, name: id, cityId: data.world.cities[0].id, week: 1, tierId: tier.id, prizeUsd: tier.prizeUsd });
          ch();
        }} />
      </section>
      <section className="card scroll">
        <h3>{t('tabTeam')}</h3>
        <table>
          <thead><tr><th>id</th><th>{t('name')}</th><th>{t('nameMixed')}</th><th>{t('city')}</th><th>{t('week')}</th><th></th></tr></thead>
          <tbody>{rs.team.events.map((e) => (
            <tr key={e.id}>
              <td><small>{e.id}</small></td><td><Txt o={e} k="name" ch={ch} w={240} /></td>
              <td>{e.confederation && <Txt o={e} k="nameMixed" ch={ch} w={240} />}</td><td><Sel o={e} k="cityId" ch={() => { delete e.hosts; delete e.rotation; ch(); }} options={cities} /></td>
              <td><Num o={e} k="week" ch={() => { delete e.weeks; ch(); }} w={50} /></td><td><small>{e.confederation ?? e.formats?.join(', ')} {every(e)}</small></td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </>
  );
}

export function Tiers({ data, ch }: SectionProps) {
  const rs = data.ruleset;
  const [id, setId] = useState(rs.tiers[0].id);
  const tier = rs.tiers.find((x) => x.id === id) ?? rs.tiers[0];
  const row = (label: string, table: number[]) => (
    <tr><td>{label}</td>{table.map((_, i) => <td key={i}><Num o={table} k={i} ch={ch} w={72} /></td>)}</tr>
  );
  return (
    <section className="card">
      <div className="controls">
        <select value={tier.id} onChange={(e) => setId(e.target.value)}>{rs.tiers.map((x) => <option key={x.id} value={x.id}>{x.id} — {x.name}</option>)}</select>
      </div>
      <div className="controls">
        <label>{t('name')}<Txt o={tier} k="name" ch={ch} /></label>
        <label>Grade<Num o={tier} k="grade" ch={ch} w={50} /></label>
        <label>{t('prize')} (USD)<Num o={tier} k="prizeUsd" ch={ch} w={110} /></label>
        <label>{t('wildcard')}<Num o={tier} k="wildcards" ch={ch} w={50} /></label>
        <label>{t('qualPerSlot')}<Num o={tier} k="qualifyingPerSlot" ch={ch} w={50} /></label>
        {DISCIPLINES.map((d) => <label key={d}>Draw {d}<Num o={tier.drawSize} k={d} ch={ch} w={60} /></label>)}
      </div>
      <div className="scroll">
        <table>
          <thead><tr><th></th>{ROUNDS.map((r) => <th key={r}>{r}</th>)}</tr></thead>
          <tbody>
            {row(t('points'), tier.points)}
            {row(`${t('prize')} % ${t('singles')}`, tier.prizeSplit.singles)}
            {row(`${t('prize')} % ${t('doubles')}`, tier.prizeSplit.doubles)}
            {tier.bonusPoints?.map((b, i) => row(`${t('bonusPoints')} ≥ $${b.minExtraPrizeUsd.toLocaleString(numLocale())}`, b.points))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Cities({ data, mode, ch }: SectionProps) {
  const { world } = data;
  const countries = world.countries.map((c): [string, string] => [c.id, c.id]);
  return (
    <section className="card scroll">
      <table>
        <thead><tr><th>id</th><th>{t('name')}</th><th>{t('country')}</th><th>{t('venue')}</th><th>Lat</th><th>Lon</th><th></th></tr></thead>
        <tbody>{world.cities.map((c) => (
          <tr key={c.id}>
            <td><small>{c.id}</small></td><td><Txt o={c} k="name" ch={ch} w={140} /></td><td><Sel o={c} k="countryId" ch={ch} options={countries} /></td>
            <td><Txt o={c} k="venue" ch={ch} w={220} /></td><td><Num o={c} k="lat" ch={ch} /></td><td><Num o={c} k="lon" ch={ch} /></td>
            <td>{mode === 'pack' && <button onClick={() => { removeAt(world.cities, c); ch(); }}>✕</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <AddById taken={world.cities.map((c) => c.id)} onAdd={(id) => {
        world.cities.push({ id, countryId: world.countries[0].id, name: id, venue: '', lat: 0, lon: 0 });
        ch();
      }} />
    </section>
  );
}

export function Countries({ data, mode, ch }: SectionProps) {
  const { world } = data;
  return (
    <section className="card scroll">
      <p className="hint">{t('countryHelp')}</p>
      <table>
        <thead><tr><th>id</th><th>{t('name')}</th><th>{t('confederation')}</th><th>{t('tradition')}</th><th>{t('namePool')}</th><th></th></tr></thead>
        <tbody>{world.countries.map((c) => (
          <tr key={c.id}>
            <td><small>{c.id}</small></td><td><Txt o={c} k="name" ch={ch} /></td>
            <td><Sel o={c} k="confederation" ch={ch} options={CONFEDERATIONS.map((x) => [x, x])} /></td>
            <td><Num o={c} k="traditionStrength" ch={ch} w={60} /></td>
            <td><Sel o={c} k="namePool" ch={ch} options={NAME_POOLS.map((x) => [x, x])} /></td>
            <td>{mode === 'pack' && <button onClick={() => { removeAt(world.countries, c); ch(); }}>✕</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <AddById taken={world.countries.map((c) => c.id)} onAdd={(id) => {
        world.countries.push({ id, name: id, confederation: 'BA', traditionStrength: 20, namePool: 'generic' });
        ch();
      }} />
    </section>
  );
}

function Bands({ title, bands, ch }: { title: string; bands: AgeBand[]; ch: () => void }) {
  return (
    <div>
      <h4>{title}</h4>
      <table style={{ width: 'auto' }}>
        <thead><tr><th>{t('upToAge')}</th><th>min</th><th>max</th></tr></thead>
        <tbody>{bands.map((b, i) => (
          <tr key={i}><td><Num o={b} k="maxAge" ch={ch} w={60} /></td><td><Num o={b} k="min" ch={ch} /></td><td><Num o={b} k="max" ch={ch} /></td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/** Bagian ruleset lain diedit sebagai JSON (struktur lengkap terlihat & bisa disalin). */
const JSON_SECTIONS = ['ranking', 'race', 'seeding', 'qualifierRatio', 'wtf', 'topCommitted', 'generator', 'match', 'fatigue',
  'ai', 'development', 'injury', 'career', 'team'] as const satisfies readonly (keyof Ruleset)[];

function JsonSection({ rs, ch }: { rs: Ruleset; ch: () => void }) {
  const [key, setKey] = useState<(typeof JSON_SECTIONS)[number]>('ranking');
  const [text, setText] = useState(() => JSON.stringify(rs[key], null, 2));
  const [msg, setMsg] = useState('');
  const choose = (k: typeof key) => { setKey(k); setText(JSON.stringify(rs[k], null, 2)); setMsg(''); };
  const apply = () => {
    try {
      (rs as unknown as Record<string, unknown>)[key] = JSON.parse(text);
      setMsg(`✓ ${t('applied')}`);
      ch();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div>
      <h4>{t('advancedRules')}</h4>
      <div className="controls">
        <select value={key} onChange={(e) => choose(e.target.value as typeof key)}>{JSON_SECTIONS.map((k) => <option key={k}>{k}</option>)}</select>
        <button onClick={apply}>{t('apply')}</button>
        <small className={msg.startsWith('✓') ? 'up' : 'down'}>{msg}</small>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
        style={{ width: '100%', minHeight: 320, fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }} />
    </div>
  );
}

export function RulesetForm({ data, mode, ch }: SectionProps) {
  const rs = data.ruleset;
  const dev = rs.development;
  return (
    <section className="card">
      <div className="controls">
        <label>{t('name')}<Txt o={rs} k="name" ch={ch} /></label>
        <label>{t('startYear')}<Num o={rs} k="startYear" ch={ch} disabled={mode === 'save'} /></label>
      </div>
      <div className="dash">
        <Bands title={t('growthByAge')} bands={dev.growthByAge} ch={ch} />
        <Bands title={t('declineByAge')} bands={dev.declineByAge} ch={ch} />
        <Bands title={t('retirementByAge')} bands={dev.retirementByAge} ch={ch} />
      </div>
      <JsonSection rs={rs} ch={ch} />
    </section>
  );
}
