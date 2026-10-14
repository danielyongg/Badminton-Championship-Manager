import { useEffect, useRef, useState } from 'react';
import type { RoundMatch, RoundShow } from '../engine/gate';
import { DISCIPLINES, type Discipline, type TeamFormat } from '../engine/types';
import { dataName, t } from '../i18n';
import { Flag } from './Flag';
import { EntryTable } from './Entries';
import { entrantLabel, eventName, saveGame, useGame } from './game';
import { formatName } from './Team';

// Alur minggu turnamen: pilih turnamen yang dimainkan → drawing → babak demi babak (laga negara sendiri live).

export interface WeekAsk { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[] }

/**
 * Daftar turnamen minggu ini: Mainkan satu per satu, atau lewati sisanya (disimulasikan otomatis).
 * Sebelum turnamen pertama dimulai, entry tiap turnamen individu masih bisa diisi & di-submit di sini.
 */
export function WeekScreen({ ask, onPick }: { ask: WeekAsk; onPick: (id: string | null) => void }) {
  const { game, changed } = useGame();
  const { state, ruleset, world } = game;
  const { year } = state.date;
  const [editing, setEditing] = useState<string>();
  const city = (id: string) => dataName(world.cities.find((c) => c.id === id)?.name);
  if (editing) return (
    <div className="modal" role="dialog" aria-label={t('weekEvents')}>
      <div className="live card">
        <button className="close" aria-label={t('back')} title={t('back')} onClick={() => setEditing(undefined)}>✕</button>
        <h3>{eventName(ruleset, editing, year)} · {t('entryStatus')}</h3>
        <EntryTable week={ask.week} eventId={editing} />
        <div className="controls roundbar">
          <button className="primary" onClick={() => { (state.entriesSubmitted ??= {})[`${year}:${editing}`] = true; changed(); void saveGame(game); setEditing(undefined); }}>{t('submitEntries')}</button>
          <button onClick={() => setEditing(undefined)}>← {t('back')}</button>
        </div>
      </div>
    </div>
  );
  return (
    <div className="modal" role="dialog" aria-label={t('weekEvents')}>
      <div className="live card">
        <h3>{t('weekEvents')} · {t('week')} {ask.week}</h3>
        <ul className="weeklist">{ask.events.map(({ id, kind }) => {
          const ev = kind === 'team' ? ruleset.team.events.find((e) => e.id === id)! : ruleset.calendar.find((e) => e.id === id)!;
          const tier = 'tierId' in ev ? ruleset.tiers.find((x) => x.id === ev.tierId) : undefined;
          // Junior & Finals: entry otomatis. Beregu: skuad dipilih di pop-up bila belum di-submit.
          const auto = kind === 'team' || tier?.junior || tier?.id === 'WTF';
          const submitted = state.entriesSubmitted?.[`${year}:${id}`];
          const done = ask.played.includes(id);
          return (
            <li key={id}>
              <span className="chip">{kind === 'team' ? t('teamShort') : tier?.junior ? t('juniorShort') : tier?.id}</span>
              <span className="grow"><b>{eventName(ruleset, id, year)}</b> <small className="muted-text">{city(ev.cityId)}</small><br />
                <small>{done ? <span className="badge good">✓ {t('played')}</span>
                  : kind === 'team' ? null : auto ? t('auto') : submitted ? <span className="badge good">✓ {t('entrySubmitted')}</span>
                  : <span className="badge">{t('needEntry')}</span>}</small>
              </span>
              {!auto && !ask.played.length && <button onClick={() => setEditing(id)}>{t('fillEntry')}</button>}
              <button className="primary" disabled={done || !(auto || submitted)} onClick={() => onPick(id)}>{t('playEvent')}</button>
            </li>
          );
        })}</ul>
        <div className="controls">
          <button onClick={() => onPick(null)}>{ask.played.length ? t('skipRest') : t('skipAll')}</button>
        </div>
      </div>
    </div>
  );
}

/** Satu babak turnamen yang dimainkan: tab per nomor, laga (pasangan laga → skor). */
/** Kunci baris laga (untuk pilihan Live/Skip per laga). */
export const rowKey = (m: RoundMatch) => `${m.key}:${m.sides.join('-')}`;

/**
 * Layar babak: laga dimainkan satu per satu (baris giliran disorot). Laga atlet sendiri tampil Live,
 * kecuali barisnya di-Skip. `tab`: tab terakhir yang dipilih (disimpan pemanggil antar babak).
 * `skipped`: kunci baris yang di-Skip (diubah langsung; pemanggil membacanya saat giliran laga itu).
 */
