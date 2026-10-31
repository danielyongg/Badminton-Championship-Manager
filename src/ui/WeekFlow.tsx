import { entryClosed, hostCityId, liveTeamResults, weekOf, type TeamTie } from '../engine/season';
import { useEffect, useRef, useState } from 'react';
import { roundOrder, type RoundMatch, type RoundShow } from '../engine/gate';
import type { MatchRound } from '../engine/knockout';
import { DISCIPLINES, type Discipline, type TeamFormat } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { Flag } from './Flag';
import { EntryPanel, EntryTable, JuniorEntryTable } from './Entries';
import { endTag, EntryLists } from './EventViews';
import type { EntriesShow } from '../engine/tournament';
import { entrantLabel, eventName, saveGame, useGame, TierBadge } from './game';
import { formatName, TieDetail } from './Team';
import { MatchLink } from './MatchDetail';
import { PlayerName } from './nav';

// Alur minggu turnamen: pilih turnamen yang dimainkan → drawing → babak demi babak (laga negara sendiri live).

export interface WeekAsk { week: number; events: { id: string; kind: 'individual' | 'team' }[]; played: string[]; deadlines?: string[] }

/**
 * Daftar turnamen minggu ini: Mainkan satu per satu, atau lewati sisanya (disimulasikan otomatis).
 * Sebelum turnamen pertama dimulai, entry tiap turnamen individu masih bisa diisi & di-submit di sini.
 */
