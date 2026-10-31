import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { bowlAt, phaseOf, replayDraw } from '../engine/drawReplay';
import type { Candidate } from '../engine/entry';
import type { Discipline, DrawStep } from '../engine/types';
import { t } from '../i18n';
import { RoundColumns, stepText } from './EventViews';
import { Flag } from './Flag';import { PlayerName } from './nav';


// Live drawing (gaya Football Manager): mangkuk pot di kiri, bagan / grup di kanan terisi langkah demi langkah.

const SPEEDS = { slow: 1500, normal: 700, fast: 200 } as const;
const SEED_POTS = [[1, 2], [3, 4], [5, 8], [9, 16], [17, 32]];

export interface DrawShowData { steps: DrawStep[]; size?: number; groups?: number; quals?: { discipline: Discipline; sections: (Candidate | null)[][] }[]; ko?: true }

function phaseLabel(phase: string) {
  if (phase.startsWith('seed')) { const [a, b] = SEED_POTS[Number(phase.slice(4))] ?? [0, 0]; return t('draw_potSeeds', { a, b }); }
  if (phase.startsWith('pot')) return t('draw_pot', { k: phase.slice(3) });
  return t(({ step_bye: 'bye', step_qualifier: 'qualifying', step_place: 'draw_unseeded', step_swap: 'draw_separation', step_clash: 'draw_separation', step_winner: 'draw_groupWinners', step_runnerUp: 'draw_runnersUp' } as const)[phase as 'step_bye'] ?? 'draw_start');
}

