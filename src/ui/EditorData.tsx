import { useState, type CSSProperties, type ReactNode } from 'react';
import { CONFEDERATIONS } from '../engine/pack';
import { DISCIPLINES, ROUNDS, type AgeBand, type NamePool, type Ruleset } from '../engine/types';
import { dataName, numLocale, t } from '../i18n';
import { AddById, Num, removeAt, Sel, Txt, type SectionProps } from './Editor';

// Bagian Editor untuk data ruleset & dunia: kalender, tier, kota, negara, aturan lain.
// Turnamen, kota & negara: pilih satu dari dropdown lalu edit lewat form (tidak memanjang di HP). Id turnamen & kota
// dibuat otomatis dari nama saat ditambah (tidak bisa diubah: dirujuk data lain).

const NAME_POOLS: NamePool[] = ['id', 'cn', 'jp', 'kr', 'th', 'my', 'in', 'vn', 'nordic', 'en', 'fr', 'de', 'es', 'generic'];

/** Id unik dari nama: huruf kecil tanpa aksen, dipisah tanda hubung; diberi akhiran -2, -3, … bila sudah dipakai. */
const uniqueId = (name: string, taken: string[]) => {
  const base = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
};

/** Tabel angka kecil berkolom (poin tier, tabel umur): `cols` = kolom grid, judul di atas; muat juga di HP. */
function Rows({ cols, head, children }: { cols: string; head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="ed-rows" style={{ '--cols': cols } as CSSProperties}>
      <div className="ed-rhead">{head.map((h, i) => <span key={i}>{h}</span>)}</div>
      {children}
    </div>
  );
}

