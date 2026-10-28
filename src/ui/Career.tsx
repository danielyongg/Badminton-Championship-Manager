import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { weekRunning } from './UpdateBar';
import { matchConfigFor, simulateMatch, type MatchResult } from '../engine/match';
import type { DrawHook, DrawShow, EntriesHook, EntriesShow, LiveHook, LiveRequest } from '../engine/tournament';
import { CHALLENGE_DEADLINE_WEEK, CHALLENGE_PENALTY, CHALLENGE_REWARD, challengeProgress, goalProgress, goalWeight, targetReport } from '../engine/career';
import { ageAt, isJuniorAge } from '../engine/generator';
import { entrantsFor, forgetPlayer, hasHistory, hostCityId, isHeld, openTo, teamFormatsIn, weekOf, switchCountry, type ChooseEvent, type SeasonState, type TeamHook } from '../engine/season';
import type { RoundHook, RoundShow } from '../engine/gate';
import type { Lineup, TeamEntrant } from '../engine/team';
import type { MatchRound } from '../engine/knockout';
import { DISCIPLINES, ROUNDS, type Discipline, type Match, type TeamFormat } from '../engine/types';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { AWARD_CATS } from '../engine/awards';
import { weeklyNews, type NewsItem } from '../engine/news';
import type { Challenge, FederationGoal, Ruleset, SeasonReport, TournamentDef } from '../engine/types';
import { dataName, numLocale, t, type TextKey } from '../i18n';
import { downloadPack, Editor, useDebounced } from './Editor';
import { ContingentStatus, Entries, EntryBadge } from './Entries';
import { LangSelect } from './LangSelect';
import { ThemeSelect } from './ThemeSelect';
import { Flag } from './Flag';
import { LiveDraw } from './LiveDraw';
import { LiveMatch, PreMatch } from './LiveMatch';
import { advance, entrantLabel, eventName, teamLabel, lookup, saveGame, useGame, TierBadge } from './game';
import { SeasonViews } from './Ranking';
import { arrow, injuryText, isBadInjury, Profile, Squad, TraitTags, usd } from './Squad';
import { quarterReport } from '../engine/development';
import { autoPick, recruit, recruitSome, SCOUTING_DEADLINE_WEEK, starRangeAt, styleOf } from '../engine/scouting';
import { ScoutFocusSelect } from './Squad';
import { currentAbility } from '../engine/generator';
import { formatName, levelName, SquadModal, Team, TieLineupModal } from './Team';
import { TournamentView } from './TournamentView';
import { MatchLink } from './MatchDetail';
import { EntriesScreen, RoundScreen, rowKey, WeekScreen, type WeekAsk } from './WeekFlow';

type Tab = 'dashboard' | 'squad' | 'entries' | 'team' | 'world' | 'federation' | 'editor' | 'settings';