/** `onOpenEvent`: klik nama turnamen → halaman detail (peserta, undian, bagan). */
export function WeekScreen({ ask, onPick, onOpenEvent }: { ask: WeekAsk; onPick: (id: string | null) => void; onOpenEvent?: (id: string) => void }) {
  const { game, changed } = useGame();
  const { state, ruleset, world } = game;
  const { year } = state.date;
  const [editing, setEditing] = useState<string>();
  const city = (id: string) => dataName(world.cities.find((c) => c.id === id)?.name);
  const evLink = (id: string) => onOpenEvent
    ? <a href="#" title={t('tournamentDetails')} onClick={(e) => { e.preventDefault(); onOpenEvent(id); }}><b>{eventName(ruleset, id, year)}</b></a>
    : <b>{eventName(ruleset, id, year)}</b>;
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
              <span className="grow">{evLink(id)} <small className="muted-text">{city(hostCityId(ev, year))}</small><br />
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
              <span className="grow">{evLink(id)} <small className="muted-text">{t('week')} {weekOf(ev, year)} · {city(hostCityId(ev, year))}</small><br />
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

/** Kunci baris laga (untuk pilihan Live/Skip per laga). */
export const rowKey = (m: RoundMatch) => `${m.key}:${m.sides.join('-')}`;

/** Nama hari ke-`k` dari `n` hari turnamen (hari terakhir = Minggu). */
export const weekday = (k: number, n: number) => t(`wd${(((7 - (n - 1 - k)) % 7) + 7) % 7}` as TextKey);

/**
 * Layar babak / hari pertandingan: laga dimainkan satu per satu (baris giliran disorot). Laga atlet sendiri tampil Live,
 * kecuali barisnya di-Skip. `tab`: tab terakhir yang dipilih (disimpan pemanggil antar babak).
 * Jadwal harian (`show.day`): strip hari (hari lalu bisa dibuka), laga per lapangan menurut order of play, filter nomor.
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
  const keys = [...new Set(show.matches.map((m) => m.key))].sort((a, b) => DISCIPLINES.indexOf(a as Discipline) - DISCIPLINES.indexOf(b as Discipline)); // beregu: tidak ada di DISCIPLINES, urutan tetap
  // Nomor unggulan di turnamen ini (dari hasil undian nomor itu); beregu tanpa unggulan.
  const seedOf = (key: string, id: string) => state.eventRecords
    .find((r) => r.tournamentId === show.tournamentId && r.year === state.date.year && r.discipline === key)?.slots.find((x) => x.entrant === id)?.seed;
  const seedTag = (key: string, id: string) => { const n = seedOf(key, id); return n ? <> <small className="seed">[{n}]</small></> : null; }; // spasi di luar: unggulan boleh turun baris
  // Laga individu yang sudah selesai → catatan laga (detail & statistik lewat klik skor).
  const recordOf = (m: RoundMatch) => state.matches.find((x) => x.tournamentId === show.tournamentId && x.year === state.date.year
    && x.discipline === m.key && x.round === (m.round ?? show.round) && x.sides[0] === m.sides[0] && x.sides[1] === m.sides[1]);
  // Beregu: pertandingan (tie) yang sudah selesai → pop-up detail partai, seperti di halaman turnamen.
  const teamRes = (key: string) => [...state.teamResults, ...(liveTeamResults.get(state) ?? [])]
    .find((r) => r.eventId === show.tournamentId && r.year === state.date.year && r.format === key);
  const tieOf = (m: RoundMatch) => teamRes(m.key)?.ties.find((x) => x.round === (m.round ?? show.round) && x.sides[0] === m.sides[0] && x.sides[1] === m.sides[1]);
  const [openTie, setOpenTie] = useState<{ key: string; tie: TeamTie }>();
  const daily = show.day !== undefined;
  const [view, setView] = useState(show.day); // hari yang dibuka di strip (hari lalu = hasil)
  const viewing = view ?? show.day;
  const rows = !daily || viewing === show.day ? show.matches : show.past?.[viewing!] ?? [];
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
  // Jadwal harian: bawaan "Semua" (urut lapangan); tab nomor tetap mengikuti laga yang sedang giliran.
  const tab = daily
    ? (picked && picked !== 'all' && keys.includes(picked) ? current?.key ?? picked : 'all')
    : current?.key ?? (picked && keys.includes(picked) ? picked : keys.find((k) => mineKeys.has(k)) ?? keys[0]);
  // Jadwal harian: urut main (gelombang demi gelombang, lalu lapangan) — sorotan laga berjalan turun dari atas ke bawah.
  const shown = (daily ? [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.court ?? 0) - (b.court ?? 0)) : rows)
    .filter((m) => tab === 'all' || m.key === tab);
  const multiRound = new Set(rows.map((m) => m.round)).size > 1;
  // Atlet sendiri dengan dua laga belum dimainkan hari ini (dua nomor): boleh mundur dari salah satunya (saran: nomor laga keduanya).
  const [pulled, setPulled] = useState<string[]>([]);
  const twice = new Map<string, RoundMatch[]>();
  if (daily && show.phase === 'pending' && show.withdraw && viewing === show.day)
    for (const m of [...show.matches].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      for (const id of m.sides.filter(isMine)) if (!m.result)
        for (const pid of state.pairs.find((x) => x.id === id)?.playerIds ?? [id]) twice.set(pid, [...(twice.get(pid) ?? []), m]);
  const doubleDuty = [...twice].filter(([, ms]) => new Set(ms.map((m) => m.key)).size > 1);
  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const done = show.phase === 'done';
  const final = show.round === 'F';
  const box = useRef<HTMLElement>(null);
  useEffect(() => { box.current?.querySelector('tr.current')?.scrollIntoView({ block: 'nearest' }); }, [show.current]);
  const roundName = show.round === 'G' ? t('roundG') : /^Q\d/.test(show.round) ? `${t('qualifying')} R${show.round.slice(1)}` : show.round;
  const shortOf = (r: string) => r === 'G' ? t('roundG') : r; // strip hari: Q1, R64, … (sama lebar)
  const nameOf = (r: string) => r === 'G' ? t('roundG') : /^Q\d/.test(r) ? `${t('qualifying')} R${r.slice(1)}` : r;
  const title = daily
    ? `${eventName(ruleset, show.tournamentId, state.date.year)} · ${t('dayN', { n: show.day! + 1 })} (${weekday(show.day!, show.plan!.days)}) · ${[...new Set(show.matches.map((m) => m.round!))].map(nameOf).join(', ')}`
    : `${eventName(ruleset, show.tournamentId, state.date.year)} · ${roundName}`;
  return (
    <section className="card hub" ref={box}>
        {openTie && <TieDetail r={teamRes(openTie.key)!} tie={openTie.tie} name={(c) => label(c).name} onClose={() => setOpenTie(undefined)} />}
        <h3>{title}</h3>
        {daily && (
          <nav className="controls subnav days" aria-label={t('schedule')}>
            {show.plan!.rounds.map((rs, k) => (
              <button key={k} aria-pressed={k === viewing} aria-current={k === show.day ? 'date' : undefined} disabled={k > show.day!} onClick={() => setView(k)}>
                <b>{weekday(k, show.plan!.days)}</b> <small>{[...rs].sort((a, b) => roundOrder(a as MatchRound) - roundOrder(b as MatchRound)).map(shortOf).join('·')}</small>
              </button>
            ))}
          </nav>
        )}
        {/* Individu: nomor selalu terlihat, juga saat babak hanya berisi satu nomor (mis. R64 hanya MS). */}
        {(keys.length > 1 || !team) && (
          <nav className="controls subnav">
            {daily && <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>{t('allDisc')}</button>}
            {keys.map((k) => (
              <button key={k} aria-pressed={k === tab} disabled={playing && k !== tab && tab !== 'all'} onClick={() => setTab(k)}>
                {team ? formatName(k as TeamFormat, show.tournamentId) : k}{mineKeys.has(k) && <span className="mine"> ●</span>}
              </button>
            ))}
          </nav>
        )}
        {!done && mineRows.length > 0 && viewing === show.day && (
          <div className="drawctl">
            <span className="seg">
              <button aria-pressed={mineRows.every((k) => !skipped.has(k))} onClick={() => setAll(false)}>▶ {t('liveAll')}</button>
              <button aria-pressed={mineRows.every((k) => skipped.has(k))} onClick={() => setAll(true)}>⏭ {t('skipAllRows')}</button>
            </span>
          </div>
        )}
        {/* Atlet sendiri dengan dua laga hari ini: satu baris per atlet, tombol nomor (lebar tetap, sejajar) untuk mundur. */}
        {doubleDuty.length > 0 && (
          // Dilipat secara bawaan: judul + jumlah atlet; dibuka untuk memilih nomor yang ditinggalkan.
          <details className="duty" title={t('withdrawTwoHint')}>
            <summary className="duty-head"><span>⚡ {t('dutyHead')} <span className="duty-count">{doubleDuty.length}</span></span><small className="muted-text">{t('withdrawCol')}</small></summary>
            <ul>
              {doubleDuty.map(([pid, ms]) => {
                const keyOf = (m: RoundMatch) => `${m.key}:${m.sides.find(isMine)!}`;
                const done = ms.find((m) => pulled.includes(keyOf(m)));
                return (
                  <li key={pid}>
                    <PlayerName id={pid} className="duty-name">{pname(pid)}</PlayerName>
                    {done ? <small className="muted-text">✓ {t('withdrewFrom', { d: done.key })}</small> : (
                      <span className="seg">{ms.map((m) => (
                        <button key={m.key} title={t('withdrawFrom', { d: m.key })} aria-label={t('withdrawFrom', { d: m.key })}
                          onClick={() => { show.withdraw!(m.key, m.sides.find(isMine)!); setPulled([...pulled, keyOf(m)]); }}>
                          {m.key}
                        </button>
                      ))}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        <table className="roundlist">
          <colgroup><col className="side" /><col className="vs" /><col className="side" /><col className="score" /></colgroup>
          <tbody>{shown.flatMap((m) => {
            const sides = m.sides.map(label);
            const mine = m.sides.some(isMine);
            const w = m.result?.winner;
            // Beregu: jumlah partai dimenangkan; individu: skor per game.
            const score = !m.result ? '' : team
              ? `${m.result.scores.filter(([x, y]) => x > y).length}–${m.result.scores.filter(([x, y]) => x < y).length}`
              : [...m.result.scores.map(([x, y], i) => <span key={i} className="game">{x}-{y}</span>), endTag(m.result)]; // satu game per baris
            const k = rowKey(m);
            const rec = score && !team ? recordOf(m) : undefined;
            const tie = score && team ? tieOf(m) : undefined;
            return [(
              <tr key={k} className={[mine && 'mine-row', m === current && 'current'].filter(Boolean).join(' ') || undefined}>
                <td className={w === 0 ? 'win' : undefined}><Flag id={sides[0].country} /><PlayerName id={m.sides[0]}>{sides[0].name}</PlayerName>{seedTag(m.key, m.sides[0])}</td>
                {/* Jadwal harian: kolom tengah = lapangan, lalu nomor (& babak bila sehari lebih dari satu babak) & 📺 laga siaran. */}
                <td className="muted-text">{daily ? (
                  <small className="slot">
                    <span className="court" title={t('courtN', { n: m.court! })}>{t('courtShort', { n: m.court! })}</span>
                    <span>{tab === 'all' ? m.key : ''}{multiRound ? ` ${m.round}` : ''}{m.tv && <span className="tv" title={t('tvMatch')}>📺</span>}</span>
                  </small>
                ) : 'vs'}</td>
                <td className={w === 1 ? 'win' : undefined}><Flag id={sides[1].country} /><PlayerName id={m.sides[1]}>{sides[1].name}</PlayerName>{seedTag(m.key, m.sides[1])}</td>
                <td className="num">{rec ? <MatchLink m={rec} name={(x) => label(x).name} title={eventName(ruleset, show.tournamentId, state.date.year)}>{score}</MatchLink>
                  : tie ? <a href="#" title={t('matchDetail')} onClick={(e) => { e.preventDefault(); setOpenTie({ key: m.key, tie }); }}>{score}</a>
                  : score || (m === current ? '…'
                  : mine && !done && <button className="rowtoggle" title={t('rowToggleHint')} aria-label={t(skipped.has(k) ? 'rowSkip' : 'rowLive')} onClick={() => toggle(k)}>
                    {/* HP: ikon saja agar muat di kolom skor; teks di layar lebar. */}
                    {skipped.has(k) ? '⏭' : '▶'}<span className="hide-sm"> {t(skipped.has(k) ? 'rowSkip' : 'rowLive')}</span>
                  </button>)}</td>
              </tr>
            )];
          })}</tbody>
        </table>
        {/* Juara tiap nomor (urut MS…XD; beregu: per format), juara negara sendiri disorot. */}
        {done && final && viewing === show.day && (() => {
          const finals = show.matches.filter((m) => (tab === 'all' || m.key === tab) && (m.round ?? 'F') === 'F' && m.result)
            .sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
          return finals.length > 0 && (
            <section className="champs">
              <h4>🏆 {t('champion')}</h4>
              <ul>{finals.map((m) => {
                const id = m.sides[m.result!.winner], who = label(id);
                return (
                  <li key={m.key} className={isMine(id) ? 'mine' : undefined}>
                    <span className="chip">{team ? formatName(m.key as TeamFormat, show.tournamentId) : m.key}</span>
                    <span className="champ-name"><Flag id={who.country} /><b><PlayerName id={id}>{who.name}</PlayerName></b></span>
                  </li>
                );
              })}</ul>
            </section>
          );
        })()}
        <div className="controls roundbar">
          {playing
            ? <button onClick={onSkipRest}>{t(daily ? 'simDay' : 'simRound')}</button>
            : <button className="primary" onClick={onNext}>{!done ? t(daily ? 'playDay' : 'playRound') : final ? t('doneEvent') : t(daily ? 'nextDay' : 'nextRound')}</button>}
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
      <div className="split">
        <div>{list && <EntryLists key={d} entry={list.entry} name={label} mine={mine} />}</div>
        <EntrySide show={show} mine={mine} />
      </div>
      <div className="controls roundbar">
        <button className="primary" onClick={onDraw}>{t('startDraw')} →</button>
        <button onClick={onSkipDraw}>{t('draw_skipEvent')}</button>
      </div>
    </section>
  );
}

/** Panel samping daftar entry: atlet negara sendiri di semua nomor (status) + ringkasan jumlah peserta per nomor. */
function EntrySide({ show, mine }: { show: EntriesShow; mine: (id: string) => boolean }) {
  const { state } = useGame().game;
  // Label pendek agar muat di panel (judul tabel: singkatan, status atlet: kata lengkap).
  const parts = [['main', 'entShortMain', 'entShortMain'], ['wildcards', 'entShortWc', 'wildcard'], ['qualifying', 'entShortQual', 'qualifying'], ['reserves', 'entShortRes', 'reserves']] as const;
  const own = show.lists.flatMap((l) => parts.flatMap(([k, , label]) => l.entry[k].flatMap((c, i) => (mine(c.id)
    ? [{ d: l.discipline, id: c.id, status: k === 'reserves' ? `${t(label)} ${i + 1}` : t(label), rank: c.entryRank ?? c.rank }] : []))));
  return (
    <aside className="sidepanel">
      <h4>{t('myAthletesHere')}</h4>
      {own.length === 0 ? <p className="hint">{t('noMineHere')}</p> : (
        <table className="fit">
          <tbody>{own.map((x) => (
            <tr key={`${x.d}:${x.id}`}><td><span className="chip">{x.d}</span></td><td><PlayerName id={x.id}>{entrantLabel(state, x.id).name}</PlayerName></td><td className="muted-text" style={{ whiteSpace: 'nowrap' }}>{x.status}</td><td className="num">{x.rank ? `#${x.rank}` : '—'}</td></tr>
          ))}</tbody>
        </table>
      )}
      <h4>{t('entrySummary')}</h4>
      <table className="fit">
        <thead><tr><th />{parts.map(([k, short]) => <th key={k} className="num">{t(short)}</th>)}</tr></thead>
        <tbody>{show.lists.map((l) => (
          <tr key={l.discipline}><td><span className="chip">{l.discipline}</span></td>{parts.map(([k]) => <td key={k} className="num">{l.entry[k].length}</td>)}</tr>
        ))}</tbody>
      </table>
    </aside>
  );
}
