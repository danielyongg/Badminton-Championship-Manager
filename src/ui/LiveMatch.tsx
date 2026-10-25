import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createMatch, headToHead, matchResult, playRally, suggestStrategy, type MatchResult, type MatchState, type RallyEvent, type SideInput } from '../engine/match';
import type { Rng } from '../engine/rng';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import type { SeasonState } from '../engine/season';
import type { LiveRequest } from '../engine/tournament';
import { STRATEGIES, type MatchConfig, type Ruleset, type Strategy } from '../engine/types';
import { t, type TextKey } from '../i18n';
import { Flag } from './Flag';
import { entrantLabel, eventName } from './game';
import { MatchLink } from './MatchDetail';
import { MatchStatsView } from './MatchStats';

const SPEEDS = { slow: 600, normal: 250, fast: 60 } as const;

/**
 * Live Match: rally demi rally. Strategi dipilih sebelum laga, saat interval (11 poin; 8 poin di sistem 3×15), dan antar game.
 * Lawan (AI) memakai strategi 'balanced'.
 */
export function LiveMatch({ sides, names, ids, mySide, cfg, rng, title, preview, onDone, onSkipRound }: {
  sides: [SideInput, SideInput]; names: [string, string]; ids?: [string, string]; mySide: 0 | 1; cfg: MatchConfig; rng: Rng; title: string;
  /** Kartu pra-laga (H2H, ranking), tampil sampai reli pertama. */
  preview?: ReactNode;
  onDone: (r: MatchResult) => void; onSkipRound?: () => void;
}) {
  const st = useRef<MatchState>(null);
  if (!st.current) st.current = createMatch(sides, cfg, rng);
  const m = st.current;
  const [, render] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('normal');
  const [log, setLog] = useState<{ ev: RallyEvent; score: string }[]>([]);
  const [strategy, setStrategy] = useState<Strategy>('balanced');
  const [tip] = useState(() => suggestStrategy(sides[mySide].players, sides[1 - mySide].players));
  const [hidden, setHidden] = useState(false);
  const [view, setView] = useState<'log' | 'stats'>('log');
  const hide = () => { setRunning(false); setHidden(true); }; // laga dijeda selama pop-up disembunyikan

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const step = () => {
    if (m.winner !== undefined) return false;
    m.sides[mySide].strategy = strategy;
    const ev = playRally(m, cfg, rng);
    const score = ev.gameOver ? m.games.at(-1)!.join('-') : m.score.join('-');
    setLog((l) => [{ ev, score }, ...l].slice(0, 12));
    render((x) => x + 1);
    return !(ev.interval || ev.gameOver); // berhenti di interval & akhir game agar strategi bisa diganti
  };

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { if (!step()) setRunning(false); }, SPEEDS[speed]);
    return () => clearInterval(id);
  });

  const finish = () => {
    m.sides[mySide].strategy = strategy;
    while (m.winner === undefined) playRally(m, cfg, rng);
    setRunning(false);
    render((x) => x + 1);
  };

  const gamesWon = (side: 0 | 1) => m.games.filter((g) => g[side] > g[1 - side]).length;
  const done = m.winner !== undefined;
  // Momentum dari sudut pandang atlet sendiri: positif = kita di atas angin.
  const momentum = mySide === 0 ? m.momentum : -m.momentum;

  if (hidden)
    return (
      <div className="livebar card">
        🏸 <b>{title}</b> · {m.games.map((g) => g[mySide] + '-' + g[1 - mySide]).join(', ')}{!done && ` ${m.score[mySide]}-${m.score[1 - mySide]}`}
        <button onClick={() => setHidden(false)}>{t('openLive')}</button>
      </div>
    );

  return (
    <div className="modal" role="dialog" aria-label={t('liveMatch')} onClick={(e) => e.target === e.currentTarget && hide()}>
      <div className="live card">
        <button className="close" title={t('hideLive')} aria-label={t('hideLive')} onClick={hide}>✕</button>
        <h3>{title}</h3>
        <table className="board">
          <tbody>
            {([0, 1] as const).map((s) => (
              <tr key={s} className={s === mySide ? 'mine' : ''}>
                <td className="srv" title={m.server === s && !done ? t('serve') : undefined}>{m.server === s && !done ? '●' : ''}</td>
                <td><Flag id={ids?.[s]} />{names[s]}{(sides[s].day ?? 0) >= cfg.dayForm.hotFrom && <> <span className="fire" title={t('onFireHint')} aria-label={t('onFire')}>🔥</span></>}</td>
                {m.games.map((g, i) => <td key={i} className="num muted">{g[s]}</td>)}
                {!done && <td className="pt">{m.score[s]}</td>}
                <td className="num"><b>{gamesWon(s)}</b></td>
                <td><span className="bar" title={`${t('energy')} ${Math.round(m.sides[s].energy)}`}><span style={{ width: `${m.sides[s].energy}%`, background: 'var(--accent)' }} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="momentum" title={t('momentum')}>
          <span>{t('momentum')}</span>
          <span className="track"><span className="marker" style={{ left: `${50 + momentum * 50}%` }} /></span>
        </div>

        {m.rallies === 0 && (
          <div className="prematch">
            {preview}
            <p>💡 {t('stratTip')}: <b>{t(`strat_${tip.strategy}` as TextKey)}</b>
              {tip.edge && <small className="muted-text"> · {t(tip.edge.mine as TextKey)} {tip.edge.a} vs {t(tip.edge.theirs as TextKey)} {tip.edge.b}</small>}
              {tip.strategy !== strategy && <> <button onClick={() => setStrategy(tip.strategy)}>{t('useTip')}</button></>}
            </p>
          </div>
        )}
        {!done && (
          <div className="livecontrols">
            <label>{t('strategy')}
              <select value={strategy} disabled={running} onChange={(e) => setStrategy(e.target.value as Strategy)}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{t(`strat_${s}` as TextKey)}</option>)}
              </select>
            </label>
            <label>{t('gameSpeed')}
              <select value={speed} onChange={(e) => setSpeed(e.target.value as keyof typeof SPEEDS)}>
                {Object.keys(SPEEDS).map((s) => <option key={s} value={s}>{t(`speed_${s}` as TextKey)}</option>)}
              </select>
            </label>
            {running
              ? <button className="primary main" onClick={() => setRunning(false)}>{t('pause')}</button>
              : <button className="primary main" onClick={() => setRunning(true)}>{m.rallies === 0 ? t('startMatch') : t('resume')}</button>}
            <div className="secondary">
              <button disabled={running} onClick={() => step()}>{t('oneRally')}</button>
              <button onClick={finish} title={t('autoFinish')}>{t('simMatchShort')}</button>
              {onSkipRound && <button onClick={() => { finish(); onDone(matchResult(m)); onSkipRound(); }} title={t('simRound')}>{t('simRoundShort')}</button>}
            </div>
          </div>
        )}
        {/* Pengaruh strategi yang dipilih ke pola permainan & energi atlet (nilai di ruleset.match.strategies). */}
        {!done && <p className="hint">{t(`stratInfo_${strategy}` as TextKey)}</p>}
        {!running && !done && m.rallies > 0 && <p className="hint">{t('strategyHint')}</p>}
        {/* Hasil & Lanjut tepat di bawah papan skor: langsung terjangkau di HP tanpa menggulir. */}
        {done && (
          <div className="livecontrols">
            <b className="main">{names[m.winner!]} {t('wins')}!</b>
            <button className="primary main" onClick={() => onDone(matchResult(m))}>{t('continue')}</button>
            {onSkipRound && <div className="secondary"><button onClick={() => { onDone(matchResult(m)); onSkipRound(); }} title={t('simRound')}>{t('simRoundShort')}</button></div>}
          </div>
        )}

        <nav className="controls subnav livetabs">
          <button aria-pressed={view === 'log'} onClick={() => setView('log')}>{t('logTab')}</button>
          <button aria-pressed={view === 'stats'} onClick={() => setView('stats')}>{t('statsTab')}</button>
        </nav>
        {view === 'log' ? (
          <ol className="log">
            {log.map(({ ev, score }, i) => (
              <li key={i}><b>{score}</b> <span className={`chip${ev.winner === mySide ? '' : ' opp'}`}>{t(ev.type)}</span> {names[ev.winner]}
                <small className="muted-text">{ev.kmh ? ` · ${ev.kmh} km/h` : ''}{ev.shots >= 15 ? ` · ${ev.shots} ${t('shotsUnit')}` : ''}</small>
                {ev.interval ? ` · ${t('interval')}` : ''}{ev.gameOver ? ` · ${t('gameOver')}` : ''}</li>
            ))}
          </ol>
        ) : <MatchStatsView s={m.stats} names={names} mine={mySide} />}

      </div>
    </div>
  );
}