export function CareerShell({ onQuit, onLang }: { onQuit: () => void; onLang: () => void }) {
  const { game, version, changed } = useGame();
  const { state, world } = game;
  const managed = state.career?.countryId ?? null;
  const [tab, setTab] = useState<Tab>('dashboard');
  const [worldD, setWorldD] = useState<Discipline>('MS'); // nomor awal World → Ranking (tombol ranking lengkap di dashboard)
  const [profileId, setProfileId] = useState<string>();
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [busy, setBusy] = useState(false);
  const [simWeek, setSimWeek] = useState<number>(); // minggu yang sedang disimulasikan (lanjut beberapa minggu)
  const stop = useRef(false);
  const [live, setLive] = useState<{ req: LiveRequest; mySide: 0 | 1; resolve: (r: MatchResult) => void }>();
  const autoRest = useRef(new Set<string>()); // format beregu (Thomas/Uber terpisah) yang line-up-nya otomatis sampai turnamen selesai
  type TeamAsk = { eventId: string; format: TeamFormat; pool: Record<string, TeamEntrant[]> } & (
    | { kind: 'squad'; suggested: string[]; resolve: (v: string[]) => void }
    | { kind: 'lineup'; round: MatchRound; opponent: string; squad: string[]; suggested: Lineup; resolve: (v: Lineup) => void });
  const [teamAsk, setTeamAsk] = useState<TeamAsk>();

  // Hook di bawah hanya dipakai untuk turnamen yang dipilih manajer di layar "Turnamen minggu ini".
  // Beregu: pop-up skuad (bila belum di-submit) & line-up sebelum tiap pertandingan (kecuali "Otomatis sisa turnamen").
  const teamHook: TeamHook = {
    squad: (req) => (!state.entriesSubmitted?.[`${state.date.year}:${req.eventId}`] ? new Promise((resolve) => setTeamAsk({ ...req, kind: 'squad', resolve })) : null),
    lineup: (req) => (autoRest.current.has(req.format) || skipEvent.current ? null : new Promise((resolve) => setTeamAsk({ ...req, kind: 'lineup', resolve }))),
  };
  // Pilih turnamen minggu ini; tiap turnamen dimulai tanpa "lewati".
  const [weekAsk, setWeekAsk] = useState<WeekAsk & { resolve: (id: string | null) => void }>();
  // Halaman turnamen yang sedang dimainkan (menggantikan pop-up): tab "Turnamen" di menu selama minggu turnamen berjalan.
  const [playing, setPlaying] = useState<string>(); // turnamen yang sedang dimainkan
  const [hubAway, setHubAway] = useState(false); // manajer membuka tab lain; bilah bawah untuk kembali
  const [hubTab, setHubTab] = useState<'schedule' | 'details'>('schedule');
  const chooseEvent: ChooseEvent = (req) => new Promise((resolve) => setWeekAsk({ ...req, resolve: (id) => {
    setPlaying(id ?? undefined);
    setHubTab('schedule');
    autoRest.current = new Set();
    skipDraw.current = false;
    skipEvent.current = false;
    resolve(id);
  } }));
  // Live drawing tiap nomor turnamen yang dimainkan ("Lewati drawing" = sisa nomor turnamen itu).
  const [drawAsk, setDrawAsk] = useState<{ d: DrawShow; resolve: () => void }>();
  const skipDraw = useRef(false);
  const drawHook: DrawHook = (d) => (skipDraw.current ? null : new Promise<void>((resolve) => setDrawAsk({ d, resolve })));
  // Daftar entry semua nomor sebelum undian ("Lewati drawing" = langsung ke jadwal).
  const [entriesAsk, setEntriesAsk] = useState<{ e: EntriesShow; resolve: () => void }>();
  const entriesHook: EntriesHook = (e) => (skipDraw.current ? null : new Promise<void>((resolve) => setEntriesAsk({ e, resolve })));
  // Layar babak: sebelum (pasangan laga) & sesudah (skor). "Simulasikan sisa babak" berlaku sampai babak berikutnya.
  const [roundAsk, setRoundAsk] = useState<{ show: RoundShow; resolve: () => void }>();
  const skipRound = useRef(false);
  const roundTab = useRef<string>(undefined); // tab nomor terakhir di layar babak
  const skipRows = useRef(new Set<string>()); // baris laga atlet sendiri yang di-Skip
  const currentRow = useRef('');
  // "Simulasikan sisa turnamen": tanpa layar babak, Live Match, line-up & drawing sampai turnamen itu selesai.
  const skipEvent = useRef(false);
  const skipTournament = () => {
    skipEvent.current = skipRound.current = skipDraw.current = true;
    const ask = roundAsk;
    setRoundAsk(undefined);
    if (ask && ask.show.phase !== 'playing') ask.resolve(); // babak yang menunggu klik langsung lanjut
    // Pop-up yang sedang terbuka ikut diselesaikan otomatis (laga disimulasikan, line-up saran dipakai).
    if (live) { setLive(undefined); live.resolve(simulateMatch(live.req.sides, matchConfigFor(game.ruleset.match, state.date.year), game.rng)); }
    if (teamAsk?.kind === 'lineup') { setTeamAsk(undefined); teamAsk.resolve(teamAsk.suggested); }
  };
  const roundHook: RoundHook = (show) => {
    if (skipEvent.current) return null;
    const snap = { ...show, matches: show.matches.map((m) => ({ ...m })) }; // salinan baru → layar digambar ulang
    if (show.phase === 'pending') { skipRound.current = false; skipRows.current = new Set(); }
    if (show.phase !== 'playing') return new Promise<void>((resolve) => setRoundAsk({ show: snap, resolve }));
    // Laga demi laga: jeda singkat agar skor terlihat terisi satu per satu; laga Live langsung membuka pop-up.
    const m = show.matches[show.current!];
    currentRow.current = rowKey(m);
    setRoundAsk({ show: snap, resolve: () => {} });
    const mine = m.sides.some((id) => id === managed || entrantLabel(state, id).country === managed);
    return skipRound.current || (mine && !skipRows.current.has(currentRow.current)) ? null : new Promise<void>((r) => setTimeout(r, 100));
  };
  const nameOfCountry = (id: string) => dataName(world.countries.find((c) => c.id === id)?.name) ?? id;
  const teamTitle = (eventId: string) => eventName(game.ruleset, eventId, state.date.year) ?? eventId;

  // Tiap laga atlet negara sendiri di turnamen yang dimainkan tampil Live; sisanya langsung disimulasikan.
  const hook: LiveHook = (req) => {
    if (skipRound.current || skipRows.current.has(currentRow.current)) return null;
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
    weekRunning.on = true;
    stop.current = false;
    // Maju dari halaman turnamen/profil: langsung tampilkan halaman turnamen minggu ini, bukan hanya bilah "kembali".
    setHubAway(false); setProfileId(undefined); setEventView(undefined); window.scrollTo(0, 0);
    for (let i = 0; i < weeks && !stop.current; i++) {
      if (weeks > 1) setSimWeek(state.date.week);
      // Maju beberapa minggu = serba otomatis; 1 minggu = pilih turnamen yang dimainkan per babak.
      await advance(game, 1, weeks > 1 || !managed ? {} : { chooseEvent, round: roundHook, live: hook, team: teamHook, draw: drawHook, entries: entriesHook });
      // Beri kesempatan browser menggambar ulang & menerima klik (Berhenti) di antara minggu → UI tidak membeku.
      await new Promise((r) => setTimeout(r, 0));
    }
    setSimWeek(undefined);
    setPlaying(undefined);
    setHubAway(false);
    setBusy(false);
    weekRunning.on = false;
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
  // Kembali dari halaman turnamen (tombol Kembali / setelah Submit entry): gulir ke baris turnamen itu (Kalender/Dashboard) & sorot sebentar.
  const backFromEvent = (id: string) => {
    setEventView(undefined);
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-ev="${id}"]`);
      if (!row) return;
      row.scrollIntoView({ block: 'center' });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 1500);
    });
  };

  const hubOn = !!managed && (!!weekAsk || !!playing);
  const hubTitle = playing ? eventName(game.ruleset, playing, state.date.year) : `${t('weekEvents')} · ${t('week')} ${state.date.week}`;
  const hub = weekAsk ? <WeekScreen ask={weekAsk} onPick={(id) => { setWeekAsk(undefined); weekAsk.resolve(id); }} /> : playing && (
    <div>{/* bukan anak langsung <main>: sub-menu tidak ikut menempel di atas seperti menu tab */}
      <nav className="controls subnav">
        <button aria-pressed={hubTab === 'schedule'} onClick={() => setHubTab('schedule')}>{t('schedule')}</button>
        <button aria-pressed={hubTab === 'details'} onClick={() => setHubTab('details')}>{t('tournamentDetails')}</button>
      </nav>
      {hubTab === 'details' ? <TournamentView key={playing} id={playing} year={state.date.year} onOpenPlayer={open} />
      : entriesAsk ? (
        <EntriesScreen key={entriesAsk.e.tournamentId} show={entriesAsk.e}
          onDraw={() => { setEntriesAsk(undefined); entriesAsk.resolve(); }}
          onSkipDraw={() => { skipDraw.current = true; setEntriesAsk(undefined); entriesAsk.resolve(); }} />
      )
      : drawAsk ? (
        <LiveDraw page key={`${drawAsk.d.tournamentId}-${drawAsk.d.discipline}`} show={drawAsk.d}
          title={`${eventName(game.ruleset, drawAsk.d.tournamentId, state.date.year)}${drawAsk.d.discipline ? ` · ${drawAsk.d.discipline}` : ''}`}
          qualTitle={eventName(game.ruleset, drawAsk.d.tournamentId, state.date.year)}
          name={(id) => (drawAsk.d.discipline ? `${entrantLabel(state, id).name} (${entrantLabel(state, id).country})` : nameOfCountry(id))}
          mine={(id) => (drawAsk.d.discipline ? entrantLabel(state, id).country === managed : id === managed)}
          onClose={() => { setDrawAsk(undefined); drawAsk.resolve(); }}
          onSkipEvent={() => { skipDraw.current = true; }} />
      )
      : roundAsk ? (
        <RoundScreen key={`${roundAsk.show.tournamentId}-${roundAsk.show.round}`} show={roundAsk.show} skipped={skipRows.current}
          tab={roundTab.current} onTab={(k) => { roundTab.current = k; }} onSkipRest={() => { skipRound.current = true; }} onSkipEvent={skipTournament}
          onNext={() => { if (roundAsk.show.phase !== 'pending') setRoundAsk(undefined); roundAsk.resolve(); }} />
      )
      : <section className="card hub"><p className="muted">…</p></section>}
    </div>
  );
  const showHub = hubOn && !hubAway && !profileId && !eventView;

  return (
    <main>
      <header className="controls shell">
        <span className="title"><b>{countryName}</b> <span className="date">{state.date.year} · {t('week')} {state.date.week}</span></span>
        <span className="meta">
          {managed && <span>{t('reputation')}: {state.career!.reputation}</span>}
          <small>{status === 'saving' ? t('saving') : status === 'saved' ? t('saved') : ''}</small>
        </span>
        {/* Tombol maju: di HP jadi bilah tetap di bawah layar (mudah dijangkau jempol). */}
        {!hubOn && <div className="advbar">
          {simWeek !== undefined && <span className="simulating">{t('simulating', { w: simWeek })} <button onClick={() => { stop.current = true; }}>{t('stop')}</button></span>}
          <button className="primary" disabled={busy} onClick={() => go(1)}>{t('advance1')}</button>
          <button disabled={busy} onClick={() => go(4)}>{t('advance4')}</button>
          <button disabled={busy} onClick={() => go(weeksToSeasonEnd)}>{t('advanceSeason')}</button>
        </div>}
        <button className="menu-btn" disabled={busy} onClick={onQuit}>{t('mainMenu')}</button>
      </header>
      {live && (
        <LiveMatch
          key={`${live.req.tournamentId}-${live.req.entrants.join('-')}-${live.req.round}`}
          sides={live.req.sides}
          names={[entrantLabel(state, live.req.entrants[0]).name, entrantLabel(state, live.req.entrants[1]).name]}
          ids={[entrantLabel(state, live.req.entrants[0]).country, entrantLabel(state, live.req.entrants[1]).country]}
          mySide={live.mySide}
          cfg={matchConfigFor(game.ruleset.match, state.date.year)}
          rng={game.rng}
          title={`${eventName(game.ruleset, live.req.tournamentId, state.date.year)} · ${live.req.discipline} ${live.req.round}`}
          preview={<PreMatch state={state} ruleset={game.ruleset} req={live.req} mySide={live.mySide} />}
          onDone={(r) => { setLive(undefined); live.resolve(r); }}
          onSkipRound={() => { skipRound.current = true; }}
        />
      )}
      {teamAsk?.kind === 'squad' && (
        <SquadModal key={`${teamAsk.eventId}-${teamAsk.format}`} title={teamTitle(teamAsk.eventId)} eventId={teamAsk.eventId} format={teamAsk.format} pool={teamAsk.pool}
          suggested={teamAsk.suggested} onDone={(v) => { setTeamAsk(undefined); teamAsk.resolve(v); }} />
      )}
      {teamAsk?.kind === 'lineup' && (
        <TieLineupModal key={`${teamAsk.eventId}-${teamAsk.format}-${teamAsk.round}-${teamAsk.opponent}`} title={teamTitle(teamAsk.eventId)} eventId={teamAsk.eventId}
          format={teamAsk.format} round={teamAsk.round} opponent={teamAsk.opponent} pool={teamAsk.pool} squad={teamAsk.squad} suggested={teamAsk.suggested}
          onDone={(v) => { setTeamAsk(undefined); teamAsk.resolve(v); }} onAuto={() => { autoRest.current.add(teamAsk.format); }} />
      )}
      <nav className="controls maintabs">
        {hubOn && <button aria-pressed={showHub} onClick={() => { setHubAway(false); setProfileId(undefined); setEventView(undefined); }}>🏸 {t('tabLive')}</button>}
        {tabs.map((x) => <button key={x} aria-pressed={!showHub && tab === x && !profileId && !eventView} onClick={() => { setTab(x); setHubAway(true); setProfileId(undefined); setEventView(undefined); }}>{t(tabLabel[x])}</button>)}
      </nav>
      <div className="page">
      {hubOn && !showHub && (
        <div className="livebar card">
          🏸 <b>{hubTitle}</b>
          <button className="primary" onClick={() => { setHubAway(false); setProfileId(undefined); setEventView(undefined); window.scrollTo(0, 0); }}>{t('openRound')}</button>
        </div>
      )}
      {showHub ? hub
        : profileId ? <Profile id={profileId} onBack={() => setProfileId(undefined)} onOpen={open} onOpenEvent={openEvent} />
        : eventView ? <TournamentView key={`${eventView.id}-${eventView.year}`} id={eventView.id} year={eventView.year} onOpenPlayer={open} onBack={() => backFromEvent(eventView.id)} />
        : tab === 'settings' ? (
          <section className="card">
            <h3>{t('settings')}</h3>
            <div className="settings-form">
              <LangSelect onChange={onLang} />
              <ThemeSelect />
            </div>
          </section>
        )
        : tab === 'dashboard' ? <Dashboard onOpen={open} onOpenEvent={openEvent} onFullRanking={(d) => { setWorldD(d); setTab('world'); window.scrollTo(0, 0); }} />
        : tab === 'squad' ? <Squad onOpen={open} />
        : tab === 'entries' ? <Entries onOpenEvent={openEvent} />
        : tab === 'team' ? <Team />
        : tab === 'editor' ? (
          <Editor data={{ ruleset: game.ruleset, world, players: state.players, pairs: state.pairs }} mode="save" date={state.date} country={managed ?? undefined}
            onChange={() => { changed(); persistSoon(); }} toolbar={<button onClick={exportSave}>{t('export')}</button>}
            canDelete={(p) => !hasHistory(state, p.id)} onDelete={(p, pairIds) => { forgetPlayer(state, p.id, pairIds); changed(); void persist(); }} />
        )
        : tab === 'world' ? <SeasonViews key={worldD} initialDiscipline={worldD} state={state} ruleset={game.ruleset} world={world} version={version} onOpenPlayer={open} onOpenEvent={openEvent} />
        : <Federation onChanged={() => { changed(); void persist(); }} onOpen={open} onOpenEvent={openEvent} />}
      </div>
    </main>
  );
}

/** Nama target: jenis + format beregu / event besar / tahun Olimpiade tujuan. */
function goalLabel(ruleset: Ruleset, g: FederationGoal, year: number) {
  // Multi-event: medali perorangan + beregu → nama event tanpa "Individual".
  if (g.kind === 'medals') return t(g.gold ? 'goal_gold' : 'goal_medals', { event: (eventName(ruleset, g.eventId!, year) ?? '').replace(/ Individual$/, '') });
  if (g.kind === 'olympic') return t('goal_olympic', { y: g.year! });
  return t(`goal_${g.kind}` as TextKey) + (g.format ? `: ${formatName(g.format)}` : '');
}
const goalKey = (g: FederationGoal) => g.kind + (g.format ?? '') + (g.eventId ?? '');

/**
 * Tahap target beregu musim ini: menunggu kualifikasi (kejuaraan kontinental), lolos / tidak lolos ke putaran final,
 * lalu hasil akhirnya.
 */
function teamStatus(game: ReturnType<typeof useGame>['game'], format: TeamFormat, level: number) {
  const { state, ruleset: rs, world } = game;
  const { year, week } = state.date;
  const country = state.career!.countryId!;
  const has = (e: { formats?: TeamFormat[] }) => (e.formats ?? teamFormatsIn(rs, year)).includes(format);
  const finals = rs.team.events.find((e) => !e.confederation && !e.countries && isHeld(e, year) && has(e));
  const played = state.teamResults.some((r) => r.year === year && r.format === format && !r.confederation && !r.games);
  if (played) return t(`teamDone_${level}` as TextKey);
  if (level >= 1) return t('teamQualified', { w: finals ? weekOf(finals, year) : '—' });
  if (state.teamQualifiers?.[`${year}:${format}`]) return t('teamLevel_0');
  const conf = world.countries.find((c) => c.id === country)?.confederation;
  const cont = rs.team.events.find((e) => e.confederation === conf && isHeld(e, year) && has(e) && weekOf(e, year) >= week);
  return cont ? t('teamWaiting', { event: eventName(rs, cont.id, year) ?? cont.id, w: weekOf(cont, year) }) : t('teamWaitingRank');
}

function GoalTable({ goals, current, year, tagged, children }: { goals: FederationGoal[]; current?: (g: FederationGoal) => number; year: number; tagged?: boolean; children?: ReactNode }) {
  const { game } = useGame();
  // Daftar bertumpuk (bukan tabel) agar tidak terpotong di kartu dashboard yang sempit.
  return (
    <ul className="goals">{goals.map((g) => {
      const now = current ? current(g) : g.achieved ?? 0;
      const show = (n: number) => (g.kind === 'team' ? levelName(n) : n);
      const status = current && g.kind === 'team' ? teamStatus(game, g.format!, now) : show(now);
      return (
        <li key={goalKey(g)}>
          <b>{tagged && <span className="tag goal-kind">{t('goalTag')}</span>}{goalLabel(game.ruleset, g, year)}
            {goalWeight(g, year) > 1 && <small className="muted-text"> ({t('goalDouble')})</small>}
            {goalWeight(g, year) === 0 && <small className="muted-text"> ({t('goal_olympicLater', { y: g.year ?? year })})</small>}</b>
          <span>{t('target')}: {show(g.target)} · {t('progress')}: <span className={now >= g.target ? 'up' : ''}>{status}</span></span>
        </li>
      );
    })}{children}</ul>
  );
}

function challengeText(game: ReturnType<typeof useGame>['game'], c: Challenge, year: number) {
  const country = (id: string) => dataName(game.world.countries.find((x) => x.id === id)?.name) ?? id;
  return t(`ch_${c.kind}` as TextKey, { event: (c.eventId && eventName(game.ruleset, c.eventId, year)) || '', rival: c.rival ? country(c.rival) : '', n: c.target ?? 1 });
}

/**
 * Tantangan opsional musim (baris di kartu Target musim, bertanda "Tantangan"): pilih satu dari tiga sebelum batas
 * minggu; setelah dipilih tampil capaiannya.
 */
function ChallengeItems() {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const career = state.career!;
  const { year } = state.date;
  const pick = (c: Challenge) => { career.challenge = c; changed(); void saveGame(game); };
  const tag = <span className="tag goal-kind challenge">{t('challengeTag')}</span>;
  if (career.challenge) {
    const [now, target] = challengeProgress(state, ruleset, career.countryId!, career.challenge);
    return (
      <li>
        <b>{tag}{challengeText(game, career.challenge, year)}</b>
        <span>{t('progress')}: <span className={now >= target ? 'up' : ''}>{now}</span> / {target} · +{CHALLENGE_REWARD} / −{CHALLENGE_PENALTY} {t('reputation')}</span>
      </li>
    );
  }
  return (
    <>
      <li><b>{tag}{t('challengePick')}</b><span>{t('challengeHint', { w: CHALLENGE_DEADLINE_WEEK + 1, win: CHALLENGE_REWARD, lose: CHALLENGE_PENALTY })}</span></li>
      {career.challengeOptions!.map((c, i) => (
        <li key={i} className="choice"><span>{challengeText(game, c, year)}</span><button className="mini btn-go" onClick={() => pick(c)}>{t('challengeChoose')}</button></li>
      ))}
    </>
  );
}

/** Pencarian bakat junior: pilih kandidat untuk kursi putra/putri sebelum batas minggu (sisa kursi diisi otomatis). */
function ScoutingCard() {
  const { game, changed } = useGame();
  const { state } = game;
  const s = state.scouting!;
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const count = (g: 'M' | 'F') => s.candidates.filter((p) => p.gender === g && picked.includes(p.id)).length;
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  const done = () => { recruit(state, picked); changed(); void saveGame(game); };
  const some = () => { recruitSome(state, picked); setPicked([]); changed(); void saveGame(game); };
  const week = state.date.year === s.year ? state.date.week : 1; // rentang potensi menyempit tiap minggu
  const city = (id: string) => dataName(game.world.cities.find((c) => c.id === id)?.name);
  const half = (n: number) => `${Math.floor(n) || ''}${n % 1 ? '½' : ''}`; // 2.5 → "2½"
  const status = t(s.recruited ? 'scoutingStatusPartial' : 'scoutingStatus', { m: count('M'), f: count('F'), sm: s.slots.M, sf: s.slots.F, week: SCOUTING_DEADLINE_WEEK, n: s.recruited ?? 0 });
  return (
    <section className="card" style={open ? { gridColumn: '1 / -1' } : undefined}>
      <h3>{t('scouting')} {s.year}</h3>
      <p>{status}</p>
      {!open ? <button className="primary" onClick={() => setOpen(true)}>{t('scoutingOpen')}</button> : (
        <>
          <p className="hint">{t('scoutingHint', { week: SCOUTING_DEADLINE_WEEK })}</p>
          {!!s.withdrawn?.length && <p className="hint">{t('scoutWithdrawn', { names: s.withdrawn.join(', ') })}</p>}
          {(['M', 'F'] as const).filter((g) => s.candidates.some((p) => p.gender === g)).map((g) => (
            <div key={g} className="scroll">
              <h4>{t(g === 'M' ? 'men' : 'women')} · {count(g)}</h4>
              <table>
                <thead><tr><th>{t('name')}</th><th className="num">{t('age')}</th><th className="num">{t('ability')}</th><th>{t('potential')}</th></tr></thead>
                <tbody>{s.candidates.filter((p) => p.gender === g).map((p) => {
                  const [lo, hi] = starRangeAt(s, p, week);
                  return (
                    <tr key={p.id} className={picked.includes(p.id) ? 'sel' : undefined} onClick={() => toggle(p.id)} style={{ cursor: 'pointer' }}>
                      <td><input type="checkbox" checked={picked.includes(p.id)} readOnly /> {p.name}
                        <div className="entry-meta muted-text">
                          <span>{[...styleOf(p).map((a) => t(a)), p.hometown && city(p.hometown)].filter(Boolean).join(' · ')}</span>
                          {(s.notes?.[p.id] ?? []).map((n) => <span key={n} className="tag muted-tag" title={t(`traitHint_${n}` as TextKey)}>{t(`trait_${n}` as TextKey)}?</span>)}
                        </div>
                      </td>
                      <td className="num">{ageAt(p.birth, state.date)}</td>
                      <td className="num">{currentAbility(p.attrs)}</td>
                      <td className="stars">{half(lo)}–{half(hi)} ★</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          ))}
          <p className="controls scout-actions">
            <button onClick={() => setPicked(autoPick(s, picked))}>{t('autoPick')}</button>
            <button disabled={!picked.length} onClick={some}>{t('scoutRecruitSome')} ({picked.length})</button>
            <button className="primary" disabled={!picked.length && !s.recruited} onClick={done}>{t('scoutFinish')}{picked.length ? ` (${picked.length})` : ''}</button>
          </p>
          <ScoutFocusSelect />
        </>
      )}
    </section>
  );
}

/** Laporan perkembangan kuartal (4 minggu setelah akhir kuartal). */
function QuarterReportCard({ country, onOpen }: { country: string; onOpen: (id: string) => void }) {
  const { game } = useGame();
  const r = quarterReport(game.state.players, country, game.state.date);
  const rows = ([['qrRisers', '📈', r.risers], ['qrStalled', '⏸', r.stalled], ['qrDeclining', '📉', r.declining], ['qrRevealed', '🔍', r.revealed]] as const).filter(([, , ps]) => ps.length);
  if (!rows.length) return null;
  const { date } = game.state;
  // Kelompok bertumpuk: judul kecil + satu baris per atlet (usia · kemampuan, perubahan sebagai badge; sifat baru sebagai tag di kanan).
  return (
    <section className="card qreport">
      <h3>{t('quarterReport')}</h3>
      {rows.map(([k, icon, ps]) => (
        <div key={k} className="qgroup">
          <h4>{icon} {t(k)}</h4>
          {ps.map((p) => (
            <div key={p.id} className="drow">
              <span className="grow"><a href="#" onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a>
                <small className="muted-text"> {ageAt(p.birth, date)} {t('yearsShort')} · {currentAbility(p.attrs)}</small></span>
              {k === 'qrRevealed' && <TraitTags p={p} matches={0} />}
              {k !== 'qrRevealed' && !!p.caDelta && <span className={`badge ${p.caDelta > 0 ? 'q-up' : 'q-down'}`}>{arrow(p.caDelta).trim()}</span>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

function Dashboard({ onOpen, onOpenEvent, onFullRanking }: { onOpen: (id: string) => void; onOpenEvent: (id: string, year: number) => void; onFullRanking: (d: Discipline) => void }) {
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
  const upcoming = [...ruleset.calendar, ...ruleset.team.events.map((e) => ({ ...e, tierId: undefined, team: e }))] // beregu: badge dari event (Grade 1 / Multi-sport), sama dengan Kalender
    .filter((e) => isHeld(e, year) && weekOf(e, year) >= week && weekOf(e, year) < week + 4 && (!managed || openTo(e, managed, world)))
    .sort((a, b) => weekOf(a, year) - weekOf(b, year));
  const city = (id: string) => dataName(world.cities.find((c) => c.id === id)?.name);

  // Hasil turnamen: minggu-minggu lampau yang diikuti negara ini (tahun*100 + minggu), bisa dimaju-mundurkan.
  const defs = new Map([...ruleset.calendar, ...ruleset.team.events].map((e) => [e.id, e]));
  const weekIn = (id: string, y: number) => { const e = defs.get(id); return e ? weekOf(e, y) : 0; }; // minggu event di tahun itu
  const teamEventIds = new Set(ruleset.team.events.map((e) => e.id));
  const playerCountry = new Map(state.players.map((p) => [p.id, p.countryId]));
  const mine = new Set([
    ...state.players.filter((p) => p.countryId === managed).map((p) => p.id),
    ...state.pairs.filter((p) => playerCountry.get(p.playerIds[0]) === managed).map((p) => p.id),
  ]);
  const myTeams = state.teamResults.filter((r) => r.teams.includes(managed ?? ''));
  const resultWeeks = [...new Set([
    ...state.matches.filter((m) => mine.has(m.sides[0]) || mine.has(m.sides[1])).map((m) => m.year * 100 + weekIn(m.tournamentId, m.year)),
    ...myTeams.map((r) => r.year * 100 + weekIn(r.eventId, r.year)),
  ])].filter((k) => k % 100 > 0 && k < year * 100 + week).sort((a, b) => a - b);
  const sel = resultWeeks[Math.max(0, resultWeeks.length - 1 - back)];
  const selYear = Math.floor((sel ?? 0) / 100), selWeek = (sel ?? 0) % 100;
  // Laga terakhir tiap peserta negara ini di turnamen minggu terpilih.
  const last = new Map<string, { event: string; id: string; m: Match; i: 0 | 1 }>();
  const wins: { id: string; m: Match; i: 0 | 1 }[] = [];
  for (const m of state.matches) {
    if (m.year !== selYear || weekIn(m.tournamentId, m.year) !== selWeek || teamEventIds.has(m.tournamentId)) continue; // partai beregu: lihat baris Tim
    m.sides.forEach((side, i) => {
      if (!mine.has(side)) return;
      last.set(`${m.tournamentId}:${side}`, { event: m.tournamentId, id: side, m, i: i as 0 | 1 });
      if (m.winner === i && !m.walkover) wins.push({ id: side, m, i: i as 0 | 1 });
    });
  }
  // Ringkasan: poin turnamen & ranking sebelum/sesudah minggu turnamen (junior: ranking junior); momen terbaik = kemenangan atas lawan berperingkat tertinggi.
  const tierOf = new Map(ruleset.calendar.map((e) => [e.id, ruleset.tiers.find((x) => x.id === e.tierId)]));
  const rankCache = new Map<string, Map<string, number>>();
  const rankAt = (event: string, d: Discipline, abs: number) => {
    const junior = !!tierOf.get(event)?.junior, k = `${junior}:${d}:${abs}`;
    if (!rankCache.has(k)) rankCache.set(k, rankMap(computeRanking(junior ? state.juniorResults : state.results, d, abs, ruleset)));
    return rankCache.get(k)!;
  };
  const selAbs = selYear * 52 + selWeek;
  const summaryOf = (event: string, id: string, d: Discipline) => ({
    points: (tierOf.get(event)?.junior ? state.juniorResults : state.results).find((r) => r.entrantId === id && r.tournamentId === event && r.year === selYear)?.points,
    before: rankAt(event, d, selAbs - 1).get(id), after: rankAt(event, d, selAbs).get(id),
  });
  const best = new Map<string, { id: string; m: Match; i: 0 | 1; oppRank: number }>();
  for (const w of wins) {
    const pre = rankAt(w.m.tournamentId, w.m.discipline, selAbs - 1);
    const oppRank = pre.get(w.m.sides[1 - w.i]) ?? Infinity;
    if (oppRank < (pre.get(w.id) ?? Infinity) && oppRank < (best.get(w.m.tournamentId)?.oppRank ?? Infinity)) best.set(w.m.tournamentId, { ...w, oppRank });
  }
  // Per turnamen, urut dari babak terjauh (juara dulu).
  const reachedOf = (r: { m: Match; i: 0 | 1 }) => (r.m.winner === r.i && r.m.round === 'F' ? 'W' : r.m.round);
  const byEvent = groupBy([...last.values()], (r) => r.event);
  for (const list of byEvent.values()) list.sort((a, b) => ROUND_ORDER.indexOf(reachedOf(a)) - ROUND_ORDER.indexOf(reachedOf(b)));
  const byWeek = groupBy(upcoming, (e) => weekOf(e, year));
  // Beregu minggu terpilih: babak terakhir negara ini per format.
  const lastTeam = myTeams.filter((r) => r.year === selYear && weekIn(r.eventId, r.year) === selWeek);
  const injured = state.players.filter((p) => p.countryId === managed && p.injury && p.retired === undefined && p.released === undefined);
  const lastReport = state.career?.reports.at(-1);
  // Ringkasan per turnamen: HP default ringkas (hanya perempat final ke atas), desktop default lengkap.
  const [openEvents, setOpenEvents] = useState<Set<string>>(new Set());
  const [compact] = useState(() => window.matchMedia?.('(max-width: 700px)').matches ?? false);
  const cols = useDashCols();
  const toggleEvent = (id: string) => setOpenEvents((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Kartu dashboard: [prioritas di layar lebar, kartu]. HP: satu kolom urut daftar ini. Layar lebar (2–3 kolom): masonry —
  // kartu diambil menurut prioritas (target, hasil turnamen, ranking dulu) dan ditaruh di kolom yang saat itu paling pendek.
  const cards: [number, ReactNode][] = [
    [-1, !managed && <p>{t('observerNote')}</p>],
    [3, managed && state.scouting && <ScoutingCard />],
    [0, managed && (
        <section className="card">
          <h3>{t('goalsCard')} {year}</h3>
          <GoalTable goals={state.career!.goals} current={(g) => goalProgress(state, ruleset, managed, g, world)} year={year} tagged>
            {(state.career!.challenge || (state.career!.challengeOptions?.length && week <= CHALLENGE_DEADLINE_WEEK)) && <ChallengeItems />}
          </GoalTable>
        </section>
      )],
    [4, managed && <ContingentStatus country={managed} onOpenEvent={(id) => onOpenEvent(id, year)} />],
    [5, lastReport && week <= 4 && (
        <section className="card">
          <h3>{t('seasonEndReport')} {lastReport.year}: {t('grade')} {lastReport.grade} ({lastReport.reputationChange >= 0 ? '+' : ''}{lastReport.reputationChange} {t('reputation')})</h3>
          <GoalTable goals={lastReport.goals} year={lastReport.year} />
        </section>
      )],
    [6, managed && (week - 1) % 13 < 4 && <QuarterReportCard country={managed} onOpen={onOpen} />],
    [7, <NewsCard onOpen={onOpen} />],
    [8, (
      <section className="card upcoming">
        <h3>{t('upcoming')}</h3>
        {upcoming.length === 0 ? <p>—</p> : [...byWeek].map(([w, list]) => (
          <div key={w} className="dlist">
            <h4>{t('week')} {w}</h4>
            {list.map((e) => (
              <div key={e.id} className="drow" data-ev={e.id}>
                <TierBadge tierId={e.tierId} team={'team' in e ? e.team : undefined} />
                <span className="grow"><b>{eventName(ruleset, e.id, year)}</b><small className="muted-text">{city(hostCityId(e, year))}</small></span>
                {managed && <EntryBadge id={e.id} onOpen={() => onOpenEvent(e.id, year)} />}
              </div>
            ))}
          </div>
        ))}
      </section>
    )],
    // Ranking sebelum hasil turnamen (kartu panjang): di laptop tetap di kolom kiri, di HP tidak perlu gulir jauh.
    [2, (
      <section className="card rankcard">
        <h3>{t('bwfRankNow')}</h3>
        <nav className="controls subnav">
          {DISCIPLINES.map((d) => <button key={d} aria-pressed={d === rankD} onClick={() => setRankD(d)}>{d}</button>)}
        </nav>
        {top10.length === 0 ? <p className="hint">—</p> : top10.map((r) => {
          const mine = entrantLabel(state, r.id).country === managed;
          return (
            <div key={r.id} className={`drow rank${mine ? ' mine-row' : ''}`}>
              <span className="badge">{r.rank}</span>
              <span className="grow">
                <a href="#" onClick={(e) => { e.preventDefault(); onOpen(r.id); }}><Flag id={r.id} />{entrantLabel(state, r.id).name}</a>
              </span>
              <span className="pts">{r.points.toLocaleString(numLocale())}</span>
              <span className="delta">{r.delta ? <span className={r.delta > 0 ? 'up' : 'down'}>{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}</span> : <span className="muted-text">–</span>}</span>
            </div>
          );
        })}
        <p><button onClick={() => onFullRanking(rankD)}>{t('fullRanking')} ›</button></p>
      </section>
    )],
    [1, managed && (
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
                <span className="chip">{teamLabel(r)}</span>
                <span className="grow"><b><EventLink id={r.eventId} year={r.year} onOpen={onOpenEvent} /> · {formatName(r.format, r.eventId)}</b></span>
                <span className={`badge${reached === 'W' ? ' gold' : reached === 'F' || reached === 'SF' ? ' good' : ''}`}>{reached === 'W' ? `🏆 ${t('champion')}` : reached ?? t('group')}</span>
              </div>
            );
          })}
          {last.size === 0 && lastTeam.length === 0 ? <p>—</p> : (
            [...byEvent].map(([event, list]) => {
              const top = list.filter((r) => ['W', 'F', 'SF', 'QF'].includes(reachedOf(r)));
              const full = compact === openEvents.has(event); // HP: dibuka manual; desktop: ditutup manual
              const shown = full ? list : (top.length ? top : list).slice(0, top.length ? 6 : 3);
              const count = (rd: string) => list.filter((r) => reachedOf(r) === rd).length;
              const goals = (state.targetLog ?? []).filter((x) => x.eventId === event && x.year === selYear);
              return (
              <div key={event} className="dlist">
                <h4><EventLink id={event} year={selYear} onOpen={onOpenEvent} /></h4>
                <p className="week-sum">
                  {(['W', 'F', 'SF', 'QF'] as const).filter((rd) => count(rd)).map((rd) => <span key={rd} className={`badge${rd === 'W' ? ' gold' : rd === 'QF' ? '' : ' good'}`}>{rd === 'W' ? '🏆' : rd} ×{count(rd)}</span>)}
                  <span className="muted-text">{t('weekSumEntrants', { n: list.length })}</span>
                  {goals.length > 0 && <span className="muted-text">· 🎯 {t('weekSumTargets', { hit: goals.filter((x) => x.res === 'hit').length, n: goals.length })}</span>}
                </p>
                {(() => {
                  const b = best.get(event);
                  if (!b) return null;
                  const opp = b.m.sides[1 - b.i];
                  return (
                    <div className="drow moment">
                      <span className="badge gold">{t('bestMomentTag')}</span>
                      <span className="grow">
                        <span><a href="#" onClick={(e) => { e.preventDefault(); onOpen(b.id); }}>{entrantLabel(state, b.id).name}</a> {t('beat')} <span className="muted-text">#{b.oppRank}</span> <Flag id={opp} />{entrantLabel(state, opp).name}</span>
                        <small className="muted-text">{b.m.discipline} {b.m.round} · <MatchLink m={b.m} name={(x) => entrantLabel(state, x).name} title={eventName(ruleset, b.m.tournamentId, b.m.year)}>{b.m.scores.map((g) => `${g[b.i]}-${g[1 - b.i]}`).join(', ')}</MatchLink></small>
                      </span>
                    </div>
                  );
                })()}
                {shown.map(({ id, m, i }) => {
                  const reached = reachedOf({ m, i });
                  const opp = m.sides[1 - i];
                  const sum = summaryOf(event, id, m.discipline);
                  const move = sum.before && sum.after ? sum.before - sum.after : undefined;
                  return (
                    <div key={id} className={`drow${reached === 'W' ? ' champ' : ''}`}>
                      <span className="chip">{m.discipline}</span>
                      <span className="grow">
                        <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{entrantLabel(state, id).name}</a>
                        <small className="muted-text">{m.winner === i ? t('wins') : t('lost')} vs <Flag id={opp} />{entrantLabel(state, opp).name} · <MatchLink m={m} name={(x) => entrantLabel(state, x).name} title={eventName(ruleset, m.tournamentId, m.year)}>{m.scores.map((g) => `${g[i]}-${g[1 - i]}`).join(', ')}</MatchLink></small>
                        {(sum.points || sum.after) && (
                          <small className="muted-text">
                            {sum.points ? `+${sum.points.toLocaleString(numLocale())} ${t('pts')}` : ''}
                            {sum.points && sum.after ? ' · ' : ''}
                            {sum.after && <>{t('rank')} {sum.before && sum.before !== sum.after ? `${sum.before} → ` : ''}{sum.after}{move ? <span className={move > 0 ? 'up' : 'down'}> {move > 0 ? '▲' : '▼'}{Math.abs(move)}</span> : !sum.before ? ` (${t('newRank')})` : ''}</>}
                          </small>
                        )}
                      </span>
                      <span className={`badge${reached === 'W' ? ' gold' : reached === 'F' || reached === 'SF' ? ' good' : ''}`}>{reached === 'W' ? `🏆 ${t('champion')}` : reached}</span>
                    </div>
                  );
                })}
                {list.length > shown.length || full && list.length > top.length ? (
                  <button className="mini" onClick={() => toggleEvent(event)}>
                    {full ? t('showLess') : t('showAllResults', { n: list.length })}
                  </button>
                ) : null}
              </div>
              );
            })
          )}
        </section>
      )],
    [9, managed && injured.length > 0 && (
        <section className="card">
          <h3>{t('injuries')}</h3>
          {injured.map((p) => {
            // Sektor utama: tunggal, atau nomor ganda pasangan utamanya (spesialis ganda).
            const sector = p.focus !== 'D' ? (p.gender === 'M' ? 'MS' : 'WS')
              : state.pairs.find((x) => !x.dissolved && !x.trial && !x.adHoc && x.playerIds.includes(p.id))?.discipline ?? (p.gender === 'M' ? 'MD' : 'WD');
            return (
              <div key={p.id} className="drow">
                <span className="chip">{sector}</span>
                <span className="grow">
                  <a href="#" onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a>
                  <small className="muted-text">{injuryText(p.injury!, state.date)}</small>
                </span>
                <span className={`badge danger${isBadInjury(p.injury) ? ' strong' : ''}`}>🩹 {t('weeksShort', { n: p.injury!.weeksLeft })}</span>
              </div>
            );
          })}
        </section>
      )],
  ];
  const shown = cards.map(([prio, el], key) => ({ prio, el, key })).filter((x) => x.el);
  // Tinggi tiap kartu diukur sebelum layar digambar; penempatan diulang hanya bila berubah (tanpa kedip).
  const boxes = useRef<(HTMLDivElement | null)[]>([]);
  const [place, setPlace] = useState<number[]>([]);
  useLayoutEffect(() => {
    if (cols === 1) return;
    const h = Array<number>(cols).fill(0), next: number[] = [];
    for (const x of [...shown].sort((a, b) => a.prio - b.prio)) {
      const c = h.indexOf(Math.min(...h));
      next[x.key] = c;
      const px = boxes.current[x.key]?.offsetHeight ?? 0;
      if (px) h[c] += px + 16;
    }
    if (next.join() !== place.join()) setPlace(next);
  });
  if (cols === 1) return <div className="dash">{shown.map((x) => <Fragment key={x.key}>{x.el}</Fragment>)}</div>;
  return (
    <div className="dash cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} className="dashcol">
          {shown.filter((x) => (place[x.key] ?? 0) === c).sort((a, b) => a.prio - b.prio)
            .map((x) => <div key={x.key} ref={(el) => { boxes.current[x.key] = el; }}>{x.el}</div>)}
        </div>
      ))}
    </div>
  );
}

/** Jumlah kolom dashboard menurut lebar layar: 3 (≥ 1280 px), 2 (≥ 1024 px), selain itu 1 (grid biasa). */
function useDashCols() {
  const get = () => (window.matchMedia('(min-width: 1280px)').matches ? 3 : window.matchMedia('(min-width: 1024px)').matches ? 2 : 1);
  const [n, setN] = useState(get);
  useEffect(() => { const f = () => setN(get()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return n;
}

/** Berita mingguan: kejutan, juara beruntun, smash & reli terpanjang, atlet on fire (dari laga minggu lalu). */
function NewsCard({ onOpen }: { onOpen: (id: string) => void }) {
  const { game, version } = useGame();
  const { state, ruleset } = game;
  // Undian tuan rumah: hanya event yang bisa diikuti negara manajer (kontinental sendiri, multi-event anggotanya).
  const items = useMemo(() => weeklyNews(state, ruleset).flatMap((n) => {
    const mine = state.career?.countryId;
    if (n.kind !== 'hosts' || !mine) return [n];
    const def = (id: string) => [...ruleset.calendar, ...ruleset.team.events].find((e) => e.id === id);
    const drawn = n.drawn.filter((x) => { const e = def(x.id); return e && openTo(e, mine, game.world); });
    return drawn.length ? [{ ...n, drawn }] : [];
  }), [version]);
  if (!items.length) return null;
  const who = (id: string) => <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}><Flag id={id} />{entrantLabel(state, id).name}</a>;
  const score = (m: Match) => (
    <MatchLink m={m} name={(x) => entrantLabel(state, x).name} title={eventName(ruleset, m.tournamentId, m.year)}>
      {m.scores.map((g) => `${g[m.winner]}-${g[1 - m.winner]}`).join(', ')}
    </MatchLink>
  );
  const where = (m: Match) => <small className="muted-text">{eventName(ruleset, m.tournamentId, m.year)} · {m.discipline} {m.round} · {score(m)}</small>;
  const lastYear = state.date.week > 1 ? state.date.year : state.date.year - 1;
  const record = (on: boolean) => on && <> <span className="badge gold">{t('newsRecord')}</span></>;
  // Tiap berita: badge jenis (lebar tetap, warna per jenis) + kalimat utama + baris keterangan.
  const row = (n: NewsItem): [string, ReactNode, ReactNode] => {
    switch (n.kind) {
      case 'upset': return [t('newsUpset'), <>{who(n.winner)} <span className="muted-text">({n.wr ? `#${n.wr}` : t('unranked')})</span> {t('beat')} {who(n.loser)} <span className="muted-text">(#{n.lr})</span></>, where(n.m)];
      case 'streak': return [t('newsStreakTag'), <>{who(n.id)} {t('newsStreak', { n: n.n })}</>,
        <small className="muted-text">{eventName(ruleset, n.tournamentId, lastYear)}</small>];
      case 'smash': return [t('newsSmash'), <><b>{n.kmh} km/h</b> · {who(n.id)}{record(n.record)}</>, where(n.m)];
      case 'rally': return [t('newsRally'), <><b>{n.shots} {t('shotsUnit')}</b> · {who(n.m.sides[0])} vs {who(n.m.sides[1])}{record(n.record)}</>, where(n.m)];
      case 'fire': return [t('onFire'), <>{who(n.id)}</>, <small className="muted-text">{t('newsFire', { n: n.wins })}</small>];
      case 'firstTitle': return [t('newsFirstTag'), <>{who(n.id)} {t('newsFirstTitle')}</>, <small className="muted-text">{eventName(ruleset, n.tournamentId, lastYear)} · {n.discipline}</small>];
      case 'youngChamp': return [t('newsYoungTag'), <>{who(n.id)} {t('newsYoungChamp', { n: n.age })}</>, <small className="muted-text">{eventName(ruleset, n.tournamentId, lastYear)} · {n.discipline}</small>];
      case 'seedOut': return [t('newsSeedTag'), <>{t('newsSeedOut', { round: n.m.round })}: {who(n.id)} {t('lostTo')} {who(n.opp)}</>, where(n.m)];
      case 'comeback': return [t('newsComebackTag'), <>{who(n.id)} {t('newsComeback')}</>, where(n.m)];
      case 'hosts': return [t('newsHostsTag'), <>{t('newsHosts', { year: n.year })}</>,
        <span className="host-list">{n.drawn.map((x) => {
          const c = game.world.cities.find((y) => y.id === x.cityId);
          return <span key={x.id} className="drow"><span className="grow">{eventName(ruleset, x.id, n.year)}</span><b><Flag id={c?.countryId} />{dataName(c?.name)}</b></span>;
        })}</span>];
      case 'awards': {
        const a = n.award;
        const mine = (id: string) => entrantLabel(state, id).country.split('/').includes(state.career?.countryId ?? '');
        const person = (id: string) => <span key={id} className={mine(id) ? 'mine-award' : undefined}>{who(id)}</span>;
        return [t('newsAwardsTag'), <>{t(a.winners ? 'newsAwardWinners' : 'newsAwardNominees', { year: a.year })}</>,
          <span className="award-list">{AWARD_CATS.map((c) => (
            <span key={c}><small className="muted-text">{t(`award_${c}` as TextKey)}</small>
              <span>{a.winners ? <>🏆 {person(a.winners[c])}</> : a.nominees[c].map((id, i) => <span key={id}>{i > 0 && ' · '}{person(id)}</span>)}</span></span>
          ))}</span>];
      }
      case 'careerHigh': return [t('newsHighTag'), <>{who(n.id)} {t('newsCareerHigh', { n: n.rank })}</>, <small className="muted-text">{n.discipline}</small>];
    }
  };
  return (
    <section className="card news">
      <h3>{t('newsTitle')}</h3>
      {items.map((n, i) => {
        const [tag, main, sub] = row(n);
        return (
          <div key={i} className="drow">
            <span className={`badge news-${n.kind}`}>{tag}</span>
            <span className="grow"><span>{main}</span>{sub}</span>
          </div>
        );
      })}
    </section>
  );
}

