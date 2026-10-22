import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { deleteSave, exportSave, importSave, listPacks, listSaves, readSave } from '../db/saves';
import { presetPack, PRESETS, validatePack } from '../engine/pack';
import { WORLD } from '../engine/presets/world';
import { makeRng } from '../engine/rng';
import { newSeason } from '../engine/season';
import type { SaveMeta } from '../engine/types';
import { dataName, t } from '../i18n';
import { CareerShell } from './Career';
import { downloadJson, PackManager } from './Editor';
import { LangSelect } from './LangSelect';
import { ThemeSelect } from './ThemeSelect';
import { GameContext, gameFromBlob, saveGame, type Game } from './game';
import { Lab } from './Lab';


export function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [version, setVersion] = useState(0);
  const [screen, setScreen] = useState<'menu' | 'lab' | 'editor'>('menu');
  const [, setLangTick] = useState(0);
  const relang = () => setLangTick((x) => x + 1); // ganti bahasa → render ulang semua teks

  if (game)
    return (
      <GameContext.Provider value={{ game, version, changed: () => setVersion((v) => v + 1) }}>
        <CareerShell onQuit={() => setGame(null)} onLang={relang} />
      </GameContext.Provider>
    );
  if (screen === 'lab') return <Lab onBack={() => setScreen('menu')} />;
  if (screen === 'editor') return <PackManager onBack={() => setScreen('menu')} />;
  return <MainMenu onStart={setGame} onLab={() => setScreen('lab')} onEditor={() => setScreen('editor')} onLang={relang} />;
}

function MainMenu({ onStart, onLab, onEditor, onLang }: { onStart: (g: Game) => void; onLab: () => void; onEditor: () => void; onLang: () => void }) {
  const saves = useLiveQuery(listSaves, []);
  const [name, setName] = useState('Karier 1');
  const [countryId, setCountryId] = useState('INA');
  const custom = useLiveQuery(listPacks, []);
  const packs = [...PRESETS.map(presetPack), ...(custom ?? [])];
  const [packId, setPackId] = useState(packs[0].id);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const start = async () => {
    const errors = validatePack(pack);
    if (errors.length) return alert(`${t('packInvalid')}\n${errors.slice(0, 10).join('\n')}`);
    setBusy(true);
    const ruleset = structuredClone(pack.ruleset);
    const world = structuredClone(pack.world);
    const date = { year: ruleset.startYear, week: 1 };
    const country = countryId && world.countries.some((c) => c.id === countryId) ? countryId : null;
    const state = newSeason(world, ruleset, seed, date, country, pack.players.length ? pack : undefined);
    const now = Date.now();
    const meta: SaveMeta = { id: crypto.randomUUID(), name, countryId: country, rulesetName: ruleset.name, date, createdAt: now, updatedAt: now };
    const game: Game = { meta, state, ruleset, world, rng: makeRng(seed ^ 0x5bd1e995) };
    await saveGame(game);
    onStart(game);
  };

  const load = async (meta: SaveMeta) => {
    const blob = await readSave(meta.id);
    if (blob) onStart(gameFromBlob(meta, blob));
  };

  const exportFile = async (meta: SaveMeta) => {
    const f = await exportSave(meta);
    if (f) downloadJson(`${meta.name} ${meta.date.year}-${meta.date.week}`, f);
  };
  const importFile = async (file: File) => {
    try {
      const meta = await importSave(JSON.parse(await file.text()));
      setMsg(`${t('imported')} (${meta.name})`);
    } catch (e) {
      setMsg(`${t('importFailed')}: ${(e as Error).message}`);
    }
  };

  const countryName = (id: string | null) => (id ? dataName(WORLD.countries.find((c) => c.id === id)?.name) ?? id : t('observer'));

  return (
    <main className="menu">
      <h1>{t('appTitle')}</h1>
      <div className="controls"><LangSelect onChange={onLang} /><ThemeSelect /></div>
      <section className="card">
        <h2>{t('newGame')}</h2>
        <div className="controls newgame">
          <label>{t('saveName')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>{t('country')}
            <select value={countryId} onChange={(e) => setCountryId(e.target.value)}>
              {pack.world.countries.map((c) => <option key={c.id} value={c.id}>{dataName(c.name)}</option>)}
              <option value="">{t('observer')}</option>
            </select>
          </label>
          <label>{t('data')}
            <select value={pack.id} onChange={(e) => setPackId(e.target.value)}>
              {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>{t('seed')}<input type="number" inputMode="numeric" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
          <button className="primary" disabled={busy || !name.trim()} onClick={start}>{busy ? '…' : t('start')}</button>
        </div>
      </section>
      <section className="card">
        <h2>{t('loadGame')}</h2>
        {!saves?.length ? <p>{t('noSaves')}</p> : (
          <table>
            <tbody>{saves.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b><br /><small>{s.date.year} · {t('week')} {s.date.week}</small></td>
                <td className="hide-sm">{countryName(s.countryId)}</td>
                <td className="hide-sm">{s.rulesetName}</td>
                <td><button onClick={() => load(s)}>{t('load')}</button></td>
                <td><button onClick={() => exportFile(s)}>{t('exportSave')}</button></td>
                <td><button className="btn-danger" onClick={() => confirm(t('confirmDelete')) && deleteSave(s.id)}>{t('delete')}</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p className="hint">{t('saveFileHelp')}</p>
        <label>{t('importSave')}{' '}
          <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </label>
        {msg && <p>{msg}</p>}
      </section>
      <p><button onClick={onEditor}>{t('openEditor')}</button></p>
      <p><button onClick={onLab}>{t('openLab')}</button></p>
    </main>
  );
}
