import { useEffect, useRef, useState, type ReactNode } from 'react';
import { challenge, createMatch, headToHead, matchResult, playRally, REVIEW_FAILS, suggestInstruction, suggestStrategy, type ChallengePolicy, type MatchResult, type MatchState, type RallyEvent, type SideInput } from '../engine/match';
import type { Rng } from '../engine/rng';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import type { SeasonState } from '../engine/season';
import type { LiveRequest } from '../engine/tournament';
import { INSTRUCTIONS, STRATEGIES, type Instruction, type MatchConfig, type Ruleset, type Strategy } from '../engine/types';
import { t, type TextKey } from '../i18n';
import { Flag } from './Flag';
import { entrantLabel, eventName } from './game';
import { MatchLink } from './MatchDetail';
import { MatchStatsView } from './MatchStats';
import { MoraleTag } from './Squad';
import { PlayerName } from './nav';

const SPEEDS = { slow: 600, normal: 250, fast: 60 } as const;
const POLICIES: ChallengePolicy[] = ['never', 'sure', 'ask'];

/** Pengaturan challenge manajer (per perangkat); juga dipakai saat laga atlet sendiri disimulasikan tanpa Live Match. */
export function challengePolicy(): ChallengePolicy {
  try { const v = localStorage.getItem('bcm-challenge'); return POLICIES.includes(v as ChallengePolicy) ? v as ChallengePolicy : 'ask'; } catch { return 'ask'; }
}
const saveChallengePolicy = (v: ChallengePolicy) => { try { localStorage.setItem('bcm-challenge', v); } catch { /* mode privat */ } };

/**
 * Live Match: rally demi rally. Strategi dipilih sebelum laga, saat interval (11 poin; 8 poin di sistem 3×15), dan antar game.
 * Lawan (AI) memakai strategi 'balanced' dan challenge hanya bila atletnya sangat yakin.
 * `review`: Instant Review (Hawk-Eye) — bola tipis yang merugikan atlet sendiri menjeda laga bila pengaturannya 'Tanya saya'.
 */
