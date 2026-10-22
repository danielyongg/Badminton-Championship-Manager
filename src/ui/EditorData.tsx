import { useState, type CSSProperties, type ReactNode } from 'react';
import { CONFEDERATIONS } from '../engine/pack';
import { DISCIPLINES, ROUNDS, type AgeBand, type NamePool, type Ruleset } from '../engine/types';
import { dataName, numLocale, t } from '../i18n';
import { AddById, Num, removeAt, Sel, Txt, type SectionProps } from './Editor';

// Bagian Editor untuk data ruleset & dunia: kalender, tier, kota, negara, aturan lain.
// Daftar memakai baris berlabel (`Rows`): kolom dengan judul di laptop, kartu dua kolom dengan label di HP — tanpa
// geser ke samping. Id turnamen & kota dibuat otomatis dari nama saat ditambah (tidak bisa diubah: dirujuk data lain).

const NAME_POOLS: NamePool[] = ['id', 'cn', 'jp', 'kr', 'th', 'my', 'in', 'vn', 'nordic', 'en', 'fr', 'de', 'es', 'generic'];

/** Id unik dari nama: huruf kecil tanpa aksen, dipisah tanda hubung; diberi akhiran -2, -3, … bila sudah dipakai. */
const uniqueId = (name: string, taken: string[]) => {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

/** Daftar baris berlabel. `cols`: kolom grid di laptop; `keep`: tetap berkolom di HP (tabel angka kecil). */
function Rows({ cols, head, keep, children }: { cols: string; head: ReactNode[]; keep?: boolean; children: ReactNode }) {
  return (
    <div className={`ed-rows${keep ? ' keep' : ''}`} style={{ '--cols': cols } as CSSProperties}>
      <div className="ed-rhead">{head.map((h, i) => <span key={i}>{h}</span>)}</div>
      {children}
    </div>
  );
}
/** Satu sel: label kecil (hanya tampil di HP) + isian. `wide` = selebar baris di HP. */
const cell = (label: string, node: ReactNode, cls = '') => (
  <label className={`ed-cell ${cls}`}><span className="ed-lbl">{label}</span>{node}</label>
);
const delBtn = (onClick: () => void) => <button className="mini" aria-label={t('delete')} title={t('delete')} onClick={onClick}>✕</button>;

// Mengubah kota / minggu di Editor = tetap tiap tahun (tuan rumah / jadwal per tahun bawaan preset dihapus).
export function Calendar({ data, mode, ch }: SectionProps) {
  const rs = data.ruleset;
  const cities = data.world.cities.map((c): [string, string] => [c.id, `${dataName(c.name)} (${c.countryId})`]);
  const tiers = rs.tiers.map((x): [string, string] => [x.id, x.id]);
  const every = (e: { everyYears?: { interval: number; offset: number; invert?: boolean } }) =>
    e.everyYears ? `${e.everyYears.invert ? t('exceptEvery') : t('every')} ${e.everyYears.interval} ${t('years')}` : '';
  const pack = mode === 'pack';
  const add = () => {
    const tier = rs.tiers.at(-1)!;
    const name = t('newTournament');
    rs.calendar.push({ id: uniqueId(name, [...rs.calendar, ...rs.team.events].map((e) => e.id)), name, cityId: data.world.cities[0].id, week: 1, tierId: tier.id, prizeUsd: tier.prizeUsd });
    ch();
  };
  return (
    <>
      <section className="card">
        <h3>{t('ed_calendar')} <span className="muted-text">({rs.calendar.length})</span></h3>
        <Rows cols="minmax(0, 2fr) minmax(0, 1.4fr) 64px 104px 116px 32px" head={[t('name'), t('city'), t('week'), t('tier'), `${t('prize')} (USD)`, '']}>
          {rs.calendar.map((e) => (
            <div className="ed-row" key={e.id}>
              {cell(t('name'), <><Txt o={e} k="name" ch={ch} w={0} />{every(e) && <small className="muted-text">{every(e)}</small>}</>, 'wide')}
              {cell(t('city'), <Sel o={e} k="cityId" ch={() => { delete e.hosts; delete e.rotation; ch(); }} options={cities} />, 'wide')}
              {cell(t('week'), <Num o={e} k="week" ch={() => { delete e.weeks; ch(); }} w={0} />, 'third')}
              {cell(t('tier'), <Sel o={e} k="tierId" ch={ch} options={tiers} />, 'third')}
              {cell(`${t('prize')} (USD)`, <Num o={e} k="prizeUsd" ch={ch} w={0} />, 'third')}
              <span className="ed-act">{pack && delBtn(() => { removeAt(rs.calendar, e); ch(); })}</span>
            </div>
          ))}
        </Rows>
        <p className="controls ed-actions"><button onClick={add}>+ {t('addTournament')}</button></p>
      </section>
      <section className="card">
        <h3>{t('tabTeam')} <span className="muted-text">({rs.team.events.length})</span></h3>
        <Rows cols="minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1.4fr) 64px" head={[t('name'), t('nameMixed'), t('city'), t('week')]}>
          {rs.team.events.map((e) => (
            <div className="ed-row" key={e.id}>
              {cell(t('name'), <><Txt o={e} k="name" ch={ch} w={0} /><small className="muted-text">{e.confederation ?? e.formats?.join(', ')} {every(e)}</small></>, 'wide')}
              {cell(t('nameMixed'), e.confederation ? <Txt o={e} k="nameMixed" ch={ch} w={0} /> : <span className="muted-text">—</span>, `wide${e.confederation ? '' : ' ed-empty'}`)}
              {cell(t('city'), <Sel o={e} k="cityId" ch={() => { delete e.hosts; delete e.rotation; ch(); }} options={cities} />)}
              {cell(t('week'), <Num o={e} k="week" ch={() => { delete e.weeks; ch(); }} w={0} />)}
            </div>
          ))}
        </Rows>
      </section>
    </>
  );
}

export function Tiers({ data, ch }: SectionProps) {
  const rs = data.ruleset;
  const [id, setId] = useState(rs.tiers[0].id);
  const tier = rs.tiers.find((x) => x.id === id) ?? rs.tiers[0];
  // Per babak (baris): poin, % hadiah tunggal/ganda, poin bonus — muat di HP tanpa geser ke samping.
  const cols: { label: string; table: number[] }[] = [
    { label: t('points'), table: tier.points },
    { label: `${t('prize')} % ${t('singles')}`, table: tier.prizeSplit.singles },
    { label: `${t('prize')} % ${t('doubles')}`, table: tier.prizeSplit.doubles },
    ...(tier.bonusPoints ?? []).map((b) => ({ label: `${t('bonusPoints')} ≥ $${b.minExtraPrizeUsd.toLocaleString(numLocale())}`, table: b.points })),
  ];
  return (
    <section className="card">
      <div className="ed-tools">
        <select value={tier.id} onChange={(e) => setId(e.target.value)}>{rs.tiers.map((x) => <option key={x.id} value={x.id}>{x.id} — {dataName(x.name)}</option>)}</select>
      </div>
      <div className="ed-form">
        <label className="wide">{t('name')}<Txt o={tier} k="name" ch={ch} w={0} /></label>
        <label>Grade<Num o={tier} k="grade" ch={ch} w={0} /></label>
        <label>{t('prize')} (USD)<Num o={tier} k="prizeUsd" ch={ch} w={0} /></label>
        <label>{t('wildcard')}<Num o={tier} k="wildcards" ch={ch} w={0} /></label>
        <label>{t('qualPerSlot')}<Num o={tier} k="qualifyingPerSlot" ch={ch} w={0} /></label>
      </div>
      <h4>Draw</h4>
      <div className="ed-form attrs">
        {DISCIPLINES.map((d) => <label key={d}>{d}<Num o={tier.drawSize} k={d} ch={ch} w={0} /></label>)}
      </div>
      <h4>{t('points')} & {t('prize')}</h4>
      <Rows keep cols={`44px repeat(${cols.length}, minmax(0, 1fr))`} head={[t('roundCol'), ...cols.map((c) => c.label)]}>
        {ROUNDS.map((r, i) => (
          <div className="ed-row" key={r}>
            <b className="ed-round">{r}</b>
            {cols.map((c) => <span className="ed-cell" key={c.label}>{c.table[i] !== undefined && <Num o={c.table} k={i} ch={ch} w={0} />}</span>)}
          </div>
        ))}
      </Rows>
    </section>
  );
}

export function Cities({ data, mode, ch }: SectionProps) {
  const { world } = data;
  const countries = world.countries.map((c): [string, string] => [c.id, c.id]);
  const add = () => {
    const name = t('newCity');
    world.cities.push({ id: uniqueId(name, world.cities.map((c) => c.id)), countryId: world.countries[0].id, name, venue: '', lat: 0, lon: 0 });
    ch();
  };
  return (
    <section className="card">
      <h3>{t('ed_cities')} <span className="muted-text">({world.cities.length})</span></h3>
      <Rows cols="minmax(0, 1.3fr) 96px minmax(0, 1.7fr) 84px 84px 32px" head={[t('name'), t('country'), t('venue'), 'Lat', 'Lon', '']}>
        {world.cities.map((c) => (
          <div className="ed-row" key={c.id}>
            {cell(t('name'), <Txt o={c} k="name" ch={ch} w={0} />)}
            {cell(t('country'), <Sel o={c} k="countryId" ch={ch} options={countries} />)}
            {cell(t('venue'), <Txt o={c} k="venue" ch={ch} w={0} />, 'wide')}
            {cell('Lat', <Num o={c} k="lat" ch={ch} w={0} />)}
            {cell('Lon', <Num o={c} k="lon" ch={ch} w={0} />)}
            <span className="ed-act">{mode === 'pack' && delBtn(() => { removeAt(world.cities, c); ch(); })}</span>
          </div>
        ))}
      </Rows>
      <p className="controls ed-actions"><button onClick={add}>+ {t('addCity')}</button></p>
    </section>
  );
}

export function Countries({ data, mode, ch }: SectionProps) {
  const { world } = data;
  return (
    <section className="card">
      <h3>{t('ed_countries')} <span className="muted-text">({world.countries.length})</span></h3>
      <p className="hint">{t('countryHelp')}</p>
      <Rows cols="52px minmax(0, 1.6fr) 104px 84px 112px 32px" head={['', t('name'), t('confederation'), t('tradition'), t('namePool'), '']}>
        {world.countries.map((c) => (
          <div className="ed-row" key={c.id}>
            <b className="ed-code">{c.id}</b>
            {cell(t('name'), <Txt o={c} k="name" ch={ch} w={0} />, 'wide')}
            {cell(t('confederation'), <Sel o={c} k="confederation" ch={ch} options={CONFEDERATIONS.map((x) => [x, x])} />, 'third')}
            {cell(t('tradition'), <Num o={c} k="traditionStrength" ch={ch} w={0} />, 'third')}
            {cell(t('namePool'), <Sel o={c} k="namePool" ch={ch} options={NAME_POOLS.map((x) => [x, x])} />, 'third')}
            <span className="ed-act">{mode === 'pack' && delBtn(() => { removeAt(world.countries, c); ch(); })}</span>
          </div>
        ))}
      </Rows>
      {/* Id negara = kode (mis. INA) yang tampil di seluruh game, jadi diisi sendiri. */}
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
      <Rows keep cols="repeat(3, minmax(0, 1fr))" head={[t('upToAge'), 'min', 'max']}>
        {bands.map((b, i) => (
          <div className="ed-row" key={i}>
            <Num o={b} k="maxAge" ch={ch} w={0} /><Num o={b} k="min" ch={ch} w={0} /><Num o={b} k="max" ch={ch} w={0} />
          </div>
        ))}
      </Rows>
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
      <div className="ed-tools json">
        <select value={key} onChange={(e) => choose(e.target.value as typeof key)}>{JSON_SECTIONS.map((k) => <option key={k}>{k}</option>)}</select>
        <button className="primary" onClick={apply}>{t('apply')}</button>
      </div>
      {msg && <p className={msg.startsWith('✓') ? 'up' : 'down'}><small>{msg}</small></p>}
      <textarea className="ed-json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
    </div>
  );
}

export function RulesetForm({ data, mode, ch }: SectionProps) {
  const rs = data.ruleset;
  const dev = rs.development;
  return (
    <section className="card">
      <div className="ed-form">
        <label className="wide">{t('name')}<Txt o={rs} k="name" ch={ch} w={0} /></label>
        <label>{t('startYear')}<Num o={rs} k="startYear" ch={ch} w={0} disabled={mode === 'save'} /></label>
      </div>
      <div className="ed-bands">
        <Bands title={t('growthByAge')} bands={dev.growthByAge} ch={ch} />
        <Bands title={t('declineByAge')} bands={dev.declineByAge} ch={ch} />
        <Bands title={t('retirementByAge')} bands={dev.retirementByAge} ch={ch} />
      </div>
      <JsonSection rs={rs} ch={ch} />
    </section>
  );
}
