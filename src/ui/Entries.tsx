import { useMemo, useState } from 'react';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { entrantsFor, isHeld, weekKey } from '../engine/season';
import { DISCIPLINES } from '../engine/types';
import { dataName, t } from '../i18n';
import { entrantLabel, lookup, saveGame, useGame } from './game';
import { FatigueBar } from './Squad';
import { isPratama } from '../engine/generator';

/** Kalender & entry: pilih turnamen (atau istirahat) per atlet/pasangan untuk minggu-minggu mendatang. */
/** `fixedWeek`: hanya minggu itu, tanpa tombol pilih minggu (dipakai pop-up entry mingguan). */
export function Entries({ fixedWeek }: { fixedWeek?: number }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const { year, week } = state.date;
  const weeks = [...new Set(ruleset.calendar.filter((e) => isHeld(e, year) && e.week >= week).map((e) => e.week))].sort((a, b) => a - b).slice(0, 8);
  const [chosen, setW] = useState(weeks[0] ?? week);
  const w = fixedWeek ?? chosen;
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

  const rows = DISCIPLINES.flatMap((d) =>
    entrantsFor(state, d).filter((e) => e.countryId === country)
      .map((e) => ({ ...e, d, rank: ranks.get(d)!.get(e.id) }))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)));

  return (
    <>
      <p>{t('entryHelp')}</p>
      {fixedWeek === undefined && <nav className="controls">
        {weeks.map((x) => <button key={x} aria-pressed={x === w} onClick={() => setW(x)}>{t('entryWeek')} {x}</button>)}
      </nav>}
      {events.length === 0 ? <p>{t('noEvents')}</p> : (
        <>
          <p>{events.map((e) => `${dataName(e.name)} (${e.tierId})`).join(' · ')}</p>
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