export function RoundScreen({ show, tab: lastTab, onTab, skipped, onNext, onSkipRest, onSkipEvent }: {
  show: RoundShow; tab?: string; onTab: (k: string) => void; skipped: Set<string>; onNext: () => void; onSkipRest: () => void; onSkipEvent: () => void;
}) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId;
  const team = !DISCIPLINES.includes(show.matches[0]?.key as Discipline); // kunci beregu = format
  const label = (id: string) => team
    ? { name: dataName(world.countries.find((c) => c.id === id)?.name) ?? id, country: id }
    : entrantLabel(state, id);
  const keys = [...new Set(show.matches.map((m) => m.key))];
  const isMine = (id: string) => label(id).country === managed;
  const mineKeys = new Set(show.matches.filter((m) => m.sides.some(isMine)).map((m) => m.key));
  const [picked, pick] = useState(lastTab);
  const setTab = (k: string) => { pick(k); onTab(k); };
  const [, render] = useState(0);
  const toggle = (k: string) => { if (!skipped.delete(k)) skipped.add(k); render((x) => x + 1); };
  const playing = show.phase === 'playing';
  const current = playing ? show.matches[show.current!] : undefined;
  // Saat dimainkan, tab mengikuti laga yang sedang giliran; selain itu tab terakhir / nomor pertama berisi atlet sendiri.
  const tab = current?.key ?? (picked && keys.includes(picked) ? picked : keys.find((k) => mineKeys.has(k)) ?? keys[0]);
  const done = show.phase === 'done';
  const final = show.round === 'F';
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector('tr.current')?.scrollIntoView({ block: 'nearest' }); }, [show.current]);
  // ✕: pop-up disembunyikan (turnamen dijeda di layar ini) agar tab lain bisa dibuka; bilah bawah untuk kembali.
  const [hidden, setHidden] = useState(false);
  const title = `${eventName(ruleset, show.tournamentId, state.date.year)} · ${show.round === 'G' ? t('roundG') : show.round}`;
  if (hidden)
    return (
      <div className="livebar card">
        🏸 <b>{title}</b>
        <button onClick={() => setHidden(false)}>{t('openRound')}</button>
        <button onClick={onSkipEvent}>{t('simEvent')}</button>
      </div>
    );
  return (
    <div className="modal" role="dialog" aria-label={t('weekEvents')} ref={box} onClick={(e) => e.target === e.currentTarget && setHidden(true)}>
      <div className="live card">
        <button className="close" title={t('hideRound')} aria-label={t('hideRound')} onClick={() => setHidden(true)}>✕</button>
        <h3>{title}</h3>
        {keys.length > 1 && (
          <nav className="controls subnav">
            {keys.map((k) => (
              <button key={k} aria-pressed={k === tab} disabled={playing && k !== tab} onClick={() => setTab(k)}>
                {team ? formatName(k as TeamFormat) : k}{mineKeys.has(k) && <span className="mine"> ●</span>}
              </button>
            ))}
          </nav>
        )}
        <table className="roundlist">
          <colgroup><col className="side" /><col className="vs" /><col className="side" /><col className="score" /></colgroup>
          <tbody>{show.matches.filter((m) => m.key === tab).map((m) => {
            const sides = m.sides.map(label);
            const mine = m.sides.some(isMine);
            const w = m.result?.winner;
            // Beregu: jumlah partai dimenangkan; individu: skor per game.
            const score = !m.result ? '' : team
              ? `${m.result.scores.filter(([x, y]) => x > y).length}–${m.result.scores.filter(([x, y]) => x < y).length}`
              : m.result.scores.map(([x, y]) => `${x}-${y}`).join(' ');
            const k = rowKey(m);
            return (
              <tr key={k} className={[mine && 'mine-row', m === current && 'current'].filter(Boolean).join(' ') || undefined}>
                <td className={w === 0 ? 'win' : undefined}><Flag id={sides[0].country} />{sides[0].name}</td>
                <td className="muted-text">vs</td>
                <td className={w === 1 ? 'win' : undefined}><Flag id={sides[1].country} />{sides[1].name}</td>
                <td className="num">{score || (m === current ? '…'
                  : mine && !done && <button className="rowtoggle" title={t('rowToggleHint')} onClick={() => toggle(k)}>{skipped.has(k) ? `⏭ ${t('rowSkip')}` : `▶ ${t('rowLive')}`}</button>)}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {done && final && show.matches.filter((m) => m.key === tab).map((m, i) => (
          <p key={i}>🏆 {t('champion')}: <b>{label(m.sides[m.result!.winner]).name}</b></p>
        ))}
        <div className="controls roundbar">
          {playing
            ? <button onClick={onSkipRest}>{t('simRound')}</button>
            : <button className="primary" onClick={onNext}>{!done ? t('playRound') : final ? t('doneEvent') : t('nextRound')}</button>}
          {!(done && final) && <button onClick={onSkipEvent}>{t('simEvent')}</button>}
        </div>
      </div>
    </div>
  );
}
