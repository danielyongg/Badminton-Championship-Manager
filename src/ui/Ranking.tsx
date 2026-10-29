import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { absWeek, activeEntries, computeRace, computeRanking, expiringPoints } from '../engine/ranking';
import { nextOlympics, olympicField, olympicRanking } from '../engine/olympics';
import { presetPack } from '../engine/pack';
import { makeRng } from '../engine/rng';
import { hostCityId, isHeld, weekOf, newSeason, playWeek, rankFromSnapshots, type SeasonState } from '../engine/season';
import { ageAt, currentAbility } from '../engine/generator';
import { ATTRS, DISCIPLINES, type Discipline, type Player, type RankingEntry, type Ruleset, type World } from '../engine/types';
import { dataName, numLocale, t, type TextKey } from '../i18n';
import { CAL_GROUPS, entrantLabel, eventName as eventNameOf, groupLabel, tierGroup, TierBadge } from './game';
import { Flag } from './Flag';
import { formatName, winnerOf } from './Team';
import { NationsTable, Records } from './WorldRecords';

/** Lab: dunia simulasi sendiri dengan tombol maju minggu, menampilkan SeasonViews. */
export function Ranking({ ruleset, world, seed }: { ruleset: Ruleset; world: World; seed: number }) {
  // Dunia simulasi sendiri (objek atlet terpisah), karena musim mengubah kelelahan/lokasi atlet.
  const make = () => ({ state: newSeason(world, ruleset, seed, { year: ruleset.startYear, week: 1 }, null, presetPack(ruleset)), rng: makeRng(seed) });
  const sim = useRef(make());
  const [key, setKey] = useState(`${seed}:${ruleset.id}`);
  if (key !== `${seed}:${ruleset.id}`) { sim.current = make(); setKey(`${seed}:${ruleset.id}`); }
  const [version, setVersion] = useState(0);
  const { state } = sim.current;
  const advance = async (weeks: number) => {
    for (let i = 0; i < weeks; i++) await playWeek(state, ruleset, world, sim.current.rng);
    setVersion((x) => x + 1);
  };
  return (
    <section>
      <div className="controls">
        <b>{state.date.year} · {t('week')} {state.date.week}</b>
        <button onClick={() => advance(1)}>{t('playWeek')}</button>
        <button onClick={() => advance(52 - state.date.week + 1)}>{t('playSeason')}</button>
      </div>
      <SeasonViews state={state} ruleset={ruleset} world={world} version={version} />
    </section>
  );
}

const PAGE = 100;

