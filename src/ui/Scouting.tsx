import { useEffect, useMemo, useRef, useState } from 'react';
import { ageAt, currentAbility } from '../engine/generator';
import { autoPick, recruit, recruitSome, SCOUTING_DEADLINE_WEEK, scoutReport, similarPool, similarTo, starRangeAt, styleOf, suggestedEvent, type Scouting } from '../engine/scouting';
import { ATTRS, type Player } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { saveGame, useGame } from './game';
import { ScoutFocusSelect } from './Squad';
import { PlayerName } from './nav';


/** Pencarian bakat junior: daftar ringkas kandidat (centang untuk memilih), panel laporan pemandu untuk kandidat yang diketuk. */
export function ScoutingCard() {
  const { game, changed } = useGame();
  const { state } = game;
  const s = state.scouting!;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [shown, setShown] = useState<string>();
  const count = (g: 'M' | 'F') => s.candidates.filter((p) => p.gender === g && picked.includes(p.id)).length;
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const done = () => { recruit(state, picked); changed(); void saveGame(game); };
  const some = () => { recruitSome(state, picked); setPicked([]); setShown(undefined); changed(); void saveGame(game); };
  const week = state.date.year === s.year ? state.date.week : 1; // rentang potensi menyempit tiap minggu
  const half = (n: number) => `${Math.floor(n) || ''}${n % 1 ? '½' : ''}`; // 2.5 → "2½"
  const status = t(s.recruited ? 'scoutingStatusPartial' : 'scoutingStatus', { m: count('M'), f: count('F'), sm: s.slots.M, sf: s.slots.F, week: SCOUTING_DEADLINE_WEEK, n: s.recruited ?? 0 });
  const sel = s.candidates.find((p) => p.id === shown);
  return (
    <section className="card">
      <h3>{t('scouting')} {s.year}</h3>
      <p>{status}</p>
      {!open ? <button className="primary" onClick={() => setOpen(true)}>{t('scoutingOpen')}</button> : (
        // Dibuka sebagai pop-up lebar: kartu Dashboard terlalu sempit untuk daftar + panel kandidat.
        <div className="modal" role="dialog" aria-label={t('scouting')}><div className="live card scoutmodal">
          <button className="close" aria-label={t('close')} onClick={() => setOpen(false)}>✕</button>
          <h3>{t('scouting')} {s.year}</h3>
          <p>{status}</p>
          <p className="hint">{t('scoutingHint', { week: SCOUTING_DEADLINE_WEEK })}</p>
          {!!s.withdrawn?.length && <p className="hint">{t('scoutWithdrawn', { names: s.withdrawn.join(', ') })}</p>}
          <div className="split">
            <div>
              {(['M', 'F'] as const).filter((g) => s.candidates.some((p) => p.gender === g)).map((g) => (
                <div key={g} className="scroll">
                  <h4>{t(g === 'M' ? 'men' : 'women')} · {count(g)}</h4>
                  <table className="fit scoutlist">
                    <thead><tr><th></th><th>{t('name')}</th><th className="num">{t('age')}</th><th className="num">{t('ability')}</th><th>{t('potential')}</th><th>{t('scoutEvent')}</th></tr></thead>
                    <tbody>{s.candidates.filter((p) => p.gender === g).map((p) => {
                      const [lo, hi] = starRangeAt(s, p, week);
                      return (
                        <tr key={p.id} className={[picked.includes(p.id) && 'sel', shown === p.id && 'focus'].filter(Boolean).join(' ') || undefined} onClick={() => setShown(p.id)} style={{ cursor: 'pointer' }}>
                          <td onClick={(e) => { e.stopPropagation(); toggle(p.id); }}><input type="checkbox" checked={picked.includes(p.id)} readOnly aria-label={p.name} /></td>
                          <td>{s.gems?.includes(p.id) && <span className="gem" title={t('scoutGemHint')}>⭐ </span>}{p.name}</td>
                          <td className="num">{ageAt(p.birth, state.date)}</td>
                          <td className="num">{currentAbility(p.attrs)}</td>
                          <td className="stars">{half(lo)}–{half(hi)} ★</td>
                          <td><span className="chip">{suggestedEvent(p, s.types?.[p.id])}</span></td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              ))}
            </div>
            <aside className="sidepanel">
              {sel ? <ScoutPanel s={s} p={sel} /> : <p className="hint">{t('scoutPick')}</p>}
            </aside>
          </div>
          <p className="controls scout-actions">
            <button onClick={() => setPicked(autoPick(s, picked))}>{t('autoPick')}</button>
            <button disabled={!picked.length} onClick={some}>{t('scoutRecruitSome')} ({picked.length})</button>
            <button className="primary" disabled={!picked.length && !s.recruited} onClick={done}>{t('scoutFinish')}{picked.length ? ` (${picked.length})` : ''}</button>
          </p>
          <ScoutFocusSelect />
        </div></div>
      )}
    </section>
  );
}

/** Panel kandidat: identitas, permata & tipe, laporan pemandu, gaya mirip, catatan sifat, batang atribut. */
function ScoutPanel({ s, p }: { s: Scouting; p: Player }) {
  const { game, version } = useGame();
  const { state, ruleset } = game;
  const type = s.types?.[p.id];
  const d = suggestedEvent(p, type);
  const pool = useMemo(() => similarPool(state, ruleset, d, p.gender), [version, d, p.gender]); // version: ranking berubah tiap minggu
  const twin = similarTo(p, pool);
  const r = scoutReport(p);
  const city = p.hometown && dataName(game.world.cities.find((c) => c.id === p.hometown)?.name);
  // HP: panel ada di bawah daftar → gulir ke panel saat kandidat dipilih.
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (window.innerWidth < 900) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [p.id]);
  return (
    <>
      <h3 ref={ref}>{p.name}</h3>
      <p className="muted-text">{[city, `${ageAt(p.birth, state.date)} ${t('yearsShort')}`, ...styleOf(p).map((a) => t(a))].filter(Boolean).join(' · ')}</p>
      <p>{s.gems?.includes(p.id) && <span className="tag gold-tag" title={t('scoutGemHint')}>⭐ {t('scoutGem')}</span>} {type && <span className="tag">{t(`scoutType_${type}` as TextKey)}</span>} <span className="chip">{d}</span></p>
      <h4>{t('scoutReportTitle')}</h4>
      <p>“{t('scoutReportText', { a: t(r.strong[0]), b: t(r.strong[1]), w: t(r.weak) })}”</p>
      {twin && <p><span className="muted-text">{t('scoutLooksLike')}:</span> <b><PlayerName id={twin.id}>{twin.name}</PlayerName></b></p>}
      {!!s.notes?.[p.id]?.length && <p>{s.notes[p.id].map((n) => <span key={n} className="tag muted-tag" title={t(`traitHint_${n}` as TextKey)}>{t(`trait_${n}` as TextKey)}?</span>)}</p>}
      <div className="attrlist" role="list">
        {ATTRS.map((a) => (
          <div key={a} role="listitem" className="attrrow">
            <span className="name">{t(a)}</span><span className="meter"><span style={{ width: `${Math.round(p.attrs[a])}%` }} /></span><b className="val">{Math.round(p.attrs[a])}</b><span className="delta" />
          </div>
        ))}
      </div>
    </>
  );
}