// Mengubah kota / minggu di Editor = tetap tiap tahun (tuan rumah / jadwal per tahun bawaan preset dihapus).
// Satu turnamen diedit sekaligus: pilih dari dropdown (individu & beregu, urut minggu), isian tampil sebagai form.
export function Calendar({ data, mode, ch }: SectionProps) {
  const rs = data.ruleset;
  const cities = data.world.cities.map((c): [string, string] => [c.id, `${dataName(c.name)} (${c.countryId})`]);
  const tiers = rs.tiers.map((x): [string, string] => [x.id, x.id]);
  const every = (e: { everyYears?: { interval: number; offset: number; invert?: boolean } }) =>
    e.everyYears ? `${e.everyYears.invert ? t('exceptEvery') : t('every')} ${e.everyYears.interval} ${t('years')}` : '';
  const byWeek = <T extends { week: number; name: string }>(list: T[]) => [...list].sort((a, b) => a.week - b.week || a.name.localeCompare(b.name));
  const [id, setId] = useState(rs.calendar[0]?.id ?? rs.team.events[0]?.id);
  const ev = rs.calendar.find((e) => e.id === id);
  const team = ev ? undefined : rs.team.events.find((e) => e.id === id);
  const cityCh = (e: { hosts?: unknown; rotation?: unknown }) => () => { delete e.hosts; delete e.rotation; ch(); };
  const add = () => {
    const tier = rs.tiers.at(-1)!;
    const name = t('newTournament');
    const nid = uniqueId(name, [...rs.calendar, ...rs.team.events].map((e) => e.id));
    rs.calendar.push({ id: nid, name, cityId: data.world.cities[0].id, week: 1, tierId: tier.id, prizeUsd: tier.prizeUsd });
    setId(nid);
    ch();
  };
  return (
    <section className="card">
      <h3>{t('ed_calendar')} <span className="muted-text">({rs.calendar.length} + {rs.team.events.length} {t('tabTeam').toLowerCase()})</span></h3>
      <div className="ed-tools pick">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <optgroup label={t('individual')}>
            {byWeek(rs.calendar).map((e) => <option key={e.id} value={e.id}>{t('weekShort')}{e.week} · {e.name} ({e.tierId})</option>)}
          </optgroup>
          <optgroup label={t('tabTeam')}>
            {byWeek(rs.team.events).map((e) => <option key={e.id} value={e.id}>{t('weekShort')}{e.week} · {e.name}</option>)}
          </optgroup>
        </select>
        <button onClick={add}>+ {t('addTournament')}</button>
      </div>
      {ev && <>
        <div className="ed-form">
          <label className="wide">{t('name')}<Txt o={ev} k="name" ch={ch} w={0} /></label>
          <label className="wide">{t('city')}<Sel o={ev} k="cityId" ch={cityCh(ev)} options={cities} /></label>
          <label>{t('week')}<Num o={ev} k="week" ch={() => { delete ev.weeks; ch(); }} w={0} /></label>
          <label>{t('tier')}<Sel o={ev} k="tierId" ch={ch} options={tiers} /></label>
          <label>{t('prize')} (USD)<Num o={ev} k="prizeUsd" ch={ch} w={0} /></label>
        </div>
        {every(ev) && <p className="hint">{every(ev)}</p>}
        {mode === 'pack' && <p className="controls ed-actions"><button className="danger" onClick={() => { removeAt(rs.calendar, ev); setId(rs.calendar[0]?.id); ch(); }}>{t('delete')}</button></p>}
      </>}
      {team && <>
        <div className="ed-form">
          <label className="wide">{t('name')}<Txt o={team} k="name" ch={ch} w={0} /></label>
          {team.confederation && <label className="wide">{t('nameMixed')}<Txt o={team} k="nameMixed" ch={ch} w={0} /></label>}
          <label className="wide">{t('city')}<Sel o={team} k="cityId" ch={cityCh(team)} options={cities} /></label>
          <label>{t('week')}<Num o={team} k="week" ch={() => { delete team.weeks; ch(); }} w={0} /></label>
        </div>
        <p className="hint">{team.confederation ?? team.formats?.join(', ')} {every(team)}</p>
      </>}
    </section>
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
      <Rows cols={`44px repeat(${cols.length}, minmax(0, 1fr))`} head={[t('roundCol'), ...cols.map((c) => c.label)]}>
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

// Kota & negara: satu data diedit sekaligus — pilih dari dropdown (urut nama), isian tampil sebagai form.
export function Cities({ data, mode, ch }: SectionProps) {
  const { world } = data;
  const countries = world.countries.map((c): [string, string] => [c.id, `${c.id} — ${dataName(c.name)}`]);
  const [id, setId] = useState(world.cities[0]?.id);
  const c = world.cities.find((x) => x.id === id);
  const add = () => {
    const name = t('newCity');
    const nid = uniqueId(name, world.cities.map((x) => x.id));
    world.cities.push({ id: nid, countryId: world.countries[0].id, name, venue: '', lat: 0, lon: 0 });
    setId(nid);
    ch();
  };
  const sorted = [...world.cities].sort((a, b) => dataName(a.name).localeCompare(dataName(b.name)));
  return (
    <section className="card">
      <h3>{t('ed_cities')} <span className="muted-text">({world.cities.length})</span></h3>
      <div className="ed-tools pick">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {sorted.map((x) => <option key={x.id} value={x.id}>{dataName(x.name)} ({x.countryId})</option>)}
        </select>
        <button onClick={add}>+ {t('addCity')}</button>
      </div>
      {c && <>
        <div className="ed-form">
          <label className="wide">{t('name')}<Txt o={c} k="name" ch={ch} w={0} /></label>
          <label className="wide">{t('country')}<Sel o={c} k="countryId" ch={ch} options={countries} /></label>
          <label className="wide">{t('venue')}<Txt o={c} k="venue" ch={ch} w={0} /></label>
          <label>Lat<Num o={c} k="lat" ch={ch} w={0} /></label>
          <label>Lon<Num o={c} k="lon" ch={ch} w={0} /></label>
        </div>
        {mode === 'pack' && <p className="controls ed-actions"><button className="danger" onClick={() => { removeAt(world.cities, c); setId(world.cities[0]?.id); ch(); }}>{t('delete')}</button></p>}
      </>}
    </section>
  );
}

export function Countries({ data, mode, ch }: SectionProps) {
  const { world } = data;
  const [id, setId] = useState(world.countries[0]?.id);
  const c = world.countries.find((x) => x.id === id);
  return (
    <section className="card">
      <h3>{t('ed_countries')} <span className="muted-text">({world.countries.length})</span></h3>
      <p className="hint">{t('countryHelp')}</p>
      <div className="ed-tools">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {world.countries.map((x) => <option key={x.id} value={x.id}>{x.id} — {dataName(x.name)}</option>)}
        </select>
      </div>
      {c && <>
        <div className="ed-form">
          <label className="wide">{t('name')}<Txt o={c} k="name" ch={ch} w={0} /></label>
          <label>{t('confederation')}<Sel o={c} k="confederation" ch={ch} options={CONFEDERATIONS.map((x) => [x, x])} /></label>
          <label>{t('tradition')}<Num o={c} k="traditionStrength" ch={ch} w={0} /></label>
          <label>{t('namePool')}<Sel o={c} k="namePool" ch={ch} options={NAME_POOLS.map((x) => [x, x])} /></label>
        </div>
        {mode === 'pack' && <p className="controls ed-actions"><button className="danger" onClick={() => { removeAt(world.countries, c); setId(world.countries[0]?.id); ch(); }}>{t('delete')}</button></p>}
      </>}
      {/* Id negara = kode (mis. INA) yang tampil di seluruh game, jadi diisi sendiri. */}
      <h4>{t('addCountry')}</h4>
      <AddById taken={world.countries.map((x) => x.id)} onAdd={(nid) => {
        world.countries.push({ id: nid, name: nid, confederation: 'BA', traditionStrength: 20, namePool: 'generic' });
        setId(nid);
        ch();
      }} />
    </section>
  );
}

function Bands({ title, bands, ch }: { title: string; bands: AgeBand[]; ch: () => void }) {
  return (
    <div>
      <h4>{title}</h4>
      <Rows cols="repeat(3, minmax(0, 1fr))" head={[t('upToAge'), 'min', 'max']}>
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