/** Ranking dunia & Race (sub-tab per nomor), kalender & juara per tahun, daftar semua turnamen — untuk satu SeasonState. */
export function SeasonViews({ state, ruleset, world, version, onOpenPlayer, onOpenEvent, initialDiscipline = 'MS' }: {
  initialDiscipline?: Discipline; state: SeasonState; ruleset: Ruleset; world: World; version: number; onOpenPlayer?: (id: string) => void; onOpenEvent?: (id: string, year: number) => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>(initialDiscipline);
  const [mode, setMode] = useState<'world' | 'race' | 'junior' | 'olympic'>('world');
  const og = nextOlympics(ruleset, state.date.year);
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'ranking' | 'calendar' | 'events' | 'nations' | 'records'>('ranking');
  const [calYear, setCalYear] = useState(shownYear(state));
  // Kalender: musim lalu (juara) sampai 3 musim ke depan (turnamen baru / edisi berikutnya ikut terlihat).
  const calYears = [...new Set([...Array.from({ length: 4 }, (_, i) => state.date.year + 3 - i), shownYear(state), ...state.champions.map((c) => c.year)])].sort((a, b) => b - a);
  const now = absWeek(state.date);
  // Riwayat: ranking per minggu lampau (musim ini & musim lalu), dihitung ulang dari hasil yang sudah ada saat itu.
  const [asOf, setAsOf] = useState<number>();
  const at = asOf ?? now;
  const start = Math.max((state.date.year - 1) * 52 + 1, state.rankSnapshots.length ? state.rankSnapshots[0].absWeek - 3 : state.date.year * 52 + 1); // sejak awal karier, maks musim lalu
  const histWeeks = Array.from({ length: Math.max(0, now - start) }, (_, i) => now - 1 - i);
  const byYear = new Map<number, number[]>();
  for (const a of histWeeks) { const y = yearOfAbs(a); byYear.set(y, [...(byYear.get(y) ?? []), a]); }
  const name = (id: string) => entrantLabel(state, id);
  const eventName = (id: string) => eventNameOf(ruleset, id) ?? t('preseason');

  // Ranking Olimpiade: periode kualifikasi + daftar lolos menurut kuota (✓ / benua / tuan rumah).
  const olympic = useMemo(() => (mode === 'olympic' && og ? {
    ...olympicRanking(state, ruleset, discipline, og.year),
    field: new Map(olympicField(state, ruleset, discipline, og.year, world).map((c) => [c.id, c.via])),
  } : undefined), [version, discipline, mode, ruleset]);
  // Tabel ranking per halaman 100 (1–100, 101–200, …); kembali ke halaman 1 saat nomor / jenis / minggu diganti.
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [discipline, mode, asOf]);
  const tableTop = useRef<HTMLDivElement>(null);
  // Ranking junior kosong: turnamen junior berikutnya musim ini (poin junior hanya dari turnamen junior).
  const nextJunior = ruleset.calendar.filter((e) => isHeld(e, state.date.year) && ruleset.tiers.find((x) => x.id === e.tierId)?.junior && weekOf(e, state.date.year) >= state.date.week)
    .sort((a, b) => weekOf(a, state.date.year) - weekOf(b, state.date.year))[0];
  const pager = (bottom: boolean) => rows.length > PAGE && (
    <nav className={`controls subnav${bottom ? ' pager-bottom' : ''}`}>
      {Array.from({ length: Math.ceil(rows.length / PAGE) }, (_, i) => (
        <button key={i} aria-pressed={i === page} onClick={() => { setPage(i); if (bottom) tableTop.current?.scrollIntoView({ block: 'start' }); }}>
          {i * PAGE + 1}–{Math.min((i + 1) * PAGE, rows.length)}
        </button>
      ))}
    </nav>
  );
  const qualified = (id: string) => olympic?.field.has(id) && (
    <span className="badge good">✓{olympic.field.get(id) !== 'rank' ? ` ${t(olympic.field.get(id) === 'host' ? 'olympicHost' : 'olympicContinent')}` : ''}</span>
  );
  const rows = useMemo(() => {
    const upTo = (rs: typeof state.results) => (asOf === undefined ? rs : rs.filter((e) => absWeek(e) <= at));
    if (olympic) return olympic.rows;
    return mode === 'world' ? computeRanking(upTo(state.results), discipline, at, ruleset)
      : mode === 'junior' ? computeRanking(upTo(state.juniorResults ?? []), discipline, at, ruleset)
      : computeRace(upTo(state.results), discipline, yearOfAbs(at), ruleset);
  }, [version, discipline, mode, at, ruleset, olympic]);
  // Layar lebar: panel kanan tidak pernah kosong — sebelum ada yang diklik tampil atlet terbaik negara sendiri (atau #1).
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const shown = selected ?? (wide ? (rows.find((r) => name(r.entrantId).country === state.managedCountryId) ?? rows[0])?.entrantId : undefined);
  // Perubahan peringkat dibanding ranking minggu sebelumnya (world & junior): ▲ naik, ▼ turun, BARU = baru masuk ranking.
  const prevRank = useMemo(() => {
    if (mode !== 'world' && mode !== 'junior') return undefined;
    const src = (mode === 'world' ? state.results : state.juniorResults ?? []).filter((e) => absWeek(e) <= at - 2); // hasil dicatat di minggu turnamen; ranking minggu lalu belum memuatnya
    return new Map(computeRanking(src, discipline, at - 1, ruleset).map((r) => [r.entrantId, r.rank]));
  }, [version, discipline, mode, at, ruleset]);
  const move = (id: string, rank: number) => {
    if (!prevRank?.size) return null;
    const before = prevRank.get(id);
    if (before === undefined) return <span className="up">{t('rankNew')}</span>;
    const d = before - rank;
    return d ? <span className={d > 0 ? 'up' : 'down'}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span> : <span className="muted-text">–</span>;
  };

  return (
    <section>
      <nav className="controls">
        {(['ranking', 'calendar', 'events', 'nations', 'records'] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(({ ranking: 'viewRanking', calendar: 'viewCalendar', events: 'viewEvents', nations: 'viewNations', records: 'viewRecords' } as const)[v])}</button>
        ))}
      </nav>
      <div className={`controls${view === 'ranking' ? ' pair' : ''}`}>
        {view === 'calendar' && (
          <label>{t('year')}
            <select value={calYear} onChange={(e) => setCalYear(Number(e.target.value))}>
              {calYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        )}
        {view === 'ranking' && <>
        <label>{t('rankingType')}
          <select value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setSelected(undefined); }}>
            <option value="world">{t('worldRanking')}</option>
            <option value="race">{t('raceToFinals')}</option>
            <option value="junior">{t('juniorRanking')}</option>
            {og && <option value="olympic">{t('olympicRanking', { y: og.year })}</option>}
          </select>
        </label>
        {view === 'ranking' && mode !== 'olympic' && (
          <label>{t('rankAsOf')}
            <select value={asOf ?? ''} onChange={(e) => setAsOf(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">{t('rankCurrent')}</option>
              {[...byYear].map(([y, list]) => (
                <optgroup key={y} label={String(y)}>
                  {list.map((a) => <option key={a} value={a}>{t('week')} {weekOfAbs(a)}{weekOfAbs(a) === 52 ? ` (${t('seasonEnd')})` : ''} · {y}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        </>}
      </div>
      {view === 'calendar' && <Calendar state={state} ruleset={ruleset} world={world} year={calYear} short={(id) => name(id).name} onOpenEvent={onOpenEvent} />}
      {view === 'nations' && <NationsTable state={state} ruleset={ruleset} world={world} onOpenPlayer={onOpenPlayer} />}
      {view === 'records' && <Records state={state} ruleset={ruleset} world={world} onOpenPlayer={onOpenPlayer} />}
      {view === 'events' && <EventDirectory state={state} ruleset={ruleset} world={world} onOpenEvent={onOpenEvent} />}
      {view === 'ranking' && mode === 'junior' && rows.length === 0 && nextJunior && (
        <p className="hint">{t('juniorRankEmpty', { name: eventName(nextJunior.id), w: weekOf(nextJunior, state.date.year) })}</p>
      )}
      {view === 'ranking' && olympic && og && (
        <p className="hint">{t(olympic.projected ? 'olympicHintProjected' : 'olympicHint', { from: og.year - 1, to: og.year, n: olympic.field.size })}</p>
      )}
      {view === 'ranking' && <div className="split">
        <div ref={tableTop}>
          <nav className="controls subnav">
            {DISCIPLINES.map((d) => <button key={d} aria-pressed={d === discipline} onClick={() => { setDiscipline(d); setSelected(undefined); }}>{d}</button>)}
          </nav>
          {pager(false)}
          <table className="fit ranktable">
            <thead><tr><th className="num" title={prevRank ? t('rankMoveHint') : undefined}>#</th><th>{t('name')}</th><th className="hide-sm">{t('country')}</th><th className="num">{t('points')}</th><th className="num hide-sm">{t('tournaments')}</th>{olympic && <th className="hide-sm">{t('olympicQualified')}</th>}</tr></thead>
            <tbody>
              {rows.slice(page * PAGE, (page + 1) * PAGE).map((r) => (
                <tr key={r.entrantId} onClick={() => setSelected(r.entrantId)} className={[shown === r.entrantId && 'sel', name(r.entrantId).country === state.managedCountryId && 'mine-row'].filter(Boolean).join(' ') || undefined} style={{ cursor: 'pointer' }}>
                  <td className="num rankcell">{r.rank} <small>{move(r.entrantId, r.rank)}</small></td><td><span className="show-sm"><Flag id={name(r.entrantId).country} /></span>{name(r.entrantId).name}{olympic && <span className="show-sm"> {qualified(r.entrantId)}</span>}</td><td className="hide-sm"><Flag id={name(r.entrantId).country} />{name(r.entrantId).country}</td>
                  <td className="num">{r.points.toLocaleString(numLocale())}</td><td className="num hide-sm">{r.tournamentsPlayed}</td>
                  {olympic && <td className="hide-sm">{qualified(r.entrantId)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {pager(true)}
        </div>
        {shown && <Detail id={shown} label={name(shown).name} onOpen={onOpenPlayer} onOpenEvent={onOpenEvent} state={state} discipline={discipline} ruleset={ruleset} junior={mode === 'junior'} />}
      </div>}
    </section>
  );
}

function Detail({ id, label, onOpen, onOpenEvent, state, discipline, ruleset, junior }: {
  id: string; label: string; onOpen?: (id: string) => void; onOpenEvent?: (id: string, year: number) => void; state: SeasonState; discipline: Discipline; ruleset: Ruleset; junior?: boolean;
}) {
  // HP: panel ada di bawah tabel → gulir ke panel saat atlet dipilih.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (window.innerWidth < 900) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [id]);
  return (
    <aside ref={ref} className="sidepanel">
      <h3>{onOpen ? <a href="#" onClick={(e) => { e.preventDefault(); onOpen(id); }}>{label}</a> : label}</h3>
      <RankingDetail state={state} ruleset={ruleset} id={id} discipline={discipline} junior={junior} onOpenEvent={onOpenEvent} />
    </aside>
  );
}

/**
 * Rincian ranking satu peserta (dipakai panel ranking Dunia & tab Ranking di profil): ringkasan (peringkat, poin, jumlah
 * turnamen, peringkat terbaik, Race to Finals), grafik riwayat, poin per turnamen (yang masuk 10 terbaik ditandai) dan
 * poin yang kedaluwarsa 12 minggu ke depan.
 */
export function RankingDetail({ state, ruleset, id, discipline: d, junior, onOpenEvent, wide }: {
  state: SeasonState; ruleset: Ruleset; id: string; discipline: Discipline; junior?: boolean; onOpenEvent?: (id: string, year: number) => void;
  /** Kartu selebar halaman (profil dengan satu nomor): di laptop ringkasan & grafik di kiri, daftar poin di kanan. */
  wide?: boolean;
}) {
  const now = absWeek(state.date);
  const results = junior ? state.juniorResults ?? [] : state.results;
  const { bestOf } = ruleset.ranking;
  const me = computeRanking(results, d, now, ruleset).find((r) => r.entrantId === id);
  const active = activeEntries(results, d, now).filter((e) => e.entrantId === id).sort((a, b) => b.points - a.points);
  const counted = new Set(active.slice(0, bestOf));
  const history = junior ? [] : rankFromSnapshots(state, id, d, ruleset); // snapshot hanya ranking senior
  const ranked = history.filter((h) => h.rank !== undefined);
  const best = ranked.length ? Math.min(...ranked.map((h) => h.rank!)) : undefined;
  const race = junior ? undefined : computeRace(state.results, d, state.date.year, ruleset).find((r) => r.entrantId === id);
  const expiring = expiringPoints(results, id, d, now, 12, ruleset);
  // Minggu di peringkat saat ini (dicatat tiap akhir minggu; total hanya untuk peringkat 1–100).
  const rw = !junior && me ? state.rankWeeks?.[d]?.[id] : undefined;
  const atRank = rw && rw.r === me!.rank ? rw : undefined;
  const atRisk = expiring.filter((e) => e.counted).reduce((sum, e) => sum + e.entry.points, 0);
  const num = (n: number) => n.toLocaleString(numLocale());
  // Poin awal pra-musim (bukan turnamen): tanpa tautan & tanpa badge tier.
  const pre = (e: RankingEntry) => e.tierId === 'PRE';
  const preRows = active.filter(pre);
  const evLink = (e: RankingEntry) => {
    if (pre(e)) return t('preseasonPoints');
    const name = `${eventNameOf(ruleset, e.tournamentId, e.year) ?? e.tournamentId} ${e.year}`;
    return onOpenEvent ? <a href="#" onClick={(x) => { x.preventDefault(); onOpenEvent(e.tournamentId, e.year); }}>{name}</a> : name;
  };
  // Babak yang dicapai di turnamen itu (laga terakhir peserta di nomor ini).
  const reached = (e: RankingEntry) => {
    const last = state.matches.filter((m) => m.tournamentId === e.tournamentId && m.year === e.year && m.discipline === d && m.sides.includes(id)).at(-1);
    return !last ? '' : last.round === 'F' && last.sides[last.winner] === id ? `🏆 ${t('champion')}` : last.round;
  };
  const tile = (k: string, v: ReactNode, sub?: ReactNode) => <div><b>{v}</b><small>{k}</small>{sub && <small className="sub">{sub}</small>}</div>;
  if (!active.length && !ranked.length) return <p className="hint">{t('noRankPoints')}</p>;
  return (
    <div className={`rankdetail${wide ? ' wide' : ''}`}>
      <div>
      {/* Ringkasan: kotak angka besar + label (gaya statistik Federasi). */}
      <div className="stats auto">
        {tile(t(junior ? 'juniorRanking' : 'worldRanking'), me ? `#${me.rank}` : '—')}
        {me && tile(t('points'), num(me.points))}
        {tile(t('tournaments'), active.length, t('rankCountedOf', { n: Math.min(active.length, bestOf), b: bestOf }))}
        {!junior && tile(t('bestRank'), best ? `#${best}` : '—')}
        {race && tile(`${t('raceToFinals')} ${state.date.year}`, `#${race.rank}`, `${num(race.points)} ${t('points').toLowerCase()}`)}
        {atRank && atRank.at[me!.rank] !== undefined && tile(t('weeksAtRank', { r: me!.rank }), num(atRank.at[me!.rank]), t('weeksTotal'))}
        {atRank && tile(t('weeksAtRankRun', { r: me!.rank }), num(atRank.run), t('weeksConsecutive'))}
        {tile(t('expiringShort'), atRisk ? `−${num(atRisk)}` : '0', t('next12Weeks'))}
      </div>
      {!junior && <><h4>{t('rankHistory')}</h4><RankChart history={history} /></>}
      <h4>{t('expiringSoon')}</h4>
      {expiring.length > 0 && <p className="hint">{t('expiringHint')}</p>}
      {expiring.length === 0 ? <p className="hint">{t('noExpiring')}</p> : (
        <div className="dlist rankpts">{expiring.map((e, i) => (
          <div key={i} className={`drow${e.counted ? '' : ' muted-row'}`}>
            <span className="rp-weeks"><b>{e.weeksLeft}</b><small>{t('weeksShortUnit')}</small></span>
            <span className="grow">{evLink(e.entry)}<small className={e.counted ? 'up' : 'muted-text'}>{e.counted ? t('counted') : t('notCounted')}</small></span>
            <span className="rp-pts"><b className={e.counted ? 'down' : undefined}>−{num(e.entry.points)}</b></span>
          </div>
        ))}</div>
      )}
      </div>
      <div>
      <h4>{t('rankPointsFrom')}</h4>
      {active.length === 0 ? <p className="hint">—</p> : (
        <div className="dlist rankpts">{active.filter((e) => !pre(e) || e === preRows[0]).map((e, i) => {
          // Poin awal pra-musim (banyak entri sama): satu baris "×n", status dihitung bila ada yang masuk 10 terbaik.
          const group = pre(e) ? preRows : [e];
          const on = group.some((x) => counted.has(x));
          return (
            <div key={i} className={`drow${on ? '' : ' muted-row'}`}>
              {pre(e) ? <span className="tierb pre"><b>—</b></span> : <TierBadge tierId={e.tierId} />}
              <span className="grow">{evLink(e)}<small className="muted-text">{pre(e) ? `${group.length} × ${num(e.points)}` : reached(e)}</small></span>
              <span className="rp-pts"><b>{num(group.reduce((sum, x) => sum + x.points, 0))}</b><small className={on ? 'up' : 'muted-text'}>{on ? t('counted') : t('notCounted')}</small></span>
            </div>
          );
        })}</div>
      )}
      </div>
    </div>
  );
}

/** Grafik garis peringkat (peringkat 1 di atas): titik tiap snapshot (4 minggu), label tahun di sumbu bawah. */
export function RankChart({ history }: { history: { absWeek: number; rank?: number }[] }) {
  const ranked = history.filter((h) => h.rank !== undefined);
  const [hover, setHover] = useState<number>();
  if (ranked.length < 2) return <p className="hint">—</p>;
  const W = 360, H = 170, L = 30, R = 8, T = 10, B = 22;
  const best = Math.min(...ranked.map((h) => h.rank!)), worst = Math.max(...ranked.map((h) => h.rank!), 10);
  const x0 = history[0].absWeek, x1 = history[history.length - 1].absWeek;
  const x = (a: number) => L + ((a - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const y = (r: number) => T + ((r - 1) / Math.max(1, worst - 1)) * (H - T - B);
  // Garis putus bila atlet keluar dari top 300 (tanpa peringkat).
  const segs: string[][] = [[]];
  for (const h of history) {
    if (h.rank === undefined) segs.push([]);
    else segs[segs.length - 1].push(`${x(h.absWeek)},${y(h.rank)}`);
  }
  const years = [...new Set(history.map((h) => yearOfAbs(h.absWeek)))];
  const last = ranked[ranked.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W }} role="img" aria-label={t('rankHistory')} className="rankchart" onMouseLeave={() => setHover(undefined)}>
      {/* Label sumbu: lewati yang terlalu dekat dengan label sebelumnya (mis. 1 & 2) agar tidak bertumpuk. */}
      {[1, best, worst].filter((v, i, a) => a.indexOf(v) === i && a.slice(0, i).every((u) => Math.abs(y(u) - y(v)) >= 10)).map((r) => (
        <g key={r}><line x1={L} x2={W - R} y1={y(r)} y2={y(r)} stroke="var(--line)" /><text x={L - 4} y={y(r) + 3} fontSize="9" textAnchor="end" fill="currentColor">{r}</text></g>
      ))}
      {years.map((yr) => { const a = Math.max(x0, yr * 52 + 1); return (
        <g key={yr}><line x1={x(a)} x2={x(a)} y1={T} y2={H - B} stroke="var(--line)" strokeDasharray="2 3" /><text x={x(a) + 2} y={H - 8} fontSize="9" fill="currentColor" textAnchor={x(a) > W - R - 24 ? 'end' : undefined}>{yr}</text></g>
      ); })}
      {segs.filter((p) => p.length > 1).map((p, i) => <polyline key={i} points={p.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />)}
      {ranked.map((h, i) => <circle key={h.absWeek} cx={x(h.absWeek)} cy={y(h.rank!)} r={i === hover ? 4.5 : h === last ? 3.5 : 2} fill="var(--accent)" />)}
      {hover === undefined && <text x={x(last.absWeek) - 4} y={y(last.rank!) < T + 12 ? y(last.rank!) + 14 : y(last.rank!) - 6} fontSize="10" fontWeight="700" textAnchor="end" fill="var(--accent)">#{last.rank}</text>}
      {hover !== undefined && (() => {
        // Label hover: peringkat + minggu/tahun, digeser agar tetap di dalam grafik.
        const h = ranked[hover], cx = x(h.absWeek), cy = y(h.rank!);
        const bw = 92, bx = Math.min(W - R - bw, Math.max(L, cx - bw / 2)), by = cy - 34 < 0 ? cy + 8 : cy - 34;
        return (
          <g pointerEvents="none">
            <line x1={cx} x2={cx} y1={T} y2={H - B} stroke="var(--accent)" strokeOpacity=".35" />
            <rect x={bx} y={by} width={bw} height={26} rx={4} fill="var(--surface)" stroke="var(--accent)" />
            <text x={bx + bw / 2} y={by + 11} fontSize="10" fontWeight="700" textAnchor="middle" fill="var(--accent)">#{h.rank}</text>
            <text x={bx + bw / 2} y={by + 22} fontSize="8.5" textAnchor="middle" fill="currentColor">{t('week')} {weekOfAbs(h.absWeek)} · {yearOfAbs(h.absWeek)}</text>
          </g>
        );
      })()}
      {/* Area hover: kolom tak terlihat per titik (mudah disentuh juga di HP). */}
      {ranked.map((h, i) => {
        const prev = ranked[i - 1], next = ranked[i + 1];
        const x1 = prev ? (x(prev.absWeek) + x(h.absWeek)) / 2 : L, x2 = next ? (x(next.absWeek) + x(h.absWeek)) / 2 : W - R;
        return <rect key={h.absWeek} x={x1} y={0} width={Math.max(1, x2 - x1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />;
      })}
    </svg>
  );
}

const yearOfAbs = (a: number) => Math.floor((a - 1) / 52);
const weekOfAbs = (a: number) => a - yearOfAbs(a) * 52;

/** Musim yang ditampilkan: di minggu 1 (musim baru belum dimulai) tampilkan musim yang baru selesai. */
const shownYear = (s: SeasonState) => (s.date.week === 1 ? s.date.year - 1 : s.date.year);

export function Calendar({ state, ruleset, world, short, onOpenEvent, year = shownYear(state) }: { state: SeasonState; ruleset: Ruleset; world: World; short: (id: string) => string; onOpenEvent?: (id: string, year: number) => void; year?: number }) {
  const city = new Map(world.cities.map((c) => [c.id, c]));
  const tierOf = (id: string) => ruleset.tiers.find((x) => x.id === id);
  // Satu baris data per turnamen, dipakai tabel (desktop) & daftar per minggu (HP).
  // Juara: per nomor (individu) atau per format (beregu, negara pemenang).
  const rows = [...ruleset.calendar, ...ruleset.team.events].filter((e) => isHeld(e, year)).map((e) => {
    const individual = 'tierId' in e;
    const c = city.get(hostCityId(e, year));
    return {
      id: e.id, week: weekOf(e, year), team: !individual, group: tierGroup(individual ? tierOf(e.tierId) : undefined, individual ? undefined : e),
      name: individual ? dataName(e.name) : eventNameOf(ruleset, e.id, year),
      badge: individual ? <TierBadge tierId={e.tierId} /> : <TierBadge team={e} />,
      place: c && `${dataName(c.name)} (${c.countryId})`,
      prize: individual && e.prizeUsd ? `$${e.prizeUsd.toLocaleString(numLocale())}` : '—',
      champs: individual
        ? DISCIPLINES.map((d) => ({ key: d as string, label: d as string, id: state.champions.find((x) => x.year === year && x.tournamentId === e.id && x.discipline === d)?.winner }))
        : state.teamResults.filter((x) => x.eventId === e.id && x.year === year).map((x) => ({ key: x.format as string, label: formatName(x.format, x.eventId), id: winnerOf(x) })),
    };
  }).sort((a, b) => a.week - b.week);
  // Filter kelompok tier (hanya kelompok yang ada tahun ini) agar daftar setahun tidak terlalu panjang.
  const groups = CAL_GROUPS.filter((g) => rows.some((r) => r.group === g));
  const [group, setGroup] = useState<string>('all');
  const shown = rows.filter((r) => group === 'all' || r.group === group);
  const now = (week: number) => year === state.date.year && week === state.date.week;
  const link = (r: (typeof rows)[number]) => (onOpenEvent ? <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenEvent(r.id, year); }}>{r.name}</a> : r.name);
  const who = (r: (typeof rows)[number], id?: string) => id && (r.team
    ? <><Flag id={id} />{id}</> // beregu: negara juara
    : <><Flag id={entrantLabel(state, id).country} />{short(id)}</>);
  return (
    <>
      <nav className="controls subnav">
        {['all', ...groups].map((g) => <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{groupLabel(g)}</button>)}
        <span className="count">{t(shown.length === 1 ? 'countTournament' : 'countTournaments', { n: shown.length })}</span>
      </nav>
      {/* Desktop: tabel lebar dengan kolom juara per nomor. */}
      <div className="scroll cal-table">
        <table>
          <thead><tr><th className="num">{t('week')}</th><th>{t('tournament')}</th><th>{t('tier')}</th><th>{t('city')}</th><th className="num">{t('prize')}</th>{DISCIPLINES.map((d) => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id} className={now(r.week) ? 'sel' : ''}>
              <td className="num">{r.week}</td><td>{link(r)}</td><td>{r.badge}</td><td>{r.place}</td><td className="num">{r.prize}</td>
              {r.team
                ? <td colSpan={DISCIPLINES.length}>{r.champs.map((c) => c.id && <span key={c.key} style={{ marginRight: 12, whiteSpace: 'nowrap' }}><small className="muted-text">{c.label}</small> {who(r, c.id)}</span>)}</td>
                : r.champs.map((c) => <td key={c.key}>{who(r, c.id)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {/* HP: satu baris ringkas per turnamen (minggu & tier di kiri), juara di bawah nama — tanpa geser ke samping.
          Bendera juara satu baris; ketuk untuk kota & nama lengkap juara. Belum dimainkan: kota. */}
      <div className="dlist cal-list">{shown.map((r) => (
        <div key={r.id} className={`drow${now(r.week) ? ' now' : ''}`}>
          <div className="calwk"><small>{t('weekShort')}{r.week}</small>{r.badge}</div>
          <div className="grow">
            <b>{link(r)}</b>
            {!r.champs.some((c) => c.id) ? <small className="muted-text">{r.place}</small> : (
              <details className="cal-champs">
                <summary>{r.champs.filter((c) => c.id).map((c) => (
                  <span key={c.key}><small>{c.label}</small><Flag id={r.team ? c.id : entrantLabel(state, c.id!).country} /></span>
                ))}</summary>
                <small className="muted-text">{r.place}</small>
                <ul>{r.champs.filter((c) => c.id).map((c) => <li key={c.key}><span className="chip">{c.label}</span> {who(r, c.id)}</li>)}</ul>
              </details>
            )}
          </div>
        </div>
      ))}</div>
    </>
  );
}

/** Status tiap turnamen wajib Top Committed satu peserta (atlet tunggal / pasangan). */
export function commitmentStatus(state: SeasonState, ruleset: Ruleset, entrantId: string) {
  const year = state.commitmentsYear ?? state.date.year;
  const week = state.date.year > year ? 53 : state.date.week;
  const played = new Set(state.matches.filter((m) => m.year === year && m.sides.includes(entrantId)).map((m) => m.tournamentId));
  const missed = new Set(state.violations.filter((v) => v.year === year && v.entrantId === entrantId).map((v) => v.tournamentId));
  return (state.commitments[entrantId] ?? []).map((id) => {
    const ev = ruleset.calendar.find((e) => e.id === id);
    const w = ev ? weekOf(ev, year) : 0;
    const status = played.has(id) ? 'done' : missed.has(id) ? 'missed' : w < week ? 'excused' : 'upcoming';
    return { id, week: w, tierId: ev?.tierId ?? '', status } as const;
  }).sort((a, b) => weekOf(a, year) - weekOf(b, year));
}

/** Chip turnamen wajib: ✓ diikuti · ✗ absen (pelanggaran) · cedera (dikecualikan) · mendatang (minggu). */
export function CommitmentChips({ state, ruleset, entrantId }: { state: SeasonState; ruleset: Ruleset; entrantId: string }) {
  return (
    <span className="tc-chips">{commitmentStatus(state, ruleset, entrantId).map((c) => (
      <span key={c.id} className={`tc ${c.status}`} title={`${eventNameOf(ruleset, c.id) ?? c.id} · ${c.tierId} · ${t('week')} ${c.week} — ${t(`tc_${c.status}` as TextKey)}`}>
        {c.status === 'done' ? '✓ ' : c.status === 'missed' ? '✗ ' : ''}{eventNameOf(ruleset, c.id) ?? c.id}{c.status === 'upcoming' && <small> · {t('weekShort')}{c.week}</small>}
      </span>
    ))}</span>
  );
}

/**
 * Daftar semua turnamen di ruleset (termasuk yang tidak digelar tiap tahun / baru mulai tahun depan), per kelompok badge tier
 * (urutan sama dengan filter kalender), di dalamnya tier tertinggi dulu lalu edisi berikutnya:
 * frekuensi, edisi berikutnya (tahun, minggu, tuan rumah) & juara terakhir. Klik → halaman turnamen.
 */
function EventDirectory({ state, ruleset, world, onOpenEvent }: { state: SeasonState; ruleset: Ruleset; world: World; onOpenEvent?: (id: string, year: number) => void }) {
  const { year, week } = state.date;
  const city = new Map(world.cities.map((c) => [c.id, c]));
  const tierOf = (id: string) => ruleset.tiers.find((x) => x.id === id);
  const all = [...ruleset.calendar.map((e) => ({ e, tier: tierOf(e.tierId), group: tierGroup(tierOf(e.tierId)), badge: <TierBadge tierId={e.tierId} /> })),
    ...ruleset.team.events.map((e) => ({ e, tier: undefined, group: tierGroup(undefined, e), badge: <TierBadge team={e} /> }))];
  const next = (e: (typeof all)[number]['e']) => {
    for (let y = year; y < year + 12; y++) if (isHeld(e, y) && (y > year || weekOf(e, y) >= week)) return y;
    return undefined;
  };
  const groups = CAL_GROUPS.filter((g) => all.some((x) => x.group === g));
  const strength = (x: (typeof all)[number]) => x.tier?.points[0] ?? Infinity; // beregu = kejuaraan utama kelompoknya, di atas
  const freq = (e: (typeof all)[number]['e']) => (!e.everyYears ? t('everyYear') : e.everyYears.invert ? t('mostYears', { n: e.everyYears.interval }) : t('everyNYears', { n: e.everyYears.interval }));
  return (
    <>{groups.map((g) => (
      <section key={g} className="card">
        <h3>{groupLabel(g)} <span className="muted-text">({all.filter((x) => x.group === g).length})</span></h3>
        <table className="fit eventdir"><tbody>{all.filter((x) => x.group === g)
          .map((x) => ({ ...x, y: next(x.e) }))
          .sort((a, b) => strength(b) - strength(a) || (a.y ?? 9999) - (b.y ?? 9999) || (a.y ? weekOf(a.e, a.y) - weekOf(b.e, b.y!) : 0))
          .map(({ e, y, badge }) => {
            const host = y ? city.get(hostCityId(e, y)) : undefined;
            const last = state.champions.filter((c) => c.tournamentId === e.id).at(-1)?.year ?? state.teamResults.filter((r) => r.eventId === e.id).at(-1)?.year;
            return (
              <tr key={e.id}>
                <td className="tiercell">{badge}</td>
                <td>
                  {onOpenEvent ? <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenEvent(e.id, last ?? y ?? year); }}>{eventNameOf(ruleset, e.id, y ?? year)}</a> : eventNameOf(ruleset, e.id, y ?? year)}
                  <br /><small className="muted-text">{freq(e)}{host && <> · <Flag id={host.countryId} />{dataName(host.name)}</>}</small>
                </td>
                <td className="num">{y ? <>{y}<br /><small className="muted-text">{t('weekShort')}{weekOf(e, y)}</small></> : '—'}</td>
              </tr>
            );
          })}</tbody></table>
      </section>
    ))}</>
  );
}
