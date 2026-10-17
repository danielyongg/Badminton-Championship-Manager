import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { bowlAt, phaseOf, replayDraw } from '../engine/drawReplay';
import type { Candidate, EntryList } from '../engine/entry';
import type { DrawStep } from '../engine/types';
import { t } from '../i18n';
import { EntryLists, RoundColumns, stepText } from './EventViews';
import { Flag } from './Flag';

// Live drawing (gaya Football Manager): mangkuk pot di kiri, bagan / grup di kanan terisi langkah demi langkah.

const SPEEDS = { slow: 1500, normal: 700, fast: 200 } as const;
const SEED_POTS = [[1, 2], [3, 4], [5, 8], [9, 16], [17, 32]];

export interface DrawShowData { steps: DrawStep[]; size?: number; groups?: number; entry?: EntryList; qualSections?: (Candidate | null)[][] }

function phaseLabel(phase: string) {
  if (phase.startsWith('seed')) { const [a, b] = SEED_POTS[Number(phase.slice(4))] ?? [0, 0]; return t('draw_potSeeds', { a, b }); }
  if (phase.startsWith('pot')) return t('draw_pot', { k: phase.slice(3) });
  return t(({ step_bye: 'bye', step_qualifier: 'qualifying', step_place: 'draw_unseeded', step_swap: 'draw_separation', step_clash: 'draw_separation' } as const)[phase as 'step_bye'] ?? 'draw_start');
}