/** Gelar negara di satu tahun: per tier (urutan ruleset: tertinggi dulu) + gelar beregu. */
function titlesOf(state: SeasonState, ruleset: Ruleset, country: string, year: number) {
  const tierOfEvent = new Map(ruleset.calendar.map((e) => [e.id, e.tierId]));
  const titles = state.champions.filter((c) => c.year === year && entrantLabel(state, c.winner).country === country);
  return { titles, byTier: groupBy(titles, (c) => tierOfEvent.get(c.tournamentId) ?? ''), teamTitles: state.teamResults.filter((r) => r.year === year && r.reached[country] === 'W') };
}

function Titles({ country, year, onOpen, onOpenEvent }: { country: string; year: number; onOpen: (id: string) => void; onOpenEvent: (id: string, year: number) => void }) {
  const { game } = useGame();
  const { state, ruleset } = game;
  const { titles, byTier, teamTitles } = titlesOf(state, ruleset, country, year);
  const winners = (n: number) => t(n === 1 ? 'winnerOne' : 'winnerMany', { n });
  return (
    <section className="card titles">
      <h3>{t('titlesYear', { y: year })}</h3>
      {titles.length + teamTitles.length === 0 ? <p className="hint">{t('noTitles')}</p> : <>
        {ruleset.tiers.filter((tier) => byTier.has(tier.id)).map((tier) => (
          <div key={tier.id} className="dlist">
            <h4>{dataName(tier.name)} <small className="muted-text">{winners(byTier.get(tier.id)!.length)}</small></h4>
            {byTier.get(tier.id)!.map((c) => (
              <div key={c.tournamentId + c.discipline} className="drow champ">
                <span className="chip">{c.discipline}</span>
                <span className="grow">
                  <a href="#" onClick={(e) => { e.preventDefault(); onOpen(c.winner); }}>{entrantLabel(state, c.winner).name}</a>
                  <small className="muted-text"><EventLink id={c.tournamentId} year={year} onOpen={onOpenEvent} /></small>
                </span>
                <span className="badge gold">🏆</span>
              </div>
            ))}
          </div>
        ))}
        {teamTitles.length > 0 && (
          <div className="dlist">
            <h4>{t('teamShort')} <small className="muted-text">{winners(teamTitles.length)}</small></h4>
            {teamTitles.map((r) => (
              <div key={r.eventId + r.format} className="drow champ">
                <span className="chip">{teamLabel(r)}</span>
                <span className="grow">{formatName(r.format, r.eventId)} <small className="muted-text"><EventLink id={r.eventId} year={year} onOpen={onOpenEvent} /></small></span>
                <span className="badge gold">🏆</span>
              </div>
            ))}
          </div>
        )}
      </>}
    </section>
  );
}

