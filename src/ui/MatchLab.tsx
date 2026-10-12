import { useState } from 'react';
import { LiveMatch } from './LiveMatch';
import { currentAbility } from '../engine/generator';
import { headToHead, simulateMatch, type MatchResult } from '../engine/match';
import { makeRng } from '../engine/rng';
import type { Match, MatchConfig, Player, PointType } from '../engine/types';
import { t } from '../i18n';

const TYPES: PointType[] = ['smash', 'net', 'clear', 'drop', 'error', 'service'];

/** Uji coba mesin pertandingan: pilih dua atlet tunggal, simulasikan, lihat skor, statistik & H2H. */
export function MatchLab({ players, cfg }: { players: Player[]; cfg: MatchConfig }) {
  const top = [...players].sort((a, b) => currentAbility(b.attrs) - currentAbility(a.attrs)).slice(0, 200);
  const [a, setA] = useState(top[0].id);
  const [b, setB] = useState(top[1].id);
  const [history, setHistory] = useState<Match[]>([]);
  const [last, setLast] = useState<MatchResult>();
  const [live, setLive] = useState(false);
  const byId = new Map(top.map((p) => [p.id, p]));
  const pa = byId.get(a) ?? top[0], pb = byId.get(b) ?? top[1];

  const play = (n: number) => {
    const rng = makeRng(Date.now() + history.length); // ponytail: seed dari jam; save game nanti memakai seed tersimpan
    const results: Match[] = [];
    let r: MatchResult | undefined;
    for (let i = 0; i < n; i++) {
      r = simulateMatch([{ players: [pa] }, { players: [pb] }], cfg, rng);
      results.push({ ...r, id: `${history.length + i}`, tournamentId: 'lab', year: 0, discipline: 'MS', round: 'F', sides: [pa.id, pb.id] });
    }
    setHistory([...history, ...results]);
    setLast(r);
  };

  const h2h = headToHead(history, pa.id, pb.id);
  const select = (value: string, set: (v: string) => void) => (
    <select value={value} onChange={(e) => { set(e.target.value); setHistory([]); setLast(undefined); }}>
      {top.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.countryId}, {currentAbility(p.attrs)})</option>)}
    </select>
  );

  return (
    <section>
      <div className="controls">
        <label>{t('sideA')}{select(a, setA)}</label>
        <label>{t('sideB')}{select(b, setB)}</label>
        <button onClick={() => play(1)}>{t('playOne')}</button>
        <button onClick={() => play(100)}>{t('playHundred')}</button>
        <button onClick={() => setLive(true)}>{t('playLive')}</button>
      </div>
      {live && (
        <LiveMatch
          sides={[{ players: [pa] }, { players: [pb] }]} names={[pa.name, pb.name]} mySide={0} cfg={cfg}
          rng={makeRng(Date.now())} title={t('liveMatch')}
          onDone={(r) => {
            setLive(false);
            setLast(r);
            setHistory([...history, { ...r, id: `${history.length}`, tournamentId: 'lab', year: 0, discipline: 'MS', round: 'F', sides: [pa.id, pb.id] }]);
          }}
        />
      )}
      {last && (
        <>
          <p><b>{t('score')}:</b> {last.scores.map(([x, y]) => `${x}-${y}`).join(', ')} → {(last.winner === 0 ? pa : pb).name}</p>
          <table style={{ maxWidth: 420 }}>
            <thead><tr><th>{t('pointType')}</th><th>{pa.name}</th><th>{pb.name}</th></tr></thead>
            <tbody>{TYPES.map((k) => <tr key={k}><td>{t(k)}</td><td className="num">{last.stats[k][0]}</td><td className="num">{last.stats[k][1]}</td></tr>)}</tbody>
          </table>
          <p><b>{t('h2h')}:</b> {h2h[0]} – {h2h[1]}</p>
        </>
      )}
    </section>
  );
}