/** `page`: tampil di halaman turnamen (bukan pop-up); putar ulang undian tetap pop-up. */
export function LiveDraw({ title, show, name, mine, onClose, onSkipEvent, replay, page }: {
  title: string; show: DrawShowData; name: (id: string) => string; mine: (id: string) => boolean;
  onClose: () => void; onSkipEvent?: () => void; replay?: boolean; page?: boolean;
}) {
  const { steps } = show;
  // Sebelum undian babak utama: daftar entry, lalu bagan kualifikasi (bila ada).
  const stages = [...(show.entry ? ['entry'] : []), ...(show.qualSections?.length ? ['qual'] : []), 'draw'] as const;
  const [stage, setStage] = useState(0);
  const [idx, setIdx] = useState(0); // jumlah langkah yang sudah diumumkan
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<keyof typeof SPEEDS>('normal');
  const done = idx >= steps.length;
  // Posisi yang baru diisi digeser ke tengah layar (undian 128 posisi tidak muat satu layar, terutama di HP).
  const box = useRef<HTMLDivElement>(null);
  const wrap = (inner: ReactNode, ref?: Ref<HTMLDivElement>) => page
    ? <section className="card hub">{inner}</section>
    : <div className="modal" role="dialog" aria-label={t('draw_title')} ref={ref}><div className="live card">{inner}</div></div>;
  useEffect(() => { box.current?.querySelector('.flash')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [idx]);
  const drawing = stages[stage] === 'draw';

  useEffect(() => {
    if (!drawing || !running || done) return;
    const id = setTimeout(() => setIdx((i) => i + 1), SPEEDS[speed]);
    return () => clearTimeout(id);
  }, [drawing, running, done, idx, speed]);

  const board = replayDraw(steps, idx);
  const last = steps[idx - 1];
  const touched = new Set(last ? (last.key === 'step_swap' ? [Number(last.vars.a), Number(last.vars.b)] : [last.pos ?? -1]) : []);
  const next = steps[idx];
  const bowl = done ? [] : bowlAt(steps, idx);
  const left = done ? 0 : steps.slice(idx).filter((s) => phaseOf(s) === phaseOf(next)).length;
  const who = (id?: string) => (id ? <span className={mine(id) ? 'mine' : undefined}><Flag id={id} />{name(id)}</span> : null);

  const half = (from: number, to: number) => (
    <table className="drawboard">
      <tbody>{Array.from({ length: to - from + 1 }, (_, i) => from + i).map((p) => {
        const s = board.slots[p] ?? {};
        return (
          <tr key={p} className={touched.has(p) ? 'flash' : ''}>
            <td className="num">{p}</td>
            <td>{s.seed ? `[${s.seed}]` : s.qualifier ? '[Q]' : ''}</td>
            <td>{s.bye ? <span className="muted">{t('bye')}</span> : s.qualifier ? <span className="muted">{t('qualifying')}</span> : who(s.entrant)}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );

  if (!drawing) {
    const who2 = { name, mine };
    return wrap(
        <>
          <h3>{title} · {stages[stage] === 'entry' ? t('entryList') : t('qualDraw')}</h3>
          {stages[stage] === 'entry'
            ? <EntryLists entry={show.entry!} {...who2} />
            : show.qualSections!.map((sec, i) => (
              <div key={i}>
                <h4>{t('section')} {i + 1}</h4>
                <RoundColumns rounds={[sec.map((c) => c?.id ?? null)]} matches={[]} {...who2} />
              </div>
            ))}
          <div className="controls roundbar">
            <button className="primary" onClick={() => setStage(stage + 1)}>{stages[stage + 1] === 'qual' ? t('qualDraw') : t('mainDraw')} →</button>
            {onSkipEvent && <button onClick={() => { onSkipEvent(); onClose(); }}>{t('draw_skipEvent')}</button>}
          </div>
        </>
    );
  }

  return wrap(
      <>
        {/* Judul, pengumuman & kontrol menempel di atas saat bagan digulir. */}
        <div className="drawhead">
        <h3>{title} · {t('draw_title')}</h3>
        <p className="announce">{last ? stepText(last, name) : t('draw_start')}</p>
        <div className="controls">
          {!done && (running
            ? <button onClick={() => setRunning(false)}>{t('pause')}</button>
            : <button onClick={() => setRunning(true)}>{t('resume')}</button>)}
          {!done && <button onClick={() => { setRunning(false); setIdx(idx + 1); }}>{t('nextStep')}</button>}
          {!done && <button onClick={() => setIdx(steps.length)}>{t('draw_skipToEnd')}</button>}
          <label>{t('gameSpeed')}
            <select value={speed} onChange={(e) => setSpeed(e.target.value as keyof typeof SPEEDS)}>
              {Object.keys(SPEEDS).map((s) => <option key={s} value={s}>{t(`speed_${s}` as 'speed_slow')}</option>)}
            </select>
          </label>
          <button className="primary" onClick={onClose}>{replay ? t('draw_closeReplay') : t('draw_close')}</button>
          {onSkipEvent && <button onClick={() => { onSkipEvent(); onClose(); }}>{t('draw_skipEvent')}</button>}
        </div>
        </div>
        <div className="drawlayout">
          <section className="bowl">
            <h4>{done ? t('draw_done') : phaseLabel(phaseOf(next))}</h4>
            {!done && (bowl.length
              ? <ul>{bowl.map((id) => <li key={id}>{who(id)}</li>)}</ul>
              : <p className="muted">{t('draw_left', { n: left })}</p>)}
          </section>
          {show.groups ? (
            <div className="groups">
              {Array.from({ length: show.groups }, (_, i) => String.fromCharCode(65 + i)).map((g) => (
                <section key={g} className={`card ${last?.vars.g === g ? 'flash' : ''}`}>
                  <h4>{t('group')} {g}</h4>
                  <ol>{(board.groups[g] ?? []).map((id) => <li key={id}>{who(id)}</li>)}</ol>
                </section>
              ))}
            </div>
          ) : (
            <div className="halves">
              <div><h4>{t('draw_topHalf')}</h4>{half(1, (show.size ?? 0) / 2)}</div>
              <div><h4>{t('draw_bottomHalf')}</h4>{half((show.size ?? 0) / 2 + 1, show.size ?? 0)}</div>
            </div>
          )}
        </div>
      </>, box,
  );
}
