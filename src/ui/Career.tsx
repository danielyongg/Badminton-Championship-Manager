import { useMemo, useRef, useState } from 'react';
import type { MatchResult } from '../engine/match';
import type { DrawHook, DrawShow, LiveHook, LiveRequest } from '../engine/tournament';
import { goalProgress } from '../engine/career';
import { ageAt } from '../engine/generator';
import { isHeld, switchCountry, type EntryHook, type TeamHook } from '../engine/season';
import type { Lineup, TeamEntrant } from '../engine/team';
import type { MatchRound } from '../engine/knockout';
import { DISCIPLINES, ROUNDS, type Discipline, type Match, type TeamFormat } from '../engine/types';
import { absWeek, computeRanking } from '../engine/ranking';
import type { FederationGoal } from '../engine/types';
import { dataName, numLocale, t, type TextKey } from '../i18n';
import { downloadPack, Editor, useDebounced } from './Editor';
import { Entries } from './Entries';
import { LangSelect } from './LangSelect';
import { ThemeSelect } from './ThemeSelect';
import { Flag } from './Flag';
import { LiveDraw } from './LiveDraw';
import { LiveMatch } from './LiveMatch';
import { advance, entrantLabel, eventName, JUNIOR_MAX_AGE, lookup, saveGame, useGame } from './game';
import { SeasonViews } from './Ranking';
import { Profile, Squad, usd } from './Squad';
import { formatName, levelName, SquadModal, Team, TieLineupModal } from './Team';
import { TournamentView } from './TournamentView';
import { MatchLink } from './MatchDetail';

/** Tier "turnamen besar" untuk live drawing (plus putaran final beregu). */
const BIG_TIERS = new Set(['S1000', 'S750', 'WC', 'OG', 'WTF']);

type Tab = 'dashboard' | 'squad' | 'entries' | 'team' | 'world' | 'federation' | 'editor' | 'settings';

