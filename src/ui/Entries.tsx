import { useMemo, useState } from 'react';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { entrantsFor, isHeld, weekKey } from '../engine/season';
import { DISCIPLINES } from '../engine/types';
import { dataName, t } from '../i18n';
import { entrantLabel, lookup, saveGame, useGame } from './game';
import { FatigueBar } from './Squad';
import { isPratama } from '../engine/generator';

/** Kalender & entry: daftar jadwal turnamen musim ini + status entry; klik turnamen → isi entry-nya. */
/** `fixedWeek`: langsung tabel entry minggu itu (dipakai pop-up entry mingguan). */
export function Entries({ fixedWeek, onOpenEvent }: { fixedWeek?: number; onOpenEvent?: (id: string, year: number) => void }) {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const { year, week } = state.date;
  const [open, setOpen] = useState<string>();
  if (fixedWeek !== undefined) return <EntryTable week={fixedWeek} />;
  const ev = open && ruleset.calendar.find((e) => e.id === open);
  if (ev) return (
    <>
      <p><button onClick={() => setOpen(undefined)}>← {t('back')}</button></p>
      <h3>{t('week')} {ev.week} · {dataName(ev.name)} <small className="muted-text">{ev.tierId}</small></h3>
      <EntryTable week={ev.week} eventId={ev.id} />
      <p><button className="primary" onClick={() => {
        (state.entriesSubmitted ??= {})[`${year}:${ev.id}`] = true;
        changed(); void saveGame(game); setOpen(undefined);
      }}>{t('submitEntries')}</button></p>
    </>
  );
  const city = (id: string) => dataName(game.world.cities.find((c) => c.id === id)?.name);
  const submitted = (id: string) => state.entriesSubmitted?.[`${year}:${id}`];
  const list = ruleset.calendar.filter((e) => isHeld(e, year)).sort((a, b) => a.week - b.week);
  return (
    <div className="scroll">
      <table>
        <thead><tr><th className="num">{t('week')}</th><th>{t('tournament')}</th><th>{t('tier')}</th><th>{t('city')}</th><th>{t('entryStatus')}</th></tr></thead>
        <tbody>{list.map((e) => {
          const past = e.week < week;
          const auto = e.tierId === 'WTF' || ruleset.tiers.find((x) => x.id === e.tierId)?.junior; // junior & Finals: otomatis
          return (
            <tr key={e.id} className={past ? 'muted-text' : undefined}>
              <td className="num">{e.week}</td>
              <td><a href="#" onClick={(x) => { x.preventDefault(); if (past || auto) onOpenEvent?.(e.id, year); else setOpen(e.id); }}>{dataName(e.name)}</a></td>
              <td><span className="chip">{ruleset.tiers.find((x) => x.id === e.tierId)?.junior ? t('juniorShort') : e.tierId}</span></td>
              <td>{city(e.cityId)}</td>
              <td>{past ? t('finished') : auto ? t('auto')
                : submitted(e.id) ? <span className="badge good">✓ {t('entrySubmitted')}</span> : <span className="badge">{t('entryIncomplete')}</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

/** Tabel entry satu minggu; `eventId`: hanya atlet/pasangan di nomor yang dipertandingkan turnamen itu. */
function EntryTable({ week: w, eventId }: { week: number; eventId?: string }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const { year } = state.date;
  const events = ruleset.calendar.filter((e) => e.week === w && isHeld(e, year) && e.tierId !== 'WTF' && !ruleset.tiers.find((x) => x.id === e.tierId)?.junior); // junior: otomatis
  const key = weekKey({ year, week: w });
  const decisions = state.manualEntries[key] ?? {};
  const { players } = lookup(state);

  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    return new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, now, ruleset))]));
  }, [version, state, ruleset]);

  const set = (id: string, value: string) => {
    const next = { ...decisions };
    if (value === 'auto') delete next[id]; else next[id] = value;
    state.manualEntries[key] = next;
    changed();
    void saveGame(game);
  };

  const drawOf = (id: string) => ruleset.tiers.find((tt) => tt.id === events.find((e) => e.id === id)?.tierId)?.drawSize;
  const rows = DISCIPLINES.filter((d) => !eventId || (drawOf(eventId)?.[d] ?? 0) > 0).flatMap((d) =>
    entrantsFor(state, d).filter((e) => e.countryId === country)
      .map((e) => ({ ...e, d, rank: ranks.get(d)!.get(e.id) }))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)));

  return (
    <>
      <p>{t('entryHelp')}</p>
      {events.length === 0 ? <p>{t('noEvents')}</p> : (
        <>
          {!eventId && <p>{events.map((e) => `${dataName(e.name)} (${e.tierId})`).join(' · ')}</p>}
          <div className="scroll">
            <table>
              <thead><tr><th>{t('discipline')}</th><th>{t('name')}</th><th>{t('rank')}</th><th>{t('fatigue')}</th><th>{t('tournament')}</th></tr></thead>
              <tbody>{rows.map((e) => {
                const required = events.find((ev) => state.commitments[e.id]?.includes(ev.id));
                const injured = e.playerIds.some((id) => players.get(id)?.injury);
                const tired = Math.max(...e.playerIds.map((id) => players.get(id)?.fatigue ?? 0));
                const offered = events.filter((ev) => ruleset.tiers.find((tt) => tt.id === ev.tierId)!.drawSize[e.d] > 0);
                return (
                  <tr key={e.id}>
                    <td>{e.d}</td>
                    <td>{entrantLabel(state, e.id).name}{required ? ` ⭐ ${t('required')}` : ''}{e.trial && <> <span className="tag">{t('trialPair')}</span></>}{e.playerIds.some((id) => { const x = players.get(id); return x && isPratama(x, state.date); }) && <> <span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span></>}</td>
                    <td className="num">{e.rank ?? '—'}</td>
                    <td><FatigueBar value={tired} /></td>
                    <td>{injured ? `🩹 ${t('injury')}` : (
                      <select value={decisions[e.id] ?? 'auto'} onChange={(ev) => set(e.id, ev.target.value)}>
                        <option value="auto">{e.trial ? t('notEntered') : t('auto')}</option>
                        {offered.map((ev) => <option key={ev.id} value={ev.id}>{dataName(ev.name)}</option>)}
                        <option value="rest">{t('rest')}</option>
                      </select>
                    )}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
