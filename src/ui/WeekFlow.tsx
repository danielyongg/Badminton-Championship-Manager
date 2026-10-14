import { useState } from 'react';
import type { RoundShow } from '../engine/gate';
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

/** Satu babak turnamen yang dimainkan: laga per nomor (pasangan laga → skor). */
export function RoundScreen({ show, onNext }: { show: RoundShow; onNext: () => void }) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId;
  const team = !DISCIPLINES.includes(show.matches[0]?.key as Discipline); // kunci beregu = format
  const label = (id: string) => team
    ? { name: dataName(world.countries.find((c) => c.id === id)?.name) ?? id, country: id }
    : entrantLabel(state, id);
  const keys = [...new Set(show.matches.map((m) => m.key))];
  const done = show.phase === 'done';
  const final = show.round === 'F';
  return (
    <div className="modal" role="dialog" aria-label={t('weekEvents')}>
      <div className="live card">
        <h3>{eventName(ruleset, show.tournamentId, state.date.year)} · {show.round === 'G' ? t('roundG') : show.round}</h3>
        {keys.map((k) => (
          <section key={k}>
            <h4>{team ? formatName(k as TeamFormat) : k}</h4>
            <table className="roundlist"><tbody>{show.matches.filter((m) => m.key === k).map((m, i) => {
              const sides = m.sides.map(label);
              const mine = sides.some((s) => s.country === managed);
              const w = m.result?.winner;
              // Beregu: jumlah partai dimenangkan; individu: skor per game.
              const score = !m.result ? '' : team
                ? `${m.result.scores.filter(([x, y]) => x > y).length}–${m.result.scores.filter(([x, y]) => x < y).length}`
                : m.result.scores.map(([x, y]) => `${x}-${y}`).join(' ');
              return (
                <tr key={i} className={mine ? 'mine-row' : undefined}>
                  <td className={w === 0 ? 'win' : undefined}><Flag id={sides[0].country} />{sides[0].name}</td>
                  <td className="muted-text">vs</td>
                  <td className={w === 1 ? 'win' : undefined}><Flag id={sides[1].country} />{sides[1].name}</td>
                  <td className="num">{score}</td>
                </tr>
              );
            })}</tbody></table>
            {done && final && show.matches.filter((m) => m.key === k).map((m, i) => (
              <p key={i}>🏆 {t('champion')}: <b>{label(m.sides[m.result!.winner]).name}</b></p>
            ))}
          </section>
        ))}
        <div className="controls roundbar">
          <button className="primary" onClick={onNext}>{!done ? t('playRound') : final ? t('doneEvent') : t('nextRound')}</button>
        </div>
      </div>
    </div>
  );
}
