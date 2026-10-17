import { hostCityId } from '../engine/season';
import { useEffect, useRef, useState } from 'react';
import type { RoundMatch, RoundShow } from '../engine/gate';
import { DISCIPLINES, type Discipline, type TeamFormat } from '../engine/types';
import { dataName, t } from '../i18n';
import { Flag } from './Flag';
import { EntryTable } from './Entries';
import { EntryLists } from './EventViews';
import type { EntriesShow } from '../engine/tournament';
import { entrantLabel, eventName, saveGame, teamLabel, tierLabel, useGame } from './game';
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
    <section className="card hub">
      <h3>{eventName(ruleset, editing, year)} · {t('entryStatus')}</h3>
      <EntryTable week={ask.week} eventId={editing} />
      <div className="controls roundbar">
        <button className="primary" onClick={() => { (state.entriesSubmitted ??= {})[`${year}:${editing}`] = true; changed(); void saveGame(game); setEditing(undefined); }}>{t('submitEntries')}</button>
        <button onClick={() => setEditing(undefined)}>← {t('back')}</button>
      </div>
    </section>
  );
  return (
    <section className="card hub">
        <h3>{t('weekEvents')} · {t('week')} {ask.week}</h3>
        <ul className="weeklist">{ask.events.map(({ id, kind }) => {
          const ev = kind === 'team' ? ruleset.team.events.find((e) => e.id === id)! : ruleset.calendar.find((e) => e.id === id)!;
          const tier = 'tierId' in ev ? ruleset.tiers.find((x) => x.id === ev.tierId) : undefined;
          // Junior & Finals: entry otomatis. Beregu: skuad dipilih di pop-up bila belum di-submit.
          const auto = kind === 'team' || tier?.junior || tier?.id === 'WTF' || tier?.id === 'OG';
          const submitted = state.entriesSubmitted?.[`${year}:${id}`];
          const done = ask.played.includes(id);
          return (
            <li key={id}>
              <span className="chip">{kind === 'team' ? teamLabel(ev as { countries?: string[] }) : tier?.junior ? t('juniorShort') : tier && tierLabel(tier.id)}</span>
              <span className="grow"><b>{eventName(ruleset, id, year)}</b> <small className="muted-text">{city(hostCityId(ev, year))}</small><br />
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
    </section>
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
  // Nomor unggulan di turnamen ini (dari hasil undian nomor itu); beregu tanpa unggulan.
  const seedOf = (key: string, id: string) => state.eventRecords
    .find((r) => r.tournamentId === show.tournamentId && r.year === state.date.year && r.discipline === key)?.slots.find((x) => x.entrant === id)?.seed;
  const seedTag = (key: string, id: string) => { const n = seedOf(key, id); return n ? <small className="seed"> [{n}]</small> : null; };
  const isMine = (id: string) => label(id).country === managed;
  const mineKeys = new Set(show.matches.filter((m) => m.sides.some(isMine)).map((m) => m.key));
  const [picked, pick] = useState(lastTab);
  const setTab = (k: string) => { pick(k); onTab(k); };
  const [, render] = useState(0);
  const toggle = (k: string) => { if (!skipped.delete(k)) skipped.add(k); render((x) => x + 1); };
  // Semua laga atlet sendiri di babak ini (semua nomor) sekaligus: Live atau Skip.
  const mineRows = show.matches.filter((m) => m.sides.some(isMine) && !m.result).map(rowKey);
  const setAll = (skip: boolean) => { for (const k of mineRows) if (skip) skipped.add(k); else skipped.delete(k); render((x) => x + 1); };
  const playing = show.phase === 'playing';
  const current = playing ? show.matches[show.current!] : undefined;
  // Saat dimainkan, tab mengikuti laga yang sedang giliran; selain itu tab terakhir / nomor pertama berisi atlet sendiri.
  const tab = current?.key ?? (picked && keys.includes(picked) ? picked : keys.find((k) => mineKeys.has(k)) ?? keys[0]);
  const done = show.phase === 'done';
  const final = show.round === 'F';
  const box = useRef<HTMLElement>(null);
  useEffect(() => { box.current?.querySelector('tr.current')?.scrollIntoView({ block: 'nearest' }); }, [show.current]);
  const roundName = show.round === 'G' ? t('roundG') : show.round.startsWith('Q') ? `${t('qualifying')} R${show.round.slice(1)}` : show.round;
  const title = `${eventName(ruleset, show.tournamentId, state.date.year)} · ${roundName}`;
  return (
    <section className="card hub" ref={box}>
        <h3>{title}</h3>
        {keys.length > 1 && (
          <nav className="controls subnav">
            {keys.map((k) => (
              <button key={k} aria-pressed={k === tab} disabled={playing && k !== tab} onClick={() => setTab(k)}>
                {team ? formatName(k as TeamFormat, show.tournamentId) : k}{mineKeys.has(k) && <span className="mine"> ●</span>}
              </button>
            ))}
          </nav>
        )}
        {!done && mineRows.length > 1 && (
          <div className="drawctl">
            <span className="seg">
              <button aria-pressed={mineRows.every((k) => !skipped.has(k))} onClick={() => setAll(false)}>▶ {t('liveAll')}</button>
              <button aria-pressed={mineRows.every((k) => skipped.has(k))} onClick={() => setAll(true)}>⏭ {t('skipAllRows')}</button>
            </span>
          </div>
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
                <td className={w === 0 ? 'win' : undefined}><Flag id={sides[0].country} />{sides[0].name}{seedTag(m.key, m.sides[0])}</td>
                <td className="muted-text">vs</td>
                <td className={w === 1 ? 'win' : undefined}><Flag id={sides[1].country} />{sides[1].name}{seedTag(m.key, m.sides[1])}</td>
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
    </section>
  );
}

/** Daftar entry semua nomor turnamen (tab per nomor), sebelum undian dimulai. */
export function EntriesScreen({ show, onDraw, onSkipDraw }: { show: EntriesShow; onDraw: () => void; onSkipDraw: () => void }) {
  const { game } = useGame();
  const { state, ruleset } = game;
  const managed = state.career?.countryId;
  const [d, setD] = useState(show.lists[0]?.discipline);
  const list = show.lists.find((x) => x.discipline === d);
  const label = (id: string) => { const l = entrantLabel(state, id); return `${l.name} (${l.country})`; };
  const mine = (id: string) => entrantLabel(state, id).country === managed;
  return (
    <section className="card hub">
      <h3>{eventName(ruleset, show.tournamentId, state.date.year)} · {t('entryList')}</h3>
      <nav className="controls subnav">
        {show.lists.map((x) => (
          <button key={x.discipline} aria-pressed={x.discipline === d} onClick={() => setD(x.discipline)}>
            {x.discipline}{[...x.entry.main, ...x.entry.wildcards, ...x.entry.qualifying].some((c) => c.countryId === managed) && <span className="mine"> ●</span>}
          </button>
        ))}
      </nav>
      {list && <EntryLists key={d} entry={list.entry} name={label} mine={mine} />}
      <div className="controls roundbar">
        <button className="primary" onClick={onDraw}>{t('startDraw')} →</button>
        <button onClick={onSkipDraw}>{t('draw_skipEvent')}</button>
      </div>
    </section>
  );
}