/** `page`: tampil di halaman turnamen (bukan pop-up); putar ulang undian tetap pop-up. */
export function LiveDraw({ title, qualTitle, show, name, mine, onClose, onSkipEvent, replay, page }: {
  title: string; qualTitle?: string; show: DrawShowData; name: (id: string) => string; mine: (id: string) => boolean;
  onClose: () => void; onSkipEvent?: () => void; replay?: boolean; page?: boolean;
}) {
  const { steps } = show;
  // Sebelum undian babak utama: bagan kualifikasi semua nomor (tab per nomor, bila ada).
  const quals = show.quals ?? [];
  const stages = [...(quals.length ? ['qual'] : []), 'draw'] as const;
  const [stage, setStage] = useState(0);
  const [qd, setQd] = useState(quals[0]?.discipline);
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
  const who = (id?: string) => (id ? <span className={mine(id) ? 'mine' : undefined}><Flag id={id} /><PlayerName id={id}>{name(id)}</PlayerName></span> : null);
  // Di slot bagan bendera sudah menunjukkan negara: kode "(INA)" dibuang agar nama muat.
  const slotWho = (id?: string) => (id ? <span className={mine(id) ? 'mine' : undefined}><Flag id={id} /><PlayerName id={id}>{name(id).replace(/ \([A-Z]{3}\)$/, '')}</PlayerName></span> : null);

  // Bagan dibagi 4 seksi (kuarter) seperti bagan BWF; tiap posisi satu baris, posisi kosong disamarkan.
  const size = show.size ?? 0;
  const per = size >= 8 ? size / 4 : size;
  const quarterOf = (p: number) => Math.ceil(p / per);
  const quarter = (q: number) => {
    const from = (q - 1) * per + 1, pos = Array.from({ length: per }, (_, i) => from + i);
    const filled = pos.filter((p) => { const x = board.slots[p]; return x && (x.entrant || x.bye || x.qualifier); }).length;
    const hasMine = pos.some((p) => { const e = board.slots[p]?.entrant; return e && mine(e); });
    return (
      <section key={q} className={`drawq${pos.some((p) => touched.has(p)) ? ' active' : ''}`}>
        <h4>{per < size && <b>Q{q}</b>}<span>{from}–{from + per - 1}</span>{hasMine && <span className="mine">●</span>}<small>{filled}/{per}</small></h4>
        <ol className="drawslots">{pos.map((p) => {
          const x = board.slots[p] ?? {};
          const empty = !x.entrant && !x.bye && !x.qualifier;
          return (
            <li key={p} className={`${touched.has(p) ? 'flash' : ''}${empty ? ' empty' : ''}${x.entrant && mine(x.entrant) ? ' minerow' : ''}`}>
              <span className="pos">{p}</span>
              <span className="seedtag">{x.seed ? x.seed : x.tag ?? (x.qualifier ? 'Q' : '')}</span>
              <span className="nm">{x.bye ? <span className="muted">{t('bye')}</span> : x.qualifier ? <span className="muted">{t('qualifying')}</span> : empty ? '·' : slotWho(x.entrant)}</span>
            </li>
          );
        })}</ol>
      </section>
    );
  };
  // Sorotan langkah terakhir: atlet besar + posisinya; langkah tanpa atlet (bye, pemisahan) cukup kalimatnya.
  const lastSlot = last?.pos !== undefined ? board.slots[last.pos] : undefined;
  const spotlight = last?.entrant && last.pos !== undefined && last.key !== 'step_swap' ? (
    <div className={`drawspot${mine(last.entrant) ? ' mine' : ''}`} key={idx}>
      {lastSlot?.seed || lastSlot?.tag ? <span className="seedtag big">{lastSlot.seed || lastSlot.tag}</span> : null}
      <span className="nm"><Flag id={last.entrant} /><PlayerName id={last.entrant}>{name(last.entrant)}</PlayerName></span>
      <span className="to">→ {per < size ? `Q${quarterOf(last.pos)} · ` : ''}{last.pos}</span>
    </div>
  ) : null;

  if (!drawing) {
    const who2 = { name, mine };
    return wrap(
        <>
          <h3>{qualTitle ?? title} · {t('qualDraw')}</h3>
          {quals.length > 1 && (
            <nav className="controls subnav">
              {quals.map((q) => (
                <button key={q.discipline} aria-pressed={q.discipline === qd} onClick={() => setQd(q.discipline)}>
                  {q.discipline}{q.sections.flat().some((c) => c && mine(c.id)) && <span className="mine"> ●</span>}
                </button>
              ))}
            </nav>
          )}
          {quals.find((q) => q.discipline === qd)!.sections.map((sec, i) => (
            <div key={i}>
              <h4>{t('section')} {i + 1}</h4>
              <RoundColumns rounds={[sec.map((c) => c?.id ?? null)]} matches={[]} {...who2} />
            </div>
          ))}
          <div className="controls roundbar">
            <button className="primary" onClick={() => setStage(stage + 1)}>{t('mainDraw')} →</button>
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
        {spotlight ?? <p className="announce">{last ? stepText(last, name) : t('draw_start')}</p>}
        {/* Kontrol putar: tombol ringkas sebaris + pilihan kecepatan bersegmen. */}
        <div className="drawctl">
          {!done && (
            <span className="seg">
              {running
                ? <button onClick={() => setRunning(false)}>⏸ {t('pause')}</button>
                : <button onClick={() => setRunning(true)}>▶ {t('resume')}</button>}
              <button onClick={() => { setRunning(false); setIdx(idx + 1); }}>{t('nextStep')}</button>
              <button onClick={() => setIdx(steps.length)}>⏭ {t('draw_skipToEnd')}</button>
            </span>
          )}
          <span className="seg" role="group" aria-label={t('gameSpeed')}>
            {(Object.keys(SPEEDS) as (keyof typeof SPEEDS)[]).map((x) => (
              <button key={x} aria-pressed={speed === x} onClick={() => setSpeed(x)}>{t(`speed_${x}` as 'speed_slow')}</button>
            ))}
          </span>
        </div>
        </div>
        <div className="drawlayout">
          {/* Pot: atlet yang belum diundi di fase ini, sebagai chip; yang berikutnya diundi ditandai. */}
          <section className="bowl">
            <h4>{done ? t('draw_done') : phaseLabel(phaseOf(next))}{!done && <small> · {left}</small>}</h4>
            {!done && (bowl.length
              ? <ul>{bowl.map((id, i) => <li key={id} className={i === 0 ? 'next' : undefined}>{who(id)}</li>)}</ul>
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
            <div className={`drawquarters${per < size ? '' : ' one'}`}>{Array.from({ length: size / per }, (_, i) => quarter(i + 1))}</div>
          )}
        </div>
        <div className="controls roundbar">
          <button className="primary" onClick={onClose}>{replay ? t('draw_closeReplay') : t(show.ko ? 'draw_closeKo' : 'draw_close')}</button>
          {onSkipEvent && <button onClick={() => { onSkipEvent(); onClose(); }}>{t('draw_skipEvent')}</button>}
        </div>
      </>, box,
  );
}
