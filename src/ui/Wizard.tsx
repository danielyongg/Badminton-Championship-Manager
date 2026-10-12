import { useEffect, useMemo, useState } from 'react';
import type { Candidate } from '../engine/entry';
import { BracketView, DrawStepsView, EntryView, GroupView, QualView, SeedsView } from './EventViews';
import { currentAbility } from '../engine/generator';
import { runEvent, simPlay, toRecord, type EventRecord } from '../engine/tournament';
import { makeRng } from '../engine/rng';
import { DISCIPLINES, isDoubles, type Discipline, type Match, type Pair, type Player, type Ruleset, type World } from '../engine/types';
import { dataName, t } from '../i18n';

const STAGES = ['stageEntry', 'stageQual', 'stageSeeds', 'stageDraw', 'stageBracket'] as const;

/** Wizard Turnamen: entry → kualifikasi → seeding → drawing → bagan. */
export function Wizard({ players, pairs, ruleset, world }: { players: Player[]; pairs: Pair[]; ruleset: Ruleset; world: World }) {
  const events = ruleset.calendar.filter((e) => !e.everyYears);
  const [eventId, setEventId] = useState(events[0].id);
  const [discipline, setDiscipline] = useState<Discipline>('MS');
  const [seed, setSeed] = useState(1);
  const [stage, setStage] = useState(0);
  const [drawStep, setDrawStep] = useState(0);

  const playerById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const pairById = useMemo(() => new Map(pairs.map((p) => [p.id, p])), [pairs]);
  const name = (id?: string | null) => {
    if (!id) return '—';
    const pair = pairById.get(id);
    const ps = pair ? pair.playerIds.map((x) => playerById.get(x)!) : [playerById.get(id)!];
    return `${ps.map((p) => p.name).join(' / ')} (${ps[0].countryId})`;
  };

  const event = events.find((e) => e.id === eventId)!;
  const tier = ruleset.tiers.find((x) => x.id === event.tierId)!;

  const [result, setResult] = useState<{ rec: EventRecord; matches: Match[] }>();
  useEffect(() => {
    let cancelled = false;
    setResult(undefined);
    // ASUMSI (sementara s/d Fase 4): "ranking" = urutan kemampuan, karena ranking BWF belum dihitung.
    const strength = (id: string) => {
      const pair = pairById.get(id);
      return pair ? pair.playerIds.reduce((s, x) => s + currentAbility(playerById.get(x)!.attrs), 0) / 2 : currentAbility(playerById.get(id)!.attrs);
    };
    const gender = discipline === 'MS' || discipline === 'MD' ? 'M' : 'F';
    const pool: { id: string; countryId: string }[] = isDoubles(discipline)
      ? pairs.filter((p) => p.discipline === discipline).map((p) => ({ id: p.id, countryId: playerById.get(p.playerIds[0])!.countryId }))
      : players.filter((p) => p.gender === gender).map((p) => ({ id: p.id, countryId: p.countryId }));
    const candidates: Candidate[] = pool
      .sort((a, b) => strength(b.id) - strength(a.id))
      .map((c, i) => ({ ...c, rank: i + 1 }));
    const rng = makeRng(seed);
    const matches: Match[] = [];
    const host = world.cities.find((c) => c.id === event.cityId)!.countryId;
    const play = simPlay({ players: playerById, pairs: pairById, cfg: ruleset.match, rng, tournamentId: event.id, year: 2026, discipline, matches });
    void runEvent({ tournament: event, discipline, year: 2026, hostCountryId: host, candidates, ruleset, rng, play })
      .then((run) => { if (!cancelled) setResult({ rec: toRecord(event.id, 2026, discipline, run), matches }); });
    return () => { cancelled = true; };
  }, [event, discipline, seed, ruleset, players, pairs, playerById, pairById, world]);

  const reset = () => { setStage(0); setDrawStep(0); };
  const view = result && { rec: result.rec, matches: result.matches, name: (id: string) => name(id) };

  return (
    <section>
      <div className="controls">
        <label>{t('tournament')}
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); reset(); }}>
            {events.map((e) => <option key={e.id} value={e.id}>{t('week')} {e.week} · {dataName(e.name)} ({e.tierId})</option>)}
          </select>
        </label>
        <label>{t('discipline')}
          <select value={discipline} onChange={(e) => { setDiscipline(e.target.value as Discipline); reset(); }}>
            {DISCIPLINES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>{t('drawSeed')}
          <input type="number" value={seed} onChange={(e) => { setSeed(Number(e.target.value)); reset(); }} style={{ width: 70 }} />
        </label>
      </div>
      {!view ? <p>…</p> : <>
        <nav className="controls">
          {STAGES.map((s, i) => <button key={s} aria-pressed={stage === i} onClick={() => setStage(i)}>{i + 1}. {t(s)}</button>)}
        </nav>
        {stage === 0 && <EntryView {...view} />}
        {stage === 1 && (view.rec.groups ? <GroupView {...view} /> : <QualView {...view} />)}
        {stage === 2 && <SeedsView {...view} />}
        {stage === 3 && (
          <>
            <div className="controls">
              <button onClick={() => setDrawStep(Math.min(drawStep + 1, view.rec.steps.length))}>{t('nextStep')}</button>
              <button onClick={() => setDrawStep(view.rec.steps.length)}>{t('allSteps')}</button>
            </div>
            <DrawStepsView {...view} count={drawStep} />
          </>
        )}
        {stage === 4 && <BracketView {...view} />}
      </>}
    </section>
  );
}
