import { useEffect, useState, type ReactNode } from 'react';
import type { Match, PointType } from '../engine/types';
import { MatchStatsView } from './MatchStats';
import { t } from '../i18n';
import { Flag } from './Flag';
import { PlayerName } from './nav';


const TYPES: PointType[] = ['smash', 'net', 'clear', 'drop', 'error', 'service'];

/** Pop-up detail laga yang sudah selesai: skor per game & statistik jenis poin (bila masih tersimpan). */
export function MatchDetail({ m, name, title, onClose }: {
  m: Match; name: (id: string) => string; title?: string; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const total = (s: 0 | 1) => m.scores.reduce((sum, g) => sum + g[s], 0);
  return (
    <div className="modal" role="dialog" aria-label={t('matchDetail')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="live card" style={{ width: 'min(560px, 100%)' }}>
        <button className="close" aria-label={t('close')} title={t('close')} onClick={onClose}>✕</button>
        <h3>{title ? `${title} · ` : ''}{m.discipline} · {m.round}</h3>
        <table className="board scoreline">
          <tbody>{([0, 1] as const).map((s) => (
            <tr key={s} className={m.winner === s ? 'winner' : ''}>
              <td><Flag id={m.sides[s]} /><PlayerName id={m.sides[s]}>{name(m.sides[s])}</PlayerName></td>
              {m.scores.map((g, i) => <td key={i} className={`num${g[s] > g[1 - s] ? '' : ' muted'}`}>{g[s]}</td>)}
            </tr>
          ))}</tbody>
        </table>
        {(m.walkover || m.retired) && <p className="hint">{m.walkover ? t('walkover') : t('retiredMatch')}</p>}
        {m.stats && 'v' in m.stats ? <div style={{ marginTop: 8 }}><MatchStatsView s={m.stats} names={[name(m.sides[0]), name(m.sides[1])]} /></div>
        : m.stats ? (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>{t('pointType')}</th><th className="num">{name(m.sides[0]).split(' ')[0]}</th><th className="num">{name(m.sides[1]).split(' ')[0]}</th></tr></thead>
            <tbody>
              {/* Save lama: jumlah poin per jenis (sebelum statistik lengkap). */}
              {TYPES.map((k) => { const st = m.stats as Record<PointType, [number, number]>; return <tr key={k}><td>{t(k)}</td><td className="num">{st[k][0]}</td><td className="num">{st[k][1]}</td></tr>; })}
              <tr><td><b>{t('totalPoints')}</b></td><td className="num"><b>{total(0)}</b></td><td className="num"><b>{total(1)}</b></td></tr>
            </tbody>
          </table>
        ) : <p className="hint">{t('noStats')}</p>}
      </div>
    </div>
  );
}

/** Teks/elemen yang bisa diklik untuk membuka detail laga; pop-up dikelola di sini agar pemanggil cukup satu baris. */
export function MatchLink({ m, name, title, children }: { m: Match; name: (id: string) => string; title?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="#" title={t('matchDetail')} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>{children}</a>
      {open && <MatchDetail m={m} name={name} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}
