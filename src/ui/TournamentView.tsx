import { useState } from 'react';
import { DISCIPLINES, type Discipline } from '../engine/types';
import { dataName, numLocale, t } from '../i18n';
import { BracketView, DrawStepsView, EntryView, GroupView, QualView, SeedsView } from './EventViews';
import { entrantLabel, eventName, lookup, useGame } from './game';
import { LiveDraw } from './LiveDraw';
import { FinalsResult } from './Team';

// Halaman turnamen di karier: entry, kualifikasi/grup, undian, bagan untuk tiap nomor (data 2 musim terakhir).

const SECTIONS = ['entry', 'qual', 'draw', 'bracket'] as const;
type Section = (typeof SECTIONS)[number];
const LABEL = { entry: 'stageEntry', qual: 'stageQual', draw: 'stageDraw', bracket: 'stageBracket' } as const;

export function TournamentView({ id, year, onOpenPlayer, onBack }: { id: string; year: number; onOpenPlayer: (id: string) => void; onBack: () => void }) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId;
  const def = ruleset.calendar.find((e) => e.id === id) ?? ruleset.team.events.find((e) => e.id === id);
  const city = world.cities.find((c) => c.id === def?.cityId);
  const records = state.eventRecords.filter((r) => r.tournamentId === id && r.year === year);
  const played = DISCIPLINES.filter((d) => records.some((r) => r.discipline === d) || state.matches.some((m) => m.tournamentId === id && m.year === year && m.discipline === d));
  const [d, setD] = useState<Discipline | undefined>(played.find((x) => x === 'MS') ?? played[0]);
  const [section, setSection] = useState<Section>('bracket');
  const [replay, setReplay] = useState(false);

  const label = (x: string) => { const l = entrantLabel(state, x); return `${l.name} (${l.country})`; };
  const who = {
    name: label,
    mine: (x: string) => !!managed && entrantLabel(state, x).country === managed,
    onOpen: (x: string) => onOpenPlayer(lookup(state).pairs.get(x)?.playerIds[0] ?? x),
    eventTitle: eventName(ruleset, id, year),
  };
  const team = state.teamResults.filter((r) => r.eventId === id && r.year === year);
  const tier = def && 'tierId' in def ? def.tierId : t('tabTeam');
  const prize = def && 'prizeUsd' in def && def.prizeUsd ? ` · $${def.prizeUsd.toLocaleString(numLocale())}` : '';

  const rec = records.find((r) => r.discipline === d);
  const matches = state.matches.filter((m) => m.tournamentId === id && m.year === year && m.discipline === d);
  return (
    <section>
      <div className="controls"><button onClick={onBack}>{t('back')}</button></div>
      <h2>{eventName(ruleset, id, year)} {year}</h2>
      <p>{tier} · {dataName(city?.name)} ({city?.countryId}) · {t('week')} {def?.week}{prize}</p>
      {team.length > 0 ? team.map((r) => <FinalsResult key={r.format} r={r} />) : played.length === 0 ? <p>{t('notPlayedYet')}</p> : (
        <>
          <nav className="controls">
            {played.map((x) => <button key={x} aria-pressed={x === d} onClick={() => setD(x)}>{x}</button>)}
          </nav>
          {!rec ? (
            // Turnamen sebelum catatan disimpan (save lama): daftar laga per babak.
            <>
              <p className="hint">{t('limitedData')}</p>
              {[...new Set(matches.map((m) => m.round))].map((round) => (
                <div key={round}>
                  <h4>{round}</h4>
                  <ul>{matches.filter((m) => m.round === round).map((m) => (
                    <li key={m.id}>{label(m.sides[0])} {m.winner === 0 ? '✓' : ''} – {label(m.sides[1])} {m.winner === 1 ? '✓' : ''} · {m.scores.map((s) => s.join('-')).join(', ')}</li>
                  ))}</ul>
                </div>
              ))}
            </>
          ) : (
            <>
              <nav className="controls">
                {SECTIONS.map((s) => <button key={s} aria-pressed={s === section} onClick={() => setSection(s)}>{t(LABEL[s])}</button>)}
              </nav>
              {section === 'entry' && <EntryView rec={rec} matches={matches} {...who} />}
              {section === 'qual' && (rec.groups ? <GroupView rec={rec} matches={matches} {...who} /> : <QualView rec={rec} matches={matches} {...who} />)}
              {section === 'draw' && <button onClick={() => setReplay(true)}>{t('draw_replay')}</button>}
              {replay && (
                <LiveDraw replay title={`${eventName(ruleset, id, year)} · ${d}`} name={label} mine={who.mine} onClose={() => setReplay(false)}
                  show={{ steps: rec.steps, size: rec.groups ? undefined : rec.slots.length, groups: rec.groups?.groups.length }} />
              )}
              {section === 'draw' && (
                <div className="split">
                  <div><h4>{t('stageSeeds')}</h4><SeedsView rec={rec} matches={matches} {...who} /></div>
                  <div><h4>{t('stageDraw')}</h4><DrawStepsView rec={rec} matches={matches} {...who} /></div>
                </div>
              )}
              {section === 'bracket' && <BracketView rec={rec} matches={matches} {...who} />}
            </>
          )}
        </>
      )}
    </section>
  );
}
