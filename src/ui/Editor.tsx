import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type ReactNode } from 'react';
import { deletePack, listPacks, writePack } from '../db/saves';
import { formPair } from '../engine/career';
import { ageAt, currentAbility, generateWorld } from '../engine/generator';
import { normalizePack, presetPack, PRESETS, validatePack, type DataPack } from '../engine/pack';
import { makeRng } from '../engine/rng';
import { ATTRS, type GameDate, type Pair, type Player, type Ruleset, type World } from '../engine/types';
import { t, type TextKey } from '../i18n';
import { Calendar, Countries, Cities, RulesetForm, Tiers } from './EditorData';

// Editor data: dipakai untuk paket data (dari menu utama) dan untuk save yang sedang berjalan (tab Editor).
// Komponen mengubah objek data di tempat lalu memanggil `ch()`; pemilik data yang menyimpan.

export interface EditData { ruleset: Ruleset; world: World; players: Player[]; pairs: Pair[] }
/** 'save' = save berjalan: tidak ada penghapusan, negara/gender atlet tidak bisa diubah (riwayat tetap utuh). */
export type EditMode = 'pack' | 'save';
export interface SectionProps { data: EditData; mode: EditMode; date: GameDate; ch: () => void; country?: string }

type Obj = Record<string | number, unknown>;
type Cell = { o: object; k: string | number; ch: () => void; w?: number; disabled?: boolean };