export function CareerShell({ onQuit, onLang }: { onQuit: () => void; onLang: () => void }) {
  const { game, version, changed } = useGame();
  const { state, world } = game;
  const managed = state.career?.countryId ?? null;
  const [tab, setTab] = useState<Tab>('dashboard');
  const [profileId, setProfileId] = useState<string>();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [busy, setBusy] = useState(false);
  const [simWeek, setSimWeek] = useState<number>(); // minggu yang sedang disimulasikan (lanjut beberapa minggu)
  const stop = useRef(false);
  const [liveMode, setLiveMode] = useState<'off' | 'finals' | 'all'>('finals');
  const [live, setLive] = useState<{ req: LiveRequest; mySide: 0 | 1; resolve: (r: MatchResult) => void }>();
  const autoRest = useRef(false);
  type TeamAsk = { eventId: string; format: TeamFormat; pool: Record<string, TeamEntrant[]> } & (
    | { kind: 'squad'; suggested: string[]; resolve: (v: string[]) => void }
    | { kind: 'lineup'; round: MatchRound; opponent: string; squad: string[]; suggested: Lineup; resolve: (v: Lineup) => void });
  const [teamAsk, setTeamAsk] = useState<TeamAsk>();

  // Beregu: pop-up skuad sebelum turnamen & line-up sebelum tiap pertandingan (kecuali mode Otomatis / "Auto sisa minggu").
  const askTeam = () => !!managed && !state.teamAuto && !autoRest.current;
  const teamHook: TeamHook = {
    squad: (req) => (askTeam() && !state.entriesSubmitted?.[`${state.date.year}:${req.eventId}`] ? new Promise((resolve) => setTeamAsk({ ...req, kind: 'squad', resolve })) : null),
    lineup: (req) => (askTeam() ? new Promise((resolve) => setTeamAsk({ ...req, kind: 'lineup', resolve })) : null),
  };
  // Pop-up entry: sebelum minggu turnamen (besar saja / semua), manajer memeriksa & mengubah entry minggu itu.
  const [entryMode, setEntryMode] = useState<'off' | 'big' | 'all'>('off');
  const [entryAsk, setEntryAsk] = useState<{ week: number; resolve: () => void }>();
  const skipEntry = useRef(false);
  const entryHook: EntryHook = ({ week, events }) => {
    if (!managed || entryMode === 'off' || skipEntry.current) return null;
    if (entryMode === 'big' && !events.some((e) => BIG_TIERS.has(e.tierId))) return null;
    return new Promise<void>((resolve) => setEntryAsk({ week, resolve }));
  };
  // Live drawing: undian turnamen yang diikuti atlet sendiri (semua, atau turnamen besar + final beregu saja).
  const [drawMode, setDrawMode] = useState<'off' | 'big' | 'mine'>('big');
  const [drawAsk, setDrawAsk] = useState<{ d: DrawShow; resolve: () => void }>();
  const skipDraw = useRef<string>(undefined);
  const drawHook: DrawHook = (d) => {
    if (!managed || drawMode === 'off' || autoRest.current || skipDraw.current === d.tournamentId) return null;
    const tier = game.ruleset.calendar.find((e) => e.id === d.tournamentId)?.tierId ?? '';
    if (drawMode === 'big' && d.discipline && !BIG_TIERS.has(tier)) return null; // tanpa nomor = final beregu
    const mine = d.entrants.some((id) => (d.discipline ? entrantLabel(state, id).country === managed : id === managed));
    return mine ? new Promise<void>((resolve) => setDrawAsk({ d, resolve })) : null;
  };
  const nameOfCountry = (id: string) => dataName(world.countries.find((c) => c.id === id)?.name) ?? id;
  const teamTitle = (eventId: string) => eventName(game.ruleset, eventId, state.date.year) ?? eventId;

  // Laga atlet negara sendiri dimainkan Live sesuai pengaturan; sisanya Auto.
  const hook: LiveHook = (req) => {
    if (!managed || liveMode === 'off' || autoRest.current) return null;
    if (liveMode === 'finals' && req.round !== 'SF' && req.round !== 'F') return null;
    const mine = req.entrants.map((id) => entrantLabel(state, id).country === managed);
    if (!mine[0] && !mine[1]) return null;
    return new Promise((resolve) => setLive({ req, mySide: mine[0] ? 0 : 1, resolve }));
  };

  const persist = async () => {
    setStatus('saving');
    await saveGame(game);
    setStatus('saved');
  };
  const persistSoon = useDebounced(() => void persist());
  // Ekspor dunia save ini sebagai paket data (atlet aktif & pasangan aktif, tanpa kelelahan/cedera).
  const exportSave = () => downloadPack({
    id: '', name: game.meta.name, updatedAt: Date.now(), ruleset: game.ruleset, world,
    players: state.players.filter((p) => p.retired === undefined).map((p) => ({ ...p, fatigue: 0, injury: undefined, location: undefined })),
    pairs: state.pairs.filter((p) => !p.dissolved),
  });
  const go = async (weeks: number) => {
    setBusy(true);
    stop.current = false;
    skipDraw.current = undefined;
    skipEntry.current = false;
    autoRest.current = false;
    for (let i = 0; i < weeks && !stop.current; i++) {
      if (weeks > 1) setSimWeek(state.date.week);
      // Maju beberapa minggu = serba otomatis: tanpa pop-up entry, Live Match, skuad/line-up beregu & live drawing.
      await advance(game, 1, weeks > 1 ? {} : { entry: entryHook, live: hook, team: teamHook, draw: drawHook });
      autoRest.current = false;
      // Beri kesempatan browser menggambar ulang & menerima klik (Berhenti) di antara minggu → UI tidak membeku.
      await new Promise((r) => setTimeout(r, 0));
    }
    setSimWeek(undefined);
    setBusy(false);
    changed();
    void persist();
  };
  const weeksToSeasonEnd = 52 - state.date.week + 1;
  const countryName = managed ? dataName(world.countries.find((c) => c.id === managed)?.name) : t('observer');
  const tabs: Tab[] = managed ? ['dashboard', 'squad', 'entries', 'world', 'federation', 'editor', 'settings'] : ['dashboard', 'team', 'world', 'federation', 'editor', 'settings'];
  const tabLabel: Record<Tab, TextKey> = {
    dashboard: 'tabDashboard', settings: 'settings', squad: 'tabSquad', entries: 'tabEntries', team: 'tabTeam', world: 'tabWorld', federation: 'tabFederation', editor: 'tabEditor',
  };
  // Profil & halaman turnamen dibuka dari atas (bukan di posisi scroll daftar sebelumnya).
  const open = (id: string) => { setProfileId(id); window.scrollTo(0, 0); };
  const [eventView, setEventView] = useState<{ id: string; year: number }>();
  const openEvent = (id: string, year: number) => { setProfileId(undefined); setEventView({ id, year }); window.scrollTo(0, 0); };

  return (
    <main>
      <header className="controls shell">
        <b>{countryName}</b>
        <span className="date">{state.date.year} · {t('week')} {state.date.week}</span>
        {managed && <span>{t('reputation')}: {state.career!.reputation}</span>}
        <button className="primary" disabled={busy} onClick={() => go(1)}>{t('advance1')}</button>
        <button disabled={busy} onClick={() => go(4)}>{t('advance4')}</button>
        <button disabled={busy} onClick={() => go(weeksToSeasonEnd)}>{t('advanceSeason')}</button>
        {simWeek !== undefined && <span>{t('simulating', { w: simWeek })} <button onClick={() => { stop.current = true; }}>{t('stop')}</button></span>}
        <small>{status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : ''}</small>
        <button disabled={busy} onClick={onQuit}>{t('mainMenu')}</button>
      </header>
      {live && (
        <LiveMatch
          key={`${live.req.tournamentId}-${live.req.entrants.join('-')}-${live.req.round}`}
          sides={live.req.sides}
          names={[entrantLabel(state, live.req.entrants[0]).name, entrantLabel(state, live.req.entrants[1]).name]}
          ids={[entrantLabel(state, live.req.entrants[0]).country, entrantLabel(state, live.req.entrants[1]).country]}
          mySide={live.mySide}
          cfg={game.ruleset.match}
          rng={game.rng}
          title={`${eventName(game.ruleset, live.req.tournamentId, state.date.year)} · ${live.req.discipline} ${live.req.round}`}
          onDone={(r) => { setLive(undefined); live.resolve(r); }}
          onAutoRest={() => { autoRest.current = true; }}
        />
      )}
      {entryAsk && (
        <div className="modal" role="dialog" aria-label={t('entryPopupTitle')}>
          <div className="live card">
            <h3>{t('entryPopupTitle')} · {t('week')} {entryAsk.week}</h3>
            <Entries fixedWeek={entryAsk.week} />
            <div className="controls">
              <button className="primary" onClick={() => { setEntryAsk(undefined); entryAsk.resolve(); }}>{t('entryConfirm')}</button>
              <button onClick={() => { skipEntry.current = true; setEntryAsk(undefined); entryAsk.resolve(); }}>{t('entrySkipRun')}</button>
            </div>
          </div>
        </div>
      )}
      {drawAsk && (
        <LiveDraw key={`${drawAsk.d.tournamentId}-${drawAsk.d.discipline}`} show={drawAsk.d}
          title={`${eventName(game.ruleset, drawAsk.d.tournamentId, state.date.year)}${drawAsk.d.discipline ? ` · ${drawAsk.d.discipline}` : ''}`}
          name={(id) => (drawAsk.d.discipline ? `${entrantLabel(state, id).name} (${entrantLabel(state, id).country})` : nameOfCountry(id))}
          mine={(id) => (drawAsk.d.discipline ? entrantLabel(state, id).country === managed : id === managed)}
          onClose={() => { setDrawAsk(undefined); drawAsk.resolve(); }}
          onSkipEvent={() => { skipDraw.current = drawAsk.d.tournamentId; }} />
      )}
      {teamAsk?.kind === 'squad' && (
        <SquadModal key={`${teamAsk.eventId}-${teamAsk.format}`} title={teamTitle(teamAsk.eventId)} format={teamAsk.format} pool={teamAsk.pool}
          suggested={teamAsk.suggested} onDone={(v) => { setTeamAsk(undefined); teamAsk.resolve(v); }} />
      )}
      {teamAsk?.kind === 'lineup' && (
        <TieLineupModal key={`${teamAsk.eventId}-${teamAsk.format}-${teamAsk.round}-${teamAsk.opponent}`} title={teamTitle(teamAsk.eventId)}
          format={teamAsk.format} round={teamAsk.round} opponent={teamAsk.opponent} pool={teamAsk.pool} squad={teamAsk.squad} suggested={teamAsk.suggested}
          onDone={(v) => { setTeamAsk(undefined); teamAsk.resolve(v); }} onAuto={() => { autoRest.current = true; }} />
      )}
      <nav className="controls">
        {tabs.map((x) => <button key={x} aria-pressed={tab === x && !profileId && !eventView} onClick={() => { setTab(x); setProfileId(undefined); setEventView(undefined); }}>{t(tabLabel[x])}</button>)}
      </nav>
      {profileId ? <Profile id={profileId} onBack={() => setProfileId(undefined)} onOpen={open} onOpenEvent={openEvent} />
        : eventView ? <TournamentView key={`${eventView.id}-${eventView.year}`} id={eventView.id} year={eventView.year} onOpenPlayer={open} onBack={() => setEventView(undefined)} />
        : tab === 'settings' ? (
          <section className="card">
            <h3>{t('settings')}</h3>
            <div className="settings-form">
              {managed && (
                <label>{t('liveMode')}
                  <select value={liveMode} onChange={(e) => setLiveMode(e.target.value as typeof liveMode)}>
                    <option value="off">{t('live_off')}</option>
                    <option value="finals">{t('live_finals')}</option>
                    <option value="all">{t('live_all')}</option>
                  </select>
                </label>
              )}
              {managed && (
                <label>{t('entryPopup')}
                  <select value={entryMode} onChange={(e) => setEntryMode(e.target.value as typeof entryMode)}>
                    <option value="off">{t('liveDraw_off')}</option>
                    <option value="big">{t('entryPopup_big')}</option>
                    <option value="all">{t('entryPopup_all')}</option>
                  </select>
                </label>
              )}
              {managed && (
                <label>{t('liveDraw')}
                  <select value={drawMode} onChange={(e) => setDrawMode(e.target.value as typeof drawMode)}>
                    <option value="off">{t('liveDraw_off')}</option>
                    <option value="big">{t('liveDraw_big')}</option>
                    <option value="mine">{t('liveDraw_mine')}</option>
                  </select>
                </label>
              )}
              {managed && (
                <label>{t('teamMode')}
                  <select value={state.teamAuto ? 'auto' : 'manual'} onChange={(e) => { state.teamAuto = e.target.value === 'auto'; changed(); void persist(); }}>
                    <option value="manual">{t('teamMode_manual')}</option>
                    <option value="auto">{t('teamMode_auto')}</option>
                  </select>
                </label>
              )}
              <LangSelect onChange={onLang} />
              <ThemeSelect />
            </div>
          </section>
        )
        : tab === 'dashboard' ? <Dashboard onOpen={open} onOpenEvent={openEvent} />
        : tab === 'squad' ? <Squad onOpen={open} />
        : tab === 'entries' ? <Entries onOpenEvent={openEvent} />
        : tab === 'team' ? <Team />
        : tab === 'editor' ? (
          <Editor data={{ ruleset: game.ruleset, world, players: state.players, pairs: state.pairs }} mode="save" date={state.date} country={managed ?? undefined}
            onChange={() => { changed(); persistSoon(); }} toolbar={<button onClick={exportSave}>{t('export')}</button>} />
        )
        : tab === 'world' ? <SeasonViews state={state} ruleset={game.ruleset} world={world} version={version} onOpenPlayer={open} onOpenEvent={openEvent} />
        : <Federation onChanged={() => { changed(); void persist(); }} onOpen={open} onOpenEvent={openEvent} />}
    </main>
  );
}

