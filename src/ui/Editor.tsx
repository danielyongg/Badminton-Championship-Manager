import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deletePack, listPacks, writePack } from '../db/saves';
import { formPair } from '../engine/career';
import { ageAt, currentAbility, generateWorld } from '../engine/generator';
import { normalizePack, presetPack, PRESETS, validatePack, type DataPack } from '../engine/pack';
import { makeRng } from '../engine/rng';
import { conflicts, rollTraits, TRAITS, type TraitId } from '../engine/traits';
import { ATTRS, type GameDate, type Pair, type Player, type Ruleset, type World } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { Calendar, Countries, Cities, RulesetForm, Tiers } from './EditorData';

// Editor data: dipakai untuk paket data (dari menu utama) dan untuk save yang sedang berjalan (tab Editor).
// Komponen mengubah objek data di tempat lalu memanggil `ch()`; pemilik data yang menyimpan.

export interface EditData { ruleset: Ruleset; world: World; players: Player[]; pairs: Pair[] }
/** 'save' = save berjalan: tidak ada penghapusan, negara/gender atlet tidak bisa diubah (riwayat tetap utuh). */
export type EditMode = 'pack' | 'save';
/** `canDelete` / `onDelete` (save berjalan): atlet tanpa riwayat boleh dihapus; pemilik data membersihkan referensinya. */
export interface SectionProps {
  data: EditData; mode: EditMode; date: GameDate; ch: () => void; country?: string;
  canDelete?: (p: Player) => boolean; onDelete?: (p: Player, pairIds: string[]) => void;
}

type Obj = Record<string | number, unknown>;
type Cell = { o: object; k: string | number; ch: () => void; w?: number; disabled?: boolean };