export function LiveMatch({ sides, names, ids, entrants, mySide, cfg, rng, title, review, preview, onDone, onSkipRound }: {
  sides: [SideInput, SideInput]; names: [string, string]; ids?: [string, string]; mySide: 0 | 1; cfg: MatchConfig; rng: Rng; title: string; review?: boolean;
  /** Id peserta (atlet / pasangan): nama di papan skor bisa diklik ke profil (pop-up diperkecil dulu). */
  entrants?: [string, string];
  /** Kartu pra-laga (H2H, ranking), tampil sampai reli pertama. */
  preview?: ReactNode;
  onDone: (r: MatchResult) => void; onSkipRound?: () => void;
}) {
  const st = useRef<MatchState>(null);
  if (!st.current) st.current = createMatch(sides, cfg, rng, review);
  const m = st.current;
  const [, render] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('normal');
  const [log, setLog] = useState<{ ev: RallyEvent; score: string }[]>([]);
  const [strategy, setStrategy] = useState<Strategy>('balanced');
  const [instruction, setInstruction] = useState<Instruction>('none');
  const [tip] = useState(() => suggestStrategy(sides[mySide].players, sides[1 - mySide].players));
  const [hidden, setHidden] = useState(false);
  const [view, setView] = useState<'log' | 'stats'>('log');
  const [policy, setPolicy] = useState(challengePolicy);
  const [hawk, setHawk] = useState(false); // tayangan Hawk-Eye sedang berjalan
  const resume = useRef(false); // lanjut otomatis setelah keputusan challenge bila laga sedang berjalan
  const hide = () => { setRunning(false); setHidden(true); }; // laga dijeda selama pop-up disembunyikan

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const record = (ev: RallyEvent) => {
    if (ev.interval || ev.gameOver) setInstruction('none'); // instruksi berlaku sampai jeda berikutnya
    const score = ev.gameOver ? m.games.at(-1)!.join('-') : m.score.join('-');
    setLog((l) => [{ ev, score }, ...l].slice(0, 12));
    render((x) => x + 1);
    return !(ev.interval || ev.gameOver); // berhenti di interval & akhir game agar strategi bisa diganti
  };

  const step = () => {
    if (m.winner !== undefined || m.pending) return false;
    m.sides[mySide].strategy = strategy;
    m.sides[mySide].instruction = instruction === 'none' ? undefined : instruction;
    m.sides[mySide].challenge = policy;
    const ev = playRally(m, cfg, rng);
    if (ev.pending) { resume.current = running; render((x) => x + 1); return false; } // bola tipis: tunggu keputusan
    return record(ev);
  };

  const decide = (yes: boolean) => {
    const go = () => { setHawk(false); if (record(challenge(m, cfg, yes)) && resume.current) setRunning(true); };
    if (!yes) return go();
    setHawk(true);
    setTimeout(go, 1500); // ponytail: jeda tegang "Hawk-Eye…" tanpa animasi lapangan
  };

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => { if (!step()) setRunning(false); }, SPEEDS[speed]);
    return () => clearInterval(id);
  });

  const finish = () => {
    m.sides[mySide].strategy = strategy;
    m.sides[mySide].instruction = instruction === 'none' ? undefined : instruction;
    m.sides[mySide].challenge = policy === 'ask' ? 'sure' : policy; // disimulasikan: tidak ada yang ditanya
    if (m.pending) challenge(m, cfg);
    while (m.winner === undefined) playRally(m, cfg, rng); // instruksi hilang sendiri di jeda berikutnya
    setRunning(false);
    setInstruction('none');
    render((x) => x + 1);
  };

  const gamesWon = (side: 0 | 1) => m.games.filter((g) => g[side] > g[1 - side]).length;
  const done = m.winner !== undefined;
  // Momentum dari sudut pandang atlet sendiri: positif = kita di atas angin.
  const momentum = mySide === 0 ? m.momentum : -m.momentum;
  const insTip = suggestInstruction(m, mySide);
  const order = [mySide, 1 - mySide] as const; // panel kondisi: sisi sendiri dulu

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
        <table className="board live-board">
          <tbody>
            {([0, 1] as const).map((s) => (
              <tr key={s} className={s === mySide ? 'mine' : ''}>
                <td className="srv" title={m.server === s && !done ? t('serve') : undefined}>{m.server === s && !done ? '●' : ''}</td>
                <td><Flag id={ids?.[s]} />{entrants ? <PlayerName id={entrants[s]} before={hide}>{names[s]}</PlayerName> : names[s]}{(sides[s].day ?? 0) >= cfg.dayForm.hotFrom && <> <span className="fire" title={t('onFireHint')} aria-label={t('onFire')}>🔥</span></>}</td>
                {m.games.map((g, i) => <td key={i} className="num muted">{g[s]}</td>)}
                {!done && <td className="pt">{m.score[s]}</td>}
                <td className="num"><b>{gamesWon(s)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="momentum" title={t('momentum')}>
          <span>{t('momentum')}</span>
          <span className="track"><span className="marker" style={{ left: `${50 + momentum * 50}%` }} /></span>
        </div>

        {/* Kondisi tiap sisi: energi laga ini, kelelahan sebelum laga & morale tiap atlet — dasar memilih strategi & instruksi. */}
        <div className="live-cond">
          {order.map((s) => {
            const e = Math.round(m.sides[s].energy);
            return (
              <div key={s} className={s === mySide ? 'mine' : undefined}>
                <div className="cond-energy" title={t('energy')}>
                  <span className="bar"><span style={{ width: `${e}%`, background: e >= 70 ? 'var(--accent)' : e >= 40 ? 'var(--gold)' : 'var(--danger)' }} /></span>
                  <b>{e}</b> <small>{t(e >= 70 ? 'energyFresh' : e >= 40 ? 'energyTired' : 'energyLow')}</small>
                </div>
                {/* Jadwal harian: sisa lelah dari laga sebelumnya di turnamen ini & laga kedua hari ini. */}
                {((sides[s].load ?? 0) >= 1 || !!sides[s].today) && (
                  <small className="muted-text" title={t('tourLoadHint')}>
                    {!!sides[s].today && <>⚡ {t('nthToday', { n: sides[s].today! + 1 })} · </>}{t('tourLoad', { n: Math.round(sides[s].load ?? 0) })}
                  </small>
                )}
                {sides[s].players.map((p) => (
                  <div key={p.id} className="cond-player">
                    <PlayerName id={p.id} className="cond-name" before={hide}>{p.name}</PlayerName>
                    <MoraleTag value={p.form} />
                    <small className="muted-text" title={t('fatiguePreHint')}>{t('fatigue')} {Math.round(p.fatigue)}%</small>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {m.rallies === 0 && preview && <div className="prematch">{preview}</div>}
        {m.pending && (() => {
          const l = m.pending.line!;
          const left = REVIEW_FAILS - m.fails[mySide];
          return (
            <div className="review card" role="alert">
              {hawk
                ? <p className="hawk">🎥 {t('hawkEye')}</p>
                : <>
                  <p>🎥 {t('lineJudge')}: <b>{t(l.call === 'in' ? 'callIn' : 'callOut')}</b> · <span className="muted-text">{t(`react_${l.react}` as TextKey, { name: names[mySide] })}</span></p>
                  <div className="secondary">
                    <button className="primary" onClick={() => decide(true)}>{t('reviewBtn')} ({t('challengesLeft', { n: left })})</button>
                    <button onClick={() => decide(false)}>{t('continue')}</button>
                  </div>
                </>}
            </div>
          );
        })()}
        {!done && !m.pending && (m.rallies === 0 || !running) && (
          <div className="live-tips">
            {m.rallies === 0 && (
              <p>
                <span>💡 <span className="muted-text">{t('stratTip')}:</span> <b>{t(`strat_${tip.strategy}` as TextKey)}</b>
                  {tip.edge && <small className="muted-text"> · {t(tip.edge.mine as TextKey)} {tip.edge.a} vs {t(tip.edge.theirs as TextKey)} {tip.edge.b}</small>}</span>
                {tip.strategy !== strategy && <button className="mini" onClick={() => setStrategy(tip.strategy)}>{t('useTip')}</button>}
              </p>
            )}
            {insTip.instruction !== 'none' && (
              <p>
                <span>🗣 <span className="muted-text">{t('instrTip')}:</span> <b>{t(`instr_${insTip.instruction}` as TextKey)}</b>
                  {insTip.reason && <small className="muted-text"> · {t(`instrReason_${insTip.reason}` as TextKey, { n: Math.round(m.sides[mySide].energy) })}</small>}</span>
                {insTip.instruction !== instruction && <button className="mini" onClick={() => setInstruction(insTip.instruction)}>{t('useTip')}</button>}
              </p>
            )}
          </div>
        )}
        {!done && (
          <div className="livecontrols">
            <label>{t('strategy')}
              <select value={strategy} disabled={running} onChange={(e) => setStrategy(e.target.value as Strategy)}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{t(`strat_${s}` as TextKey)}</option>)}
              </select>
            </label>
            <label title={t('instrUntil')}>{t('instruction')}
              <select value={instruction} disabled={running} onChange={(e) => setInstruction(e.target.value as Instruction)}>
                {INSTRUCTIONS.map((s) => <option key={s} value={s}>{t(`instr_${s}` as TextKey)}</option>)}
              </select>
            </label>
            {review && (
              <label title={t('reviewHint')}>{t('reviewBtn')}
                <select value={policy} onChange={(e) => { const v = e.target.value as ChallengePolicy; setPolicy(v); saveChallengePolicy(v); }}>
                  {POLICIES.map((p) => <option key={p} value={p}>{t(`challenge_${p}` as TextKey)}</option>)}
                </select>
              </label>
            )}
            <label>{t('gameSpeed')}
              <select value={speed} onChange={(e) => setSpeed(e.target.value as keyof typeof SPEEDS)}>
                {Object.keys(SPEEDS).map((s) => <option key={s} value={s}>{t(`speed_${s}` as TextKey)}</option>)}
              </select>
            </label>
            {running
              ? <button className="primary main" onClick={() => setRunning(false)}>{t('pause')}</button>
              : <button className="primary main" disabled={!!m.pending} onClick={() => setRunning(true)}>{m.rallies === 0 ? t('startMatch') : t('resume')}</button>}
            <div className="secondary">
              <button disabled={running || !!m.pending} onClick={() => step()}>{t('oneRally')}</button>
              <button disabled={hawk} onClick={finish} title={t('autoFinish')}>{t('simMatchShort')}</button>
              {onSkipRound && <button onClick={() => { finish(); onDone(matchResult(m)); onSkipRound(); }} title={t('simRound')}>{t('simRoundShort')}</button>}
            </div>
          </div>
        )}
        {/* Pengaruh strategi yang dipilih ke pola permainan & energi atlet (nilai di ruleset.match.strategies). */}
        {!done && <p className="hint">{t(`stratInfo_${strategy}` as TextKey)}{instruction !== 'none' && <><br />🗣 {t(`instrInfo_${instruction}` as TextKey)}</>}</p>}
        {!running && !done && m.rallies > 0 && <p className="hint">{t('strategyHint')}</p>}
        {/* Hasil & Lanjut tepat di bawah papan skor: langsung terjangkau di HP tanpa menggulir. */}
        {done && (
          <div className="livecontrols">
            <b className="main">{names[m.winner!]} {t('wins')}!{m.retired !== undefined && <small className="muted-text"> 🚑 {t('retiredInjury', { name: names[m.retired] })}</small>}</b>
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
                {/* Hawk-Eye: bola sebenarnya (keputusan hakim garis dibalik bila salah); warna dari sudut pandang atlet sendiri. */}
                {ev.line?.challenged && <small> · 🎥 {t('challengeBy', { name: names[ev.line.by] })}: <b className={(ev.line.by === mySide) === ev.line.wrong ? 'pos' : 'neg'}>
                  {t((ev.line.call === 'in') !== ev.line.wrong ? 'callIn' : 'callOut')}!</b> {t(ev.line.wrong ? 'challengeWon' : 'challengeLost')}</small>}
                {ev.retired !== undefined && <small> · 🚑 {t('retiredInjury', { name: names[ev.retired] })}</small>}
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
  // Ranking & H2H dari sudut pandang sendiri (kiri = kita), seperti panel kondisi.
  const mine = req.entrants.indexOf(me) === 0;
  return (
    <dl className="pre-grid">
      <div><dt>{t('rank')}</dt><dd><b>{ranks.get(me) ?? '–'}</b> <span className="muted-text">vs</span> {ranks.get(opp) ?? '–'}</dd></div>
      <div><dt>{t('h2h')}</dt><dd>{w + l ? <b>{mine ? `${w}–${l}` : `${l}–${w}`}</b> : <span className="muted-text">{t('neverMet')}</span>}</dd></div>
      {lastMeet && (
        <div className="wide"><dt>{t('lastMeeting')}</dt>
          <dd>{eventName(ruleset, lastMeet.tournamentId, lastMeet.year)} {lastMeet.year} {lastMeet.round} · <b className={lastMeet.winner === i ? 'pos' : 'neg'}>{lastMeet.winner === i ? t('wins') : t('lost')}</b>{' '}
            <MatchLink m={lastMeet} name={name} title={eventName(ruleset, lastMeet.tournamentId, lastMeet.year)}>{lastMeet.scores.map((g) => `${g[i]}-${g[1 - i]}`).join(', ')}</MatchLink>
          </dd>
        </div>
      )}
    </dl>
  );
}
