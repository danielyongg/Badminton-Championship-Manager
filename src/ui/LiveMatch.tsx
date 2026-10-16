import { useEffect, useRef, useState } from 'react';
import { createMatch, matchResult, playRally, type MatchResult, type MatchState, type RallyEvent, type SideInput } from '../engine/match';
import type { Rng } from '../engine/rng';
import { STRATEGIES, type MatchConfig, type PointType, type Strategy } from '../engine/types';
import { t, type TextKey } from '../i18n';
import { Flag } from './Flag';

const SPEEDS = { slow: 600, normal: 250, fast: 60 } as const;
const TYPES: PointType[] = ['smash', 'net', 'clear', 'drop', 'error', 'service'];

/**
 * Live Match: rally demi rally. Strategi dipilih sebelum laga, saat interval (11 poin; 8 poin di sistem 3×15), dan antar game.
 * Lawan (AI) memakai strategi 'balanced'.
 */
export function LiveMatch({ sides, names, ids, mySide, cfg, rng, title, onDone, onSkipRound }: {
  sides: [SideInput, SideInput]; names: [string, string]; ids?: [string, string]; mySide: 0 | 1; cfg: MatchConfig; rng: Rng; title: string;
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
  const [hidden, setHidden] = useState(false);
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
                <td><Flag id={ids?.[s]} />{names[s]}</td>
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

        {!done && (
          <div className="controls">
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
              ? <button className="primary" onClick={() => setRunning(false)}>{t('pause')}</button>
              : <button className="primary" onClick={() => setRunning(true)}>{m.rallies === 0 ? t('startMatch') : t('resume')}</button>}
            <button disabled={running} onClick={() => step()}>{t('oneRally')}</button>
            <button onClick={finish}>{t('autoFinish')}</button>
            {onSkipRound && <button onClick={() => { finish(); onDone(matchResult(m)); onSkipRound(); }}>{t('simRound')}</button>}
          </div>
        )}
        {!running && !done && m.rallies > 0 && <p className="hint">{t('strategyHint')}</p>}
        {/* Hasil & Lanjut tepat di bawah papan skor: langsung terjangkau di HP tanpa menggulir. */}
        {done && (
          <div className="controls">
            <b>{names[m.winner!]} {t('wins')}!</b>
            <button className="primary" onClick={() => onDone(matchResult(m))}>{t('continue')}</button>
            {onSkipRound && <button onClick={() => { onDone(matchResult(m)); onSkipRound(); }}>{t('simRound')}</button>}
          </div>
        )}

        <div className="split">
          <ol className="log">
            {log.map(({ ev, score }, i) => (
              <li key={i}><b>{score}</b> <span className={`chip${ev.winner === mySide ? '' : ' opp'}`}>{t(ev.type)}</span> {names[ev.winner]}{ev.interval ? ` · ${t('interval')}` : ''}{ev.gameOver ? ` · ${t('gameOver')}` : ''}</li>
            ))}
          </ol>
          <table>
            <thead><tr><th>{t('pointType')}</th><th>{names[0].split(' ')[0]}</th><th>{names[1].split(' ')[0]}</th></tr></thead>
            <tbody>{TYPES.map((k) => <tr key={k}><td>{t(k)}</td><td className="num">{m.stats[k][0]}</td><td className="num">{m.stats[k][1]}</td></tr>)}</tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
