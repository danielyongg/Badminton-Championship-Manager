import { entryClosed, hostCityId, weekOf } from '../engine/season';
import { useEffect, useRef, useState } from 'react';
import type { RoundMatch, RoundShow } from '../engine/gate';
import { DISCIPLINES, type Discipline, type TeamFormat } from '../engine/types';
import { dataName, t } from '../i18n';
import { Flag } from './Flag';
import { EntryPanel, EntryTable, JuniorEntryTable } from './Entries';
import { EntryLists } from './EventViews';
import type { EntriesShow } from '../engine/tournament';
import { entrantLabel, eventName, saveGame, useGame, TierBadge } from './game';
import { formatName } from './Team';
import { MatchLink } from './MatchDetail';

// Alur minggu turnamen: pilih turnamen yang dimainkan → drawing → babak demi babak (laga negara sendiri live).

export interface WeekAsk { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[]; deadlines?: string[] }

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
  // Turnamen yang batas entrinya minggu ini: form entry lengkap (individu / junior / skuad beregu), kembali setelah submit.
  if (editing && ask.deadlines?.includes(editing)) return (
    <section className="card hub">
      <h3>{eventName(ruleset, editing, year)} · {t('week')} {weekOf([...ruleset.calendar, ...ruleset.team.events].find((e) => e.id === editing)!, year)}</h3>
      <EntryPanel id={editing} onSubmitted={() => setEditing(undefined)} onBack={() => setEditing(undefined)} />
    </section>
  );
  if (editing) return (
    <section className="card hub">
      <h3>{eventName(ruleset, editing, year)} · {t('entryStatus')}</h3>
      {(() => {
        const ev = ruleset.calendar.find((e) => e.id === editing);
        const submit = () => { (state.entriesSubmitted ??= {})[`${year}:${editing}`] = true; changed(); void saveGame(game); setEditing(undefined); };
        const junior = ev && ruleset.tiers.find((x) => x.id === ev.tierId)?.junior;
        const back = () => setEditing(undefined);
        return junior ? <JuniorEntryTable ev={ev} onSubmit={submit} onBack={back} /> : <EntryTable week={ask.week} eventId={editing} onSubmit={submit} onBack={back} />;
      })()}
    </section>
  );
  const deadlines = ask.deadlines ?? [];
  const allPlayed = ask.events.every((e) => ask.played.includes(e.id));
  const skip = (
    <div className="controls">
      <button onClick={() => onPick(null)}>{allPlayed ? t('continue') : ask.played.length ? t('skipRest') : t('skipAll')}</button>
    </div>
  );
  // Dua kotak terpisah: turnamen yang dimainkan minggu ini di atas, batas entry (submit) di bawah.
  return (
    <>
      {ask.events.length > 0 && <section className="card hub">
        <h3>{t('weekEvents')} · {t('week')} {ask.week}</h3>
        <ul className="weeklist">{ask.events.map(({ id, kind }) => {
          const ev = kind === 'team' ? ruleset.team.events.find((e) => e.id === id)! : ruleset.calendar.find((e) => e.id === id)!;
          const tier = 'tierId' in ev ? ruleset.tiers.find((x) => x.id === ev.tierId) : undefined;
          // Finals & Olimpiade: entry otomatis. Beregu: skuad dipilih di pop-up bila belum di-submit. Junior: diisi seperti senior.
          const auto = kind === 'team' || tier?.id === 'WTF' || tier?.id === 'OG';
          const submitted = state.entriesSubmitted?.[`${year}:${id}`];
          const closed = kind === 'individual' && entryClosed(state, ruleset, id); // daftar entry sudah terbit
          const done = ask.played.includes(id);
          return (
            <li key={id}>
              <TierBadge tierId={tier?.id} team={kind === 'team' ? ev : undefined} />
              <span className="grow"><b>{eventName(ruleset, id, year)}</b> <small className="muted-text">{city(hostCityId(ev, year))}</small><br />
                <small>{done ? <span className="badge good">✓ {t('played')}</span>
                  : kind === 'team' ? null : auto ? t('auto') : closed ? <span className="badge">🔒 {t('entryClosed')}</span> : submitted ? <span className="badge good">✓ {t('entrySubmitted')}</span>
                  : <span className="badge">{t('needEntry')}</span>}</small>
              </span>
              {!auto && !closed && !ask.played.length && <button onClick={() => setEditing(id)}>{t(submitted ? 'modifyEntries' : 'fillEntry')}</button>}
              <button className="primary" disabled={done || !(auto || submitted || closed)} onClick={() => onPick(id)}>{t('playEvent')}</button>
            </li>
          );
        })}</ul>
        {skip}
      </section>}
      {deadlines.length > 0 && <section className="card hub">
        <h3>⏰ {t('deadlineThisWeek')} · {t('week')} {ask.week}</h3>
        <p className="hint">{t('deadlineThisWeekHint')}</p>
        <ul className="weeklist">{deadlines.map((id) => {
          const team = ruleset.team.events.find((e) => e.id === id);
          const ev = team ?? ruleset.calendar.find((e) => e.id === id)!;
          const submitted = state.entriesSubmitted?.[`${year}:${id}`];
          return (
            <li key={id}>
              <TierBadge tierId={'tierId' in ev ? ev.tierId : undefined} team={team} />
              <span className="grow"><b>{eventName(ruleset, id, year)}</b> <small className="muted-text">{t('week')} {weekOf(ev, year)} · {city(hostCityId(ev, year))}</small><br />
                <small>{submitted ? <span className="badge good">✓ {t('entrySubmitted')}</span> : <span className="badge">{t('needEntry')}</span>}</small>
              </span>
              {/* Sudah di-submit: masih bisa diubah sampai batas entry (tombol sekunder). */}
              <button className={submitted ? undefined : 'primary'} onClick={() => setEditing(id)}>{t(submitted ? 'modifyEntries' : 'submitEntries')}</button>
            </li>
          );
        })}</ul>
        {!ask.events.length && skip}
      </section>}
      {!ask.events.length && !deadlines.length && <section className="card hub">{skip}</section>}
    </>
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
  const seedTag = (key: string, id: string) => { const n = seedOf(key, id); return n ? <> <small className="seed">[{n}]</small></> : null; }; // spasi di luar: unggulan boleh turun baris
  // Laga individu yang sudah selesai → catatan laga (detail & statistik lewat klik skor).
  const recordOf = (m: RoundMatch) => state.matches.find((x) => x.tournamentId === show.tournamentId && x.year === state.date.year
    && x.discipline === m.key && x.round === show.round && x.sides[0] === m.sides[0] && x.sides[1] === m.sides[1]);
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
  const roundName = show.round === 'G' ? t('roundG') : /^Q\d/.test(show.round) ? `${t('qualifying')} R${show.round.slice(1)}` : show.round;
  const title = `${eventName(ruleset, show.tournamentId, state.date.year)} · ${roundName}`;
  return (
    <section className="card hub" ref={box}>
        <h3>{title}</h3>
        {/* Individu: nomor selalu terlihat, juga saat babak hanya berisi satu nomor (mis. R64 hanya MS). */}
        {(keys.length > 1 || !team) && (
          <nav className="controls subnav">
            {keys.map((k) => (
              <button key={k} aria-pressed={k === tab} disabled={playing && k !== tab} onClick={() => setTab(k)}>
                {team ? formatName(k as TeamFormat, show.tournamentId) : k}{mineKeys.has(k) && <span className="mine"> ●</span>}
              </button>
            ))}
          </nav>
        )}
        {!done && mineRows.length > 0 && (
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
              : m.result.scores.map(([x, y], i) => <span key={i} className="game">{x}-{y}</span>); // satu game per baris
            const k = rowKey(m);
            const rec = score && !team ? recordOf(m) : undefined;
            return (
              <tr key={k} className={[mine && 'mine-row', m === current && 'current'].filter(Boolean).join(' ') || undefined}>
                <td className={w === 0 ? 'win' : undefined}><Flag id={sides[0].country} />{sides[0].name}{seedTag(m.key, m.sides[0])}</td>
                <td className="muted-text">vs</td>
                <td className={w === 1 ? 'win' : undefined}><Flag id={sides[1].country} />{sides[1].name}{seedTag(m.key, m.sides[1])}</td>
                <td className="num">{rec ? <MatchLink m={rec} name={(x) => label(x).name} title={eventName(ruleset, show.tournamentId, state.date.year)}>{score}</MatchLink> : score || (m === current ? '…'
                  : mine && !done && <button className="rowtoggle" title={t('rowToggleHint')} aria-label={t(skipped.has(k) ? 'rowSkip' : 'rowLive')} onClick={() => toggle(k)}>
                    {/* HP: ikon saja agar muat di kolom skor; teks di layar lebar. */}
                    {skipped.has(k) ? '⏭' : '▶'}<span className="hide-sm"> {t(skipped.has(k) ? 'rowSkip' : 'rowLive')}</span>
                  </button>)}</td>
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