function GoalTable({ goals, current }: { goals: FederationGoal[]; current?: (g: FederationGoal) => number }) {
  // Daftar bertumpuk (bukan tabel) agar tidak terpotong di kartu dashboard yang sempit.
  return (
    <ul className="goals">{goals.map((g) => {
      const now = current ? current(g) : g.achieved ?? 0;
      const show = (n: number) => (g.kind === 'team' ? levelName(n) : n);
      return (
        <li key={g.kind + (g.format ?? '')}>
          <b>{t(`goal_${g.kind}` as TextKey)}{g.format && `: ${formatName(g.format)}`}</b>
          <span>{t('target')}: {show(g.target)} · {t('progress')}: <span className={now >= g.target ? 'up' : ''}>{show(now)}</span></span>
        </li>
      );
    })}</ul>
  );
}

function Dashboard({ onOpen, onOpenEvent }: { onOpen: (id: string) => void; onOpenEvent: (id: string, year: number) => void }) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId;
  const { year, week } = state.date;
  const [back, setBack] = useState(0); // 0 = minggu terakhir yang punya hasil
  // Ranking BWF saat ini: 10 besar dunia per nomor + perubahan dibanding snapshot ≥ 4 minggu lalu.
  const { version } = useGame();
  const [rankD, setRankD] = useState<Discipline>('MS');
  const top10 = useMemo(() => {
    const now = absWeek(state.date);
    const prev = state.rankSnapshots.filter((x) => x.discipline === rankD && x.absWeek <= now - 4).at(-1);
    return computeRanking(state.results, rankD, now, ruleset).slice(0, 10)
      .map((r) => { const i = prev?.ids.indexOf(r.entrantId) ?? -1; return { id: r.entrantId, rank: r.rank, points: r.points, delta: i < 0 ? undefined : i + 1 - r.rank }; });
  }, [version, rankD]);
  const upcoming = [...ruleset.calendar, ...ruleset.team.events.map((e) => ({ ...e, tierId: t('teamShort') }))]
    .filter((e) => isHeld(e, year) && e.week >= week && e.week < week + 4)
    .sort((a, b) => a.week - b.week);
  const city = (id: string) => dataName(world.cities.find((c) => c.id === id)?.name);

  // Hasil turnamen: minggu-minggu lampau yang diikuti negara ini (tahun*100 + minggu), bisa dimaju-mundurkan.
  const weekOf = new Map([...ruleset.calendar, ...ruleset.team.events].map((e) => [e.id, e.week]));
  const teamEventIds = new Set(ruleset.team.events.map((e) => e.id));
  const playerCountry = new Map(state.players.map((p) => [p.id, p.countryId]));
  const mine = new Set([
    ...state.players.filter((p) => p.countryId === managed).map((p) => p.id),
    ...state.pairs.filter((p) => playerCountry.get(p.playerIds[0]) === managed).map((p) => p.id),
  ]);
  const myTeams = state.teamResults.filter((r) => r.teams.includes(managed ?? ''));
  const resultWeeks = [...new Set([
    ...state.matches.filter((m) => mine.has(m.sides[0]) || mine.has(m.sides[1])).map((m) => m.year * 100 + (weekOf.get(m.tournamentId) ?? 0)),
    ...myTeams.map((r) => r.year * 100 + (weekOf.get(r.eventId) ?? 0)),
  ])].filter((k) => k % 100 > 0 && k < year * 100 + week).sort((a, b) => a - b);
  const sel = resultWeeks[Math.max(0, resultWeeks.length - 1 - back)];
  const selYear = Math.floor((sel ?? 0) / 100), selWeek = (sel ?? 0) % 100;
  // Laga terakhir tiap peserta negara ini di turnamen minggu terpilih.
  const last = new Map<string, { event: string; id: string; m: Match; i: 0 | 1 }>();
  for (const m of state.matches) {
    if (m.year !== selYear || weekOf.get(m.tournamentId) !== selWeek || teamEventIds.has(m.tournamentId)) continue; // partai beregu: lihat baris Tim
    m.sides.forEach((side, i) => {
      if (mine.has(side)) last.set(`${m.tournamentId}:${side}`, { event: m.tournamentId, id: side, m, i: i as 0 | 1 });
    });
  }
  // Per turnamen, urut dari babak terjauh (juara dulu).
  const reachedOf = (r: { m: Match; i: 0 | 1 }) => (r.m.winner === r.i && r.m.round === 'F' ? 'W' : r.m.round);
  const byEvent = groupBy([...last.values()], (r) => r.event);
  for (const list of byEvent.values()) list.sort((a, b) => ROUND_ORDER.indexOf(reachedOf(a)) - ROUND_ORDER.indexOf(reachedOf(b)));
  const byWeek = groupBy(upcoming, (e) => e.week);
  // Beregu minggu terpilih: babak terakhir negara ini per format.
  const lastTeam = myTeams.filter((r) => r.year === selYear && weekOf.get(r.eventId) === selWeek);
  const injured = state.players.filter((p) => p.countryId === managed && p.injury && p.retired === undefined);
  const lastReport = state.career?.reports.at(-1);

  return (
    <div className="dash">
      {!managed && <p>{t('observerNote')}</p>}
      {managed && (
        <section className="card">
          <h3>{t('goals')} {year}</h3>
          <GoalTable goals={state.career!.goals} current={(g) => goalProgress(state, ruleset, managed, g)} />
        </section>
      )}
      {lastReport && week <= 4 && (
        <section className="card">
          <h3>{t('seasonEndReport')} {lastReport.year}: {t('grade')} {lastReport.grade} ({lastReport.reputationChange >= 0 ? '+' : ''}{lastReport.reputationChange} {t('reputation')})</h3>
          <GoalTable goals={lastReport.goals} />
        </section>
      )}
      <section className="card">
        <h3>{t('upcoming')}</h3>
        {upcoming.length === 0 ? <p>—</p> : [...byWeek].map(([w, list]) => (
          <div key={w} className="dlist">
            <h4>{t('week')} {w}</h4>
            {list.map((e) => (
              <div key={e.id} className="drow">
                <span className="chip">{ruleset.tiers.find((x) => x.id === e.tierId)?.junior ? t('juniorShort') : e.tierId}</span>
                <span className="grow"><b>{eventName(ruleset, e.id, year)}</b> <small className="muted-text">{city(e.cityId)}</small></span>
              </div>
            ))}
          </div>
        ))}
      </section>
      {managed && (
        <section className="card tall">
          <h3>{t('tournamentResults')}</h3>
          {sel !== undefined && (
            <div className="pager">
              <button aria-label={t('prevWeek')} disabled={back >= resultWeeks.length - 1} onClick={() => setBack(back + 1)}>‹</button>
              <b>{t('week')} {selWeek} · {selYear}</b>
              <button aria-label={t('nextWeek')} disabled={back === 0} onClick={() => setBack(back - 1)}>›</button>
            </div>
          )}
          {lastTeam.map((r) => {
            const reached = r.reached[managed!];
            return (
              <div key={r.eventId + r.format} className={`drow${reached === 'W' ? ' champ' : ''}`}>
                <span className="chip">{t('teamShort')}</span>
                <span className="grow"><b><EventLink id={r.eventId} year={r.year} onOpen={onOpenEvent} /> · {formatName(r.format)}</b></span>
                <span className={`badge${reached === 'W' ? ' gold' : reached === 'F' || reached === 'SF' ? ' good' : ''}`}>{reached === 'W' ? `🏆 ${t('champion')}` : reached ?? t('group')}</span>
              </div>
            );
          })}
          {last.size === 0 && lastTeam.length === 0 ? <p>—</p> : (
            [...byEvent].map(([event, list]) => (
              <div key={event} className="dlist">
                <h4><EventLink id={event} year={selYear} onOpen={onOpenEvent} /></h4>
                {list.map(({ id, m, i }) => {
                  const reached = reachedOf({ m, i });
                  const opp = m.sides[1 - i];
                  return (
                    <div key={id} className={`drow${reached === 'W' ? ' champ' : ''}`}>
                      <span className="chip">{m.discipline}</span>
                      <span className="grow">
                        <a href="#" onClick={(e) => { e.preventDefault(); onOpen(state.pairs.find((p) => p.id === id)?.playerIds[0] ?? id); }}>{entrantLabel(state, id).name}</a>
                        <small className="muted-text">{m.winner === i ? t('wins') : t('lost')} vs <Flag id={opp} />{entrantLabel(state, opp).name} · <MatchLink m={m} name={(x) => entrantLabel(state, x).name} title={eventName(ruleset, m.tournamentId, m.year)}>{m.scores.map((g) => `${g[i]}-${g[1 - i]}`).join(', ')}</MatchLink></small>
                      </span>
                      <span className={`badge${reached === 'W' ? ' gold' : reached === 'F' || reached === 'SF' ? ' good' : ''}`}>{reached === 'W' ? `🏆 ${t('champion')}` : reached}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </section>
      )}
      <section className="card">
        <h3>{t('bwfRankNow')}</h3>
        <nav className="controls subnav">
          {DISCIPLINES.map((d) => <button key={d} aria-pressed={d === rankD} onClick={() => setRankD(d)}>{d}</button>)}
        </nav>
        {top10.length === 0 ? <p className="hint">—</p> : top10.map((r) => {
          const mine = entrantLabel(state, r.id).country === managed;
          return (
            <div key={r.id} className={`drow${mine ? ' mine-row' : ''}`}>
              <span className="badge">{r.rank}</span>
              <span className="grow">
                <a href="#" onClick={(e) => { e.preventDefault(); onOpen(state.pairs.find((p) => p.id === r.id)?.playerIds[0] ?? r.id); }}><Flag id={r.id} />{entrantLabel(state, r.id).name}</a>
              </span>
              <span className="pts">{r.points.toLocaleString(numLocale())}</span>
              <span className="delta">{r.delta ? <span className={r.delta > 0 ? 'up' : 'down'}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span> : <span className="muted-text">–</span>}</span>
            </div>
          );
        })}
      </section>
      {managed && injured.length > 0 && (
        <section className="card">
          <h3>{t('injuries')}</h3>
          {injured.map((p) => {
            const back = state.date.week + p.injury!.weeksLeft;
            // Sektor utama: tunggal, atau nomor ganda pasangan utamanya (spesialis ganda).
            const sector = p.focus !== 'D' ? (p.gender === 'M' ? 'MS' : 'WS')
              : state.pairs.find((x) => !x.dissolved && !x.trial && !x.adHoc && x.playerIds.includes(p.id))?.discipline ?? (p.gender === 'M' ? 'MD' : 'WD');
            return (
              <div key={p.id} className="drow">
                <span className="chip">{sector}</span>
                <span className="grow">
                  <a href="#" onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a>
                  <small className="muted-text">{p.injury!.severe ? t('injurySevereLong') : t('injuryMinorLong')} · {t('returnsWeek', { w: back > 52 ? back - 52 : back })}</small>
                </span>
                <span className={`badge danger${p.injury!.severe ? ' strong' : ''}`}>🩹 {t('weeksShort', { n: p.injury!.weeksLeft })}</span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Federation({ onChanged, onOpen, onOpenEvent }: { onChanged: () => void; onOpen: (id: string) => void; onOpenEvent: (id: string, year: number) => void }) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const [next, setNext] = useState(state.career?.countryId ?? '');
  const reports = state.career?.reports ?? [];
  const country = state.career?.countryId;
  const { players } = lookup(state);
  const { year } = state.date;
  const years = Object.keys(state.earnings).sort().reverse();
  const ofCountry = (y: string) => Object.entries(state.earnings[y]).filter(([id]) => players.get(id)?.countryId === country);
  const countryName = (id: string) => dataName(world.countries.find((c) => c.id === id)?.name) ?? id;
  // Gelar tahun berjalan per tier (urutan tier seperti ruleset: tertinggi dulu) + gelar beregu.
  const tierOfEvent = new Map(ruleset.calendar.map((e) => [e.id, e.tierId]));
  const titles = state.champions.filter((c) => c.year === year && entrantLabel(state, c.winner).country === country);
  const byTier = groupBy(titles, (c) => tierOfEvent.get(c.tournamentId) ?? '');
  const teamTitles = state.teamResults.filter((r) => r.year === year && country && r.reached[country] === 'W');
  const person = (id: string) => lookup(state).pairs.get(id)?.playerIds[0] ?? id;
  // Ringkasan: atlet aktif, turnamen diikuti & rekor laga tahun ini (individu + beregu).
  const squad = state.players.filter((p) => p.countryId === country && p.retired === undefined);
  const juniorCount = squad.filter((p) => ageAt(p.birth, state.date) <= JUNIOR_MAX_AGE).length;
  const mineIds = new Set([...squad.map((p) => p.id), ...state.pairs.filter((x) => players.get(x.playerIds[0])?.countryId === country).map((x) => x.id)]);
  const played = new Set<string>();
  let won = 0, lost = 0;
  for (const m of state.matches) {
    if (m.year !== year) continue;
    const i = mineIds.has(m.sides[0]) ? 0 : mineIds.has(m.sides[1]) ? 1 : -1;
    if (i < 0) continue;
    played.add(m.tournamentId);
    if (m.winner === i) won++; else lost++;
  }
  return (
    <div className="dash">
      {country && (
        <section className="card">
          <h3><Flag id={country} />{countryName(country)}</h3>
          <div className="stats">
            {[
              [t('statPlayers'), squad.length], [t('men'), squad.filter((p) => p.gender === 'M').length], [t('women'), squad.filter((p) => p.gender === 'F').length],
              [t('seniors'), squad.length - juniorCount], [t('juniors'), juniorCount], [t('reputation'), `${state.career!.reputation}/100`],
              [t('statEvents', { y: year }), played.size], [t('statRecord', { y: year }), `${won}–${lost}`], [t('titlesYear', { y: year }), titles.length + teamTitles.length],
            ].map(([label, value]) => <div key={String(label)}><b>{value}</b><small>{label}</small></div>)}
          </div>
        </section>
      )}
      {country && (
        <section className="card">
          <h3>{t('titlesYear', { y: year })}</h3>
          {titles.length + teamTitles.length === 0 ? <p className="hint">{t('noTitles')}</p> : <>
            {ruleset.tiers.filter((tier) => byTier.has(tier.id)).map((tier) => (
              <div key={tier.id} className="dlist">
                <h4>{dataName(tier.name)} <small className="muted-text">{byTier.get(tier.id)!.length}</small></h4>
                {byTier.get(tier.id)!.map((c) => (
                  <div key={c.tournamentId + c.discipline} className="drow champ">
                    <span className="chip">{c.discipline}</span>
                    <span className="grow">
                      <a href="#" onClick={(e) => { e.preventDefault(); onOpen(person(c.winner)); }}>{entrantLabel(state, c.winner).name}</a>
                      <small className="muted-text"><EventLink id={c.tournamentId} year={year} onOpen={onOpenEvent} /></small>
                    </span>
                    <span className="badge gold">🏆</span>
                  </div>
                ))}
              </div>
            ))}
            {teamTitles.length > 0 && (
              <div className="dlist">
                <h4>{t('teamShort')} <small className="muted-text">{teamTitles.length}</small></h4>
                {teamTitles.map((r) => (
                  <div key={r.eventId + r.format} className="drow champ">
                    <span className="chip">{t('teamShort')}</span>
                    <span className="grow">{formatName(r.format)} <small className="muted-text"><EventLink id={r.eventId} year={year} onOpen={onOpenEvent} /></small></span>
                    <span className="badge gold">🏆</span>
                  </div>
                ))}
              </div>
            )}
          </>}
        </section>
      )}
      {country && years.length > 0 && (
        <section className="card">
          <h3>{t('prizeMoney')}</h3>
          <table>
            <tbody>{years.map((y) => <tr key={y}><td>{y}</td><td className="num"><b>{usd(ofCountry(y).reduce((s, [, v]) => s + v, 0))}</b></td></tr>)}</tbody>
          </table>
          <h4>{t('topEarners')} {years[0]}</h4>
          {ofCountry(years[0]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v], i) => (
            <div key={id} className="drow">
              <span className="badge">{i + 1}</span>
              <span className="grow"><a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{players.get(id)!.name}</a></span>
              <span className="num">{usd(v)}</span>
            </div>
          ))}
        </section>
      )}
      <section className="card wide">
        <h3>{t('reports')}</h3>
        {reports.length === 0 ? <p className="hint">—</p> : (
          <div className="scroll">
            <table>
              <thead><tr><th>{t('year')}</th><th>{t('country')}</th><th>{t('grade')}</th><th className="num">{t('goal_titles')}</th><th className="num">{t('goal_top10')}</th><th>{t('goal_team')}</th><th className="num">{t('violations')}</th><th className="num">{t('reputation')}</th></tr></thead>
              <tbody>{[...reports].reverse().map((r) => {
                const g = (k: string) => r.goals.find((x) => x.kind === k);
                return (
                  <tr key={r.year}><td>{r.year}</td><td><Flag id={r.countryId} />{r.countryId}</td><td><b>{r.grade}</b></td>
                    <td className="num">{g('titles')?.achieved}/{g('titles')?.target}</td><td className="num">{g('top10')?.achieved}/{g('top10')?.target}</td>
                    <td>{r.goals.filter((x) => x.kind === 'team').map((x) => `${formatName(x.format!)}: ${levelName(x.achieved ?? 0)} / ${levelName(x.target)}`).join(' · ')}</td>
                    <td className="num">{r.violations}</td><td className={`num ${r.reputationChange >= 0 ? 'up' : 'down'}`}>{r.reputationChange >= 0 ? '+' : ''}{r.reputationChange}</td></tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
      <section className="card">
        <h3>{t('changeCountry')}</h3>
        <div className="controls">
          <select value={next} onChange={(e) => setNext(e.target.value)}>
            {world.countries.map((c) => <option key={c.id} value={c.id}>{dataName(c.name)}</option>)}
            <option value="">{t('observer')}</option>
          </select>
          <button disabled={next === (state.career?.countryId ?? '')} onClick={() => {
            if (!confirm(t('confirmChangeCountry'))) return;
            switchCountry(state, ruleset, next || null);
            onChanged();
          }}>{t('changeCountry')}</button>
        </div>
      </section>
    </div>
  );
}

/** Nama turnamen yang bisa diklik → halaman turnamen. */
const ROUND_ORDER: string[] = [...ROUNDS, 'G', 'Q3', 'Q2', 'Q1'];
// ponytail: pengganti Map.groupBy (ES2024, belum ada di Safari lama).
function groupBy<T, K>(xs: T[], key: (x: T) => K) {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
}

export function EventLink({ id, year, onOpen }: { id: string; year: number; onOpen: (id: string, year: number) => void }) {
  const { game } = useGame();
  return <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id, year); }}>{eventName(game.ruleset, id, year) ?? id}</a>;
}