/** Isi kartu pra-laga: ranking kedua sisi (junior: ranking junior), rekor H2H & pertemuan terakhir. */
export function PreMatch({ state, ruleset, req, mySide }: { state: SeasonState; ruleset: Ruleset; req: LiveRequest; mySide: 0 | 1 }) {
  const [me, opp] = [req.entrants[mySide], req.entrants[1 - mySide]];
  const tierId = ruleset.calendar.find((e) => e.id === req.tournamentId)?.tierId;
  const junior = !!ruleset.tiers.find((x) => x.id === tierId)?.junior;
  const ranks = rankMap(computeRanking(junior ? state.juniorResults : state.results, req.discipline, absWeek(state.date), ruleset));
  const [a, b] = req.entrants; // urutan sama dengan papan skor
  const [w, l] = headToHead(state.matches, a, b);
  const lastMeet = state.matches.filter((m) => m.sides.includes(me) && m.sides.includes(opp) && !m.walkover).at(-1);
  const name = (id: string) => entrantLabel(state, id).name;
  const i = lastMeet?.sides.indexOf(me) ?? 0;
  return (
    <>
      <p>{t('rank')}: <b>{ranks.get(a) ?? '–'}</b> vs <b>{ranks.get(b) ?? '–'}</b> · {t('h2h')}: {w + l ? <b>{w}–{l}</b> : t('neverMet')}</p>
      {lastMeet && (
        <p>{t('lastMeeting')}: {eventName(ruleset, lastMeet.tournamentId, lastMeet.year)} {lastMeet.year} {lastMeet.round} · {lastMeet.winner === i ? t('wins') : t('lost')}{' '}
          <MatchLink m={lastMeet} name={name} title={eventName(ruleset, lastMeet.tournamentId, lastMeet.year)}>{lastMeet.scores.map((g) => `${g[i]}-${g[1 - i]}`).join(', ')}</MatchLink>
        </p>
      )}
    </>
  );
}