/** Ringkasan satu musim (dari kartu rapor): rapor, gelar per tier, hasil beregu, juara semua turnamen. */
function SeasonSummary({ year, country, onBack, onOpen, onOpenEvent }: { year: number; country: string; onBack: () => void; onOpen: (id: string) => void; onOpenEvent: (id: string, year: number) => void }) {
  const { game } = useGame();
  const { state, ruleset } = game;
  const report = state.career?.reports.find((r) => r.year === year);
  const teams = state.teamResults.filter((r) => r.year === year && r.teams.includes(country));
  const { players, pairs } = lookup(state);
  const membersOf = (id: string) => pairs.get(id)?.playerIds ?? [id];
  // Statistik musim itu: turnamen diikuti, rekor, final, hadiah; pemain juara (gelar per atlet, ganda dihitung untuk kedua atlet).
  const mine = (id: string) => players.get(membersOf(id)[0])?.countryId === country;
  const played = new Set<string>();
  let won = 0, lost = 0, finals = 0;
  for (const m of state.matches) {
    if (m.year !== year) continue;
    const i = mine(m.sides[0]) ? 0 : mine(m.sides[1]) ? 1 : -1;
    if (i < 0) continue;
    played.add(m.tournamentId);
    if (m.winner === i) won++; else lost++;
    if (m.round === 'F') finals++;
  }
  const { titles, teamTitles } = titlesOf(state, ruleset, country, year);
  const perPlayer = new Map<string, number>();
  const sectorsWon = new Map<string, Set<string>>(); // nomor tempat atlet juara (bisa lebih dari satu, mis. MD & XD)
  for (const c of titles) for (const id of membersOf(c.winner)) {
    perPlayer.set(id, (perPlayer.get(id) ?? 0) + 1);
    sectorsWon.set(id, (sectorsWon.get(id) ?? new Set()).add(c.discipline));
  }
  const earnings = Object.entries(state.earnings[year] ?? {}).filter(([id]) => players.get(id)?.countryId === country).sort((a, b) => b[1] - a[1]);
  const link = (id: string) => <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{players.get(id)?.name ?? id}</a>;
  return (
    <>
      <p><button onClick={onBack}>← {t('back')}</button></p>
      <h2><Flag id={country} />{t('seasonSummary', { y: year })}</h2>
      <div className="dash">
        {report && <section className="card"><ReportCard r={report} /></section>}
        <section className="card">
          <h3>{t('seasonStats')}</h3>
          <div className="stats">
            {[
              [t('statEvents', { y: year }), played.size], [t('statRecord', { y: year }), `${won}–${lost}`], [t('statFinals'), finals],
              [t('titlesYear', { y: year }), titles.length + teamTitles.length], [t('statChampions'), perPlayer.size], [t('prizeMoney'), usd(earnings.reduce((s, [, v]) => s + v, 0))],
            ].map(([label, value]) => <div key={String(label)}><b>{value}</b><small>{label}</small></div>)}
          </div>
        </section>
        <section className="card">
          <h3>{t('teamResults')} {year}</h3>
          {teams.length === 0 ? <p className="hint">—</p> : teams.map((r) => {
            const reached = r.reached[country];
            return (
              <div key={r.eventId + r.format} className={`drow${reached === 'W' ? ' champ' : ''}`}>
                <span className="chip">{teamLabel(r)}</span>
                <span className="grow"><b><EventLink id={r.eventId} year={year} onOpen={onOpenEvent} /> · {formatName(r.format, r.eventId)}</b></span>
                <span className={`badge${reached === 'W' ? ' gold' : reached === 'F' || reached === 'SF' ? ' good' : ''}`}>{reached === 'W' ? `🏆 ${t('champion')}` : reached ?? t('group')}</span>
              </div>
            );
          })}
        </section>
        <Titles country={country} year={year} onOpen={onOpen} onOpenEvent={onOpenEvent} />
        <section className="card">
          <h3>{t('statChampions')} {year}</h3>
          {perPlayer.size === 0 ? <p className="hint">{t('noTitles')}</p> : [...perPlayer].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
            <div key={id} className="drow">
              <span className="chip">{[...sectorsWon.get(id)!].join('·')}</span>
              <span className="grow">{link(id)}</span>
              <span className="badge gold">🏆 {n}</span>
            </div>
          ))}
        </section>
        {earnings.length > 0 && (
          <section className="card">
            <h3>{t('topEarners')} {year}</h3>
            {earnings.slice(0, 10).map(([id, v], i) => (
              <div key={id} className="drow"><span className="badge">{i + 1}</span><span className="grow">{link(id)}</span><span className="num">{usd(v)}</span></div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

function ReportCard({ r, onClick }: { r: SeasonReport; onClick?: () => void }) {
  const { game } = useGame();
  const countryName = dataName(game.world.countries.find((c) => c.id === r.countryId)?.name) ?? r.countryId;
  return (
    <div className={`report grade-${r.grade}${onClick ? ' clickable' : ''}`} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick} onKeyDown={(e) => onClick && e.key === 'Enter' && onClick()}>
      <div className="report-head">
        <span className="grade">{r.grade}</span>
        <span className="grow"><b>{r.year}</b> <small className="muted-text"><Flag id={r.countryId} />{countryName}</small></span>
        <span className={`badge ${r.reputationChange > 0 ? 'good' : r.reputationChange < 0 ? 'danger' : ''}`}>{r.reputationChange >= 0 ? '+' : ''}{r.reputationChange} {t('reputation')}</span>
      </div>
      {r.goals.filter((g) => goalWeight(g, r.year) > 0).map((g) => {
        const done = g.achieved ?? 0;
        const show = (n: number) => (g.kind === 'team' ? levelName(n) : n);
        return (
          <div key={goalKey(g)} className="goalbar">
            <span>{g.format ? formatName(g.format) : goalLabel(game.ruleset, g, r.year)}</span>
            <small className={done >= g.target ? 'up' : 'muted-text'}>{show(done)} / {show(g.target)}</small>
            <span className="bar"><span style={{ width: `${Math.min(100, (done / Math.max(1, g.target)) * 100)}%`, background: done >= g.target ? 'var(--accent)' : 'var(--gold)' }} /></span>
          </div>
        );
      })}
      {r.challenge && <small className={r.challenge.done ? 'up' : 'down'}>{t('challenge')}: {challengeText(game, r.challenge, r.year)} — {t(r.challenge.done ? 'challengeDone' : 'challengeFailed')} ({r.challenge.reputation > 0 ? '+' : ''}{r.challenge.reputation})</small>}
      <small className={r.violations ? 'down' : 'muted-text'}>{t('violations')}: {r.violations}</small>
    </div>
  );
}

/** Rapor target musim: per atlet/pasangan berapa target yang tercapai & meleset (dari target babak di form entry). */
function TargetReportCard({ onOpen }: { onOpen: (id: string) => void }) {
  const { game } = useGame();
  const { state } = game;
  const years = [...new Set((state.targetLog ?? []).map((x) => x.year))].sort((a, b) => b - a);
  const [pick, setPick] = useState<number>();
  const year = pick ?? years[0] ?? state.date.year;
  const rows = targetReport(state, year);
  const total = rows.reduce((s, r) => s + r.n, 0), hit = rows.reduce((s, r) => s + r.hit, 0);
  const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`;
  // Klik judul kolom: urut menurut kolom itu (angka: terbanyak dulu, nama: A–Z); klik lagi membalik. Seri: urutan bawaan.
  type Row = (typeof rows)[number];
  const cols: { key: string; label: ReactNode; title?: string; num?: boolean; value: (r: Row) => number | string }[] = [
    { key: 'name', label: t('name'), value: (r) => entrantLabel(state, r.id).name },
    { key: 'n', label: '🎯', title: t('targetReportN'), num: true, value: (r) => r.n },
    { key: 'hit', label: '✓', title: t('targetHitCol'), num: true, value: (r) => r.hit },
    { key: 'miss', label: '✗', title: t('targetMissCol'), num: true, value: (r) => r.miss },
    { key: 'pct', label: '%', num: true, value: (r) => r.hit / r.n },
  ];
  const [sort, setSort] = useState<{ key: string; desc: boolean }>();
  const col = cols.find((c) => c.key === sort?.key);
  const list = !col ? rows : [...rows].sort((a, b) => {
    const x = col.value(a), y = col.value(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort!.desc ? -r : r;
  });
  return (
    <section className="card">
      <h3>{t('targetReport')} {year}</h3>
      {years.length > 1 && (
        <p className="controls"><select value={year} onChange={(e) => setPick(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></p>
      )}
      {!rows.length ? <p className="hint">{t('targetReportEmpty')}</p> : (
        <>
          <p>{t('targetReportSummary', { hit, n: total, pct: pct(hit, total) })}</p>
          <table className="fit target-report">
            <thead><tr>{cols.map((c) => (
              <th key={c.key} title={c.title} className={`sortable${c.num ? ' num' : ''}`} aria-sort={sort?.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                onClick={() => setSort(sort?.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !!c.num })}>
                {c.label}{sort?.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}</tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td><a href="#" onClick={(e) => { e.preventDefault(); onOpen(state.pairs.find((p) => p.id === r.id)?.playerIds[0] ?? r.id); }}>{entrantLabel(state, r.id).name}</a></td>
                <td className="num">{r.n}</td><td className="num pos">{r.hit}</td><td className="num neg">{r.miss}</td><td className="num"><b>{pct(r.hit, r.n)}</b></td>
              </tr>
            ))}</tbody>
          </table>
          <p className="hint">{t('targetReportHint')}</p>
        </>
      )}
    </section>
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
  const [summary, setSummary] = useState<number>();
  const { titles, teamTitles } = titlesOf(state, ruleset, country ?? '', year);
  if (summary !== undefined && country) return <SeasonSummary year={summary} country={country} onBack={() => setSummary(undefined)} onOpen={onOpen} onOpenEvent={onOpenEvent} />;
  // Ringkasan: atlet aktif, turnamen diikuti & rekor laga tahun ini (individu + beregu).
  const squad = state.players.filter((p) => p.countryId === country && p.retired === undefined && p.released === undefined);
  const juniorCount = squad.filter((p) => isJuniorAge(p, state.date)).length;
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
      {country && <Titles country={country} year={year} onOpen={onOpen} onOpenEvent={onOpenEvent} />}
      {country && <TargetReportCard onOpen={onOpen} />}
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
          <div className="reports">{[...reports].reverse().map((r) => (
            <ReportCard key={r.year} r={r} onClick={() => setSummary(r.year)} />
          ))}</div>
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