export function Num({ o, k, ch, w = 70, disabled }: Cell) {
  return <input type="number" style={{ width: w }} disabled={disabled} value={(o as Obj)[k] as number}
    onChange={(e) => { const v = e.target.valueAsNumber; if (!Number.isNaN(v)) { (o as Obj)[k] = v; ch(); } }} />;
}
export function Txt({ o, k, ch, w = 160, disabled }: Cell) {
  return <input style={{ width: w }} disabled={disabled} value={(o as Obj)[k] as string} onChange={(e) => { (o as Obj)[k] = e.target.value; ch(); }} />;
}
export function Sel({ o, k, ch, options, disabled }: Cell & { options: [string, string][] }) {
  return (
    <select disabled={disabled} value={String((o as Obj)[k] ?? '')} onChange={(e) => { (o as Obj)[k] = e.target.value || undefined; ch(); }}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}
/** Tambah baris dengan id baru (id tidak bisa diubah setelah dibuat karena dirujuk data lain). */
export function AddById({ taken, onAdd }: { taken: string[]; onAdd: (id: string) => void }) {
  const [id, setId] = useState('');
  const clash = taken.includes(id.trim());
  return (
    <div className="controls">
      <input placeholder={t('newId')} value={id} onChange={(e) => setId(e.target.value)} />
      <button disabled={!id.trim() || clash} onClick={() => { onAdd(id.trim()); setId(''); }}>{t('add')}</button>
      {clash && <small className="down">{t('idTaken')}</small>}
    </div>
  );
}
/** Hapus elemen array di tempat. */
export const removeAt = <T,>(arr: T[], item: T) => arr.splice(arr.indexOf(item), 1);

const SECTIONS = ['players', 'pairs', 'calendar', 'tiers', 'cities', 'countries', 'rules'] as const;
type Section = (typeof SECTIONS)[number];

export function Editor({ data, mode, date, onChange, toolbar, country }: {
  data: EditData; mode: EditMode; date: GameDate; onChange: () => void; toolbar?: ReactNode; country?: string;
}) {
  const [section, setSection] = useState<Section>('players');
  const [, bump] = useState(0);
  const ch = () => { bump((x) => x + 1); onChange(); };
  const errors = validatePack(data);
  const props = { data, mode, date, ch, country };
  return (
    <>
      <nav className="controls">
        {SECTIONS.map((s) => <button key={s} aria-pressed={section === s} onClick={() => setSection(s)}>{t(`ed_${s}` as TextKey)}</button>)}
        {toolbar}
      </nav>
      {mode === 'save' && <p className="hint">{t('editorSaveNote')}</p>}
      <p className={errors.length ? 'down' : 'up'}>{errors.length ? `${errors.length} ${t('problems')}:` : `✓ ${t('dataValid')}`}</p>
      {errors.length > 0 && <ul className="hint">{errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
      {section === 'players' ? <Players {...props} />
        : section === 'pairs' ? <Pairs {...props} />
        : section === 'calendar' ? <Calendar {...props} />
        : section === 'tiers' ? <Tiers {...props} />
        : section === 'cities' ? <Cities {...props} />
        : section === 'countries' ? <Countries {...props} />
        : <RulesetForm {...props} />}
    </>
  );
}

const countryOptions = (w: World): [string, string][] => w.countries.map((c) => [c.id, `${c.id} — ${c.name}`]);

function Players({ data, mode, date, ch, country: initial }: SectionProps) {
  const [country, setCountry] = useState(initial ?? data.world.countries[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string>();
  const list = data.players
    .filter((p) => p.countryId === country && p.retired === undefined && p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs));
  const p = data.players.find((x) => x.id === sel);
  const add = (gender: 'M' | 'F') => {
    const np: Player = {
      id: `${country}-X${Date.now().toString(36)}`, name: t('newPlayerName'), countryId: country, gender, hand: 'R',
      birth: { year: date.year - 20, week: 1 }, attrs: Object.fromEntries(ATTRS.map((a) => [a, 50])) as Player['attrs'],
      pa: 60, form: 0, fatigue: 0, attrHistory: [],
    };
    data.players.push(np);
    setSel(np.id);
    ch();
  };
  const remove = (x: Player) => {
    if (!confirm(t('confirmDeletePlayer'))) return;
    for (const pair of data.pairs.filter((pr) => pr.playerIds.includes(x.id))) removeAt(data.pairs, pair);
    removeAt(data.players, x);
    setSel(undefined);
    ch();
  };
  const locked = mode === 'save';

  return (
    <div className="split">
      <section className="card">
        <div className="controls">
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {countryOptions(data.world).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={() => add('M')}>+ {t('men')}</button>
          <button onClick={() => add('F')}>+ {t('women')}</button>
        </div>
        {list.length === 0 && <p className="hint">{mode === 'pack' ? t('noPlayersPack') : '—'}</p>}
        <div className="scroll" style={{ maxHeight: 480 }}>
          <table>
            <tbody>{list.slice(0, 200).map((x) => (
              <tr key={x.id} className={x.id === sel ? 'sel' : ''} onClick={() => setSel(x.id)} style={{ cursor: 'pointer' }}>
                <td>{x.name} {x.gender === 'M' ? '♂' : '♀'}</td><td className="num">{ageAt(x.birth, date)} {t('yearsShort')}</td>
                <td className="num">{currentAbility(x.attrs)}</td><td className="num">PA {x.pa}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      {p && (
        <section className="card">
          <h3>{p.name} <small>({p.id})</small></h3>
          <table>
            <tbody>
              <tr><td>{t('name')}</td><td><Txt o={p} k="name" ch={ch} /></td></tr>
              <tr><td>{t('country')}</td><td><Sel o={p} k="countryId" ch={ch} options={countryOptions(data.world)} disabled={locked} /></td></tr>
              <tr><td>{t('gender')}</td><td><Sel o={p} k="gender" ch={ch} options={[['M', t('men')], ['F', t('women')]]} disabled={locked} /></td></tr>
              <tr><td>{t('hand')}</td><td><Sel o={p} k="hand" ch={ch} options={[['R', t('handR')], ['L', t('handL')]]} /></td></tr>
              <tr><td>{t('born')}</td><td><Num o={p.birth} k="year" ch={ch} /> {t('week')} <Num o={p.birth} k="week" ch={ch} w={50} /></td></tr>
              <tr><td>{t('potential')} (PA)</td><td><Num o={p} k="pa" ch={ch} /></td></tr>
              <tr><td>{t('trait')}</td><td><Sel o={p} k="trait" ch={ch} options={[['', '—'], ['late', t('traitLate')], ['stagnant', t('traitStagnant')]]} /></td></tr>
              {ATTRS.map((a) => <tr key={a}><td>{t(a)}</td><td><Num o={p.attrs} k={a} ch={ch} /></td></tr>)}
            </tbody>
          </table>
          {!locked && <button onClick={() => remove(p)}>{t('delete')}</button>}
        </section>
      )}
    </div>
  );
}

const DOUBLES: Pair['discipline'][] = ['MD', 'WD', 'XD'];

function Pairs({ data, mode, date, ch, country: initial }: SectionProps) {
  const [country, setCountry] = useState(initial ?? data.world.countries[0]?.id ?? '');
  const [d, setD] = useState<Pair['discipline']>('MD');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [msg, setMsg] = useState('');
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const mine = data.pairs.filter((p) => !p.dissolved && !p.adHoc && byId.get(p.playerIds[0])?.countryId === country);
  const athletes = data.players.filter((p) => p.countryId === country && p.retired === undefined)
    .sort((x, y) => currentAbility(y.attrs) - currentAbility(x.attrs));
  const create = () => {
    const r = formPair({ players: data.players, pairs: data.pairs, date }, d, a, b, makeRng(Date.now()));
    setMsg(typeof r === 'string' ? r : '');
    if (typeof r !== 'string') ch();
  };
  const pick = (v: string, set: (x: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)}>
      <option value="">—</option>
      {athletes.map((p) => <option key={p.id} value={p.id}>{p.name} {p.gender === 'M' ? '♂' : '♀'} ({currentAbility(p.attrs)})</option>)}
    </select>
  );
  return (
    <section className="card">
      <div className="controls">
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {countryOptions(data.world).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <table>
        <thead><tr><th>{t('discipline')}</th><th>{t('pairs')}</th><th>{t('chemistry')}</th><th></th></tr></thead>
        <tbody>{mine.map((p) => (
          <tr key={p.id}>
            <td>{p.discipline}</td><td>{p.playerIds.map((id) => byId.get(id)?.name).join(' / ')}</td>
            <td><Num o={p} k="chemistry" ch={ch} /></td>
            <td>{mode === 'pack' && <button onClick={() => { removeAt(data.pairs, p); ch(); }}>✕</button>}</td>
          </tr>
        ))}</tbody>
      </table>
      <h4>{t('formPair')}</h4>
      <div className="controls">
        <select value={d} onChange={(e) => setD(e.target.value as Pair['discipline'])}>{DOUBLES.map((x) => <option key={x}>{x}</option>)}</select>
        {pick(a, setA)}{pick(b, setB)}
        <button disabled={!a || !b} onClick={create}>{t('add')}</button>
        {msg && <small className="down">{msg}</small>}
      </div>
    </section>
  );
}

/** Unduh paket sebagai file JSON. */
export function downloadPack(pack: DataPack) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${pack.name.replace(/[^\w-]+/g, '_')}.json` });
  a.click();
  URL.revokeObjectURL(url);
}

/** Simpan tertunda: perubahan beruntun (mengetik) ditulis sekali setelah jeda. */
export function useDebounced(fn: () => void, ms = 600) {
  const timer = useRef<number>(undefined);
  return () => { clearTimeout(timer.current); timer.current = window.setTimeout(fn, ms); };
}

/** Menu utama → Editor data: daftar paket, salin, impor/ekspor, edit. */
export function PackManager({ onBack }: { onBack: () => void }) {
  const packs = useLiveQuery(listPacks, []);
  const [editing, setEditing] = useState<DataPack>();
  const [msg, setMsg] = useState('');
  const persist = useDebounced(() => editing && void writePack(editing));

  const copy = async (src: DataPack) => {
    const pack = structuredClone(src);
    if (!pack.players.length) {
      // Paket bawaan tidak berisi atlet: buat atlet fiktif agar bisa diedit satu per satu.
      const w = generateWorld(makeRng(Math.floor(Math.random() * 1e9)), pack.ruleset.generator, pack.world.countries, { year: pack.ruleset.startYear, week: 1 });
      Object.assign(pack, { players: w.players, pairs: w.pairs });
    }
    await writePack({ ...pack, id: crypto.randomUUID(), name: `${src.name} (${t('copy')})` });
  };
  const importFile = async (file: File) => {
    try {
      const pack = normalizePack(JSON.parse(await file.text()));
      const errors = validatePack(pack);
      await writePack({ ...pack, id: crypto.randomUUID(), name: pack.name || file.name });
      setMsg(errors.length ? `${t('importedWithProblems')} (${errors.length})` : t('imported'));
    } catch (e) {
      setMsg(`${t('importFailed')}: ${(e as Error).message}`);
    }
  };

  if (editing)
    return (
      <main>
        <h1>{t('editor')}: {editing.name}</h1>
        <Editor data={editing} mode="pack" date={{ year: editing.ruleset.startYear, week: 1 }} onChange={persist}
          toolbar={<>
            <button onClick={() => downloadPack(editing)}>{t('export')}</button>
            <button onClick={() => { void writePack(editing); setEditing(undefined); }}>{t('back')}</button>
          </>} />
      </main>
    );

  const row = (p: DataPack, own: boolean) => (
    <tr key={p.id}>
      <td><b>{p.name}</b></td>
      <td>{p.ruleset.name}</td>
      <td className="num">{p.players.length ? `${p.players.length} ${t('players')}` : t('fictionalPlayers')}</td>
      <td>{own && <button onClick={() => setEditing(structuredClone(p))}>{t('edit')}</button>}</td>
      <td><button onClick={() => copy(p)}>{t('copyToEdit')}</button></td>
      <td><button onClick={() => downloadPack(p)}>{t('export')}</button></td>
      <td>{own && <button onClick={() => confirm(t('confirmDelete')) && deletePack(p.id)}>{t('delete')}</button>}</td>
    </tr>
  );
  return (
    <main className="menu">
      <h1>{t('editor')}</h1>
      <p className="hint">{t('packHelp')}</p>
      <section className="card">
        <table><tbody>
          {PRESETS.map((rs) => row(presetPack(rs), false))}
          {packs?.map((p) => row(p, true))}
        </tbody></table>
      </section>
      <section className="card">
        <h3>{t('import')}</h3>
        <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        {msg && <p>{msg}</p>}
      </section>
      <button onClick={onBack}>{t('back')}</button>
    </main>
  );
}