/** `round`: tampilkan bilangan bulat (atribut bisa berupa pecahan hasil perkembangan). */
export function Num({ o, k, ch, w = 70, disabled, round }: Cell & { round?: boolean }) {
  const v = (o as Obj)[k] as number;
  return <input type="number" style={{ width: w || '100%' }} disabled={disabled} value={round ? Math.round(v) : v}
    onChange={(e) => { const v = e.target.valueAsNumber; if (!Number.isNaN(v)) { (o as Obj)[k] = v; ch(); } }} />;
}
export function Txt({ o, k, ch, w = 160, disabled }: Cell) {
  return <input style={{ width: w || '100%' }} disabled={disabled} value={(o as Obj)[k] as string} onChange={(e) => { (o as Obj)[k] = e.target.value; ch(); }} />;
}
export function Sel({ o, k, ch, options, disabled }: Cell & { options: [string, string][] }) {
  return (
    <select disabled={disabled} value={String((o as Obj)[k] ?? '')} onChange={(e) => { (o as Obj)[k] = e.target.value || undefined; ch(); }}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}
/** Satu dari dua slot sifat atlet (traits.ts). Belum diatur = hasil acak bawaan ditampilkan apa adanya; pasangan bertentangan tidak bisa dipilih. */
function TraitSel({ p, i, ch }: { p: Player; i: number; ch: () => void }) {
  const cur = p.traits ?? rollTraits(p.id);
  const other = cur[1 - i];
  const set = (v: string) => {
    const next = [...cur];
    if (v) next[i] = v as TraitId; else next.splice(i, 1);
    p.traits = next.filter(Boolean);
    ch();
  };
  return (
    <select value={cur[i] ?? ''} onChange={(e) => set(e.target.value)}>
      <option value="">—</option>
      {TRAITS.filter((x) => x !== other && !(other && conflicts(x, other))).map((x) => <option key={x} value={x}>{t(`trait_${x}` as TextKey)}</option>)}
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

export function Editor({ data, mode, date, onChange, toolbar, country, canDelete, onDelete }: {
  data: EditData; mode: EditMode; date: GameDate; onChange: () => void; toolbar?: ReactNode; country?: string;
} & Pick<SectionProps, 'canDelete' | 'onDelete'>) {
  const [section, setSection] = useState<Section>('players');
  const [, bump] = useState(0);
  const ch = () => { bump((x) => x + 1); onChange(); };
  const errors = validatePack(data);
  const props = { data, mode, date, ch, country, canDelete, onDelete };
  return (
    <>
      {/* Kepala: bagian sebagai sub-tab, status validasi + catatan + tombol (ekspor / kembali) dalam satu baris. */}
      <nav className="controls subnav">
        {SECTIONS.map((s) => <button key={s} aria-pressed={section === s} onClick={() => setSection(s)}>{t(`ed_${s}` as TextKey)}</button>)}
      </nav>
      <div className="ed-status">
        <span className={`badge ${errors.length ? 'danger' : 'good'}`}>{errors.length ? `${errors.length} ${t('problems')}` : `✓ ${t('dataValid')}`}</span>
        {mode === 'save' && <small className="hint">{t('editorSaveNote')}</small>}
        {toolbar && <span className="ed-toolbar">{toolbar}</span>}
      </div>
      {errors.length > 0 && <ul className="hint ed-errors">{errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}</ul>}
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

// Pilihan: nama data mengikuti bahasa tampilan (isian nama di tabel Negara/Kota tetap nama asli data).
const countryOptions = (w: World): [string, string][] => w.countries.map((c) => [c.id, `${c.id} — ${dataName(c.name)}`]);

function Players({ data, mode, date, ch, country: initial, canDelete, onDelete }: SectionProps) {
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
    const pairs = data.pairs.filter((pr) => pr.playerIds.includes(x.id));
    for (const pair of pairs) removeAt(data.pairs, pair);
    removeAt(data.players, x);
    onDelete?.(x, pairs.map((pr) => pr.id));
    setSel(undefined);
    ch();
  };
  const locked = mode === 'save';

  // HP: form atlet tampil di atas daftar & digulir ke atas saat atlet dipilih.
  const detail = useRef<HTMLElement>(null);
  useEffect(() => { if (sel && window.innerWidth < 900) detail.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [sel]);

  return (
    <div className={`ed-split${p ? ' has-sel' : ''}`}>
      <section className="card ed-list">
        <div className="ed-tools">
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {countryOptions(data.world).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="seg">
            <button onClick={() => add('M')}>+ {t('men')}</button>
            <button onClick={() => add('F')}>+ {t('women')}</button>
          </span>
        </div>
        {list.length === 0 ? <p className="hint">{mode === 'pack' ? t('noPlayersPack') : '—'}</p> : (
          <div className="scroll ed-scroll">
            <table className="edtable">
              <thead><tr><th>{t('name')}</th><th className="num">{t('age')}</th><th className="num">{t('ability')}</th><th className="num">PA</th></tr></thead>
              <tbody>{list.slice(0, 200).map((x) => (
                <tr key={x.id} className={x.id === sel ? 'sel' : ''} onClick={() => setSel(x.id)}>
                  <td className="ed-pname"><span className="ed-pn"><span>{x.name}</span><span className="chip">{x.gender}</span></span></td><td className="num">{ageAt(x.birth, date)}</td>
                  <td className="num"><b>{currentAbility(x.attrs)}</b></td><td className="num muted-text">{x.pa}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {p && (
        <section className="card ed-detail" ref={detail}>
          <div className="ed-detail-head">
            <h3>{p.name} <small className="muted-text">{p.id}</small></h3>
            <button className="close" aria-label={t('close')} title={t('close')} onClick={() => setSel(undefined)}>✕</button>
          </div>
          <div className="ed-form">
            <label className="wide">{t('name')}<Txt o={p} k="name" ch={ch} w={0} /></label>
            <label>{t('country')}<Sel o={p} k="countryId" ch={ch} options={countryOptions(data.world)} disabled={locked} /></label>
            <label>{t('gender')}<Sel o={p} k="gender" ch={ch} options={[['M', t('men')], ['F', t('women')]]} disabled={locked} /></label>
            <label>{t('hand')}<Sel o={p} k="hand" ch={ch} options={[['R', t('handR')], ['L', t('handL')]]} /></label>
            <label>{t('born')}<Num o={p.birth} k="year" ch={ch} w={0} /></label>
            <label title={t('birthWeekHint')}>{t('birthWeek')}<Num o={p.birth} k="week" ch={ch} w={0} /></label>
            <label>{t('potential')} (PA)<Num o={p} k="pa" ch={ch} w={0} /></label>
            <label>{t('trait')}<Sel o={p} k="trait" ch={ch} options={[['', '—'], ['late', t('traitLate')], ['stagnant', t('traitStagnant')]]} /></label>
            {[0, 1].map((i) => <label key={i} title={t('traitHint')}>{t('traits')} {i + 1}<TraitSel p={p} i={i} ch={ch} /></label>)}
          </div>
          <h4>{t('attributes')} · {t('ability')} <b className="ed-ab">{currentAbility(p.attrs)}</b></h4>
          <div className="ed-form attrs">
            {ATTRS.map((a) => <label key={a}>{t(a)}<Num o={p.attrs} k={a} ch={ch} w={0} round /></label>)}
          </div>
          {/* Save berjalan: hanya atlet tanpa riwayat (belum pernah main) yang bisa dihapus. */}
          {(!locked || canDelete?.(p)) ? <p className="controls ed-actions"><button className="danger" onClick={() => remove(p)}>{t('delete')}</button></p>
            : <p className="hint ed-actions">{t('cannotDeleteHistory')}</p>}
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
      {athletes.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.gender}, {currentAbility(p.attrs)})</option>)}
    </select>
  );
  return (
    <section className="card">
      <div className="ed-tools">
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {countryOptions(data.world).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <span className="count muted-text">{t('countPairs', { n: mine.length })}</span>
      </div>
      <div className="scroll">
        <table className="edtable">
          <thead><tr><th>{t('pairs')}</th><th className="num">{t('chemistry')}</th><th></th></tr></thead>
          <tbody>{mine.map((p) => (
            <tr key={p.id}>
              <td><div className="ed-names"><div>{p.playerIds.map((id) => <span key={id}>{byId.get(id)?.name}</span>)}</div><span className="chip">{p.discipline}</span></div></td>
              <td className="num"><Num o={p} k="chemistry" ch={ch} w={64} round /></td>
              <td className="num">{mode === 'pack' && <button className="mini" aria-label={t('delete')} onClick={() => { removeAt(data.pairs, p); ch(); }}>✕</button>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <h4>{t('formPair')}</h4>
      <div className="ed-form">
        <label>{t('discipline')}<select value={d} onChange={(e) => setD(e.target.value as Pair['discipline'])}>{DOUBLES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="wide">{t('athlete')} 1{pick(a, setA)}</label>
        <label className="wide">{t('athlete')} 2{pick(b, setB)}</label>
      </div>
      <p className="controls ed-actions">
        <button className="primary" disabled={!a || !b} onClick={create}>{t('add')}</button>
        {msg && <small className="down">{msg}</small>}
      </p>
    </section>
  );
}

/** Unduh paket sebagai file JSON. */
export const downloadPack = (pack: DataPack) => downloadJson(pack.name, pack, 1);

/** Unduh data sebagai file JSON. Di HP pakai lembar Bagikan bila ada (web app iOS tak bisa mengunduh biasa). */
export function downloadJson(name: string, data: unknown, indent?: number) {
  const file = new File([JSON.stringify(data, null, indent)], `${name.replace(/[^\w-]+/g, '_')}.json`, { type: 'application/json' });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => { /* dibatalkan */ });
    return;
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
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
