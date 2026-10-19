import { useEffect, useMemo, useRef, useState } from 'react';
import { absWeek, computeRace, computeRanking, expiringPoints } from '../engine/ranking';
import { nextOlympics, olympicField, olympicRanking } from '../engine/olympics';
import { presetPack } from '../engine/pack';
import { makeRng } from '../engine/rng';
import { hostCityId, isHeld, weekOf, newSeason, playWeek, rankFromSnapshots, type SeasonState } from '../engine/season';
import { ageAt, currentAbility } from '../engine/generator';
import { ATTRS, DISCIPLINES, type Discipline, type Player, type Ruleset, type World } from '../engine/types';
import { dataName, numLocale, t, type TextKey } from '../i18n';
import { entrantLabel, eventName as eventNameOf, teamLabel, tierLabel } from './game';
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

/** Ranking dunia & Race (sub-tab per nomor), kalender & juara per tahun, daftar semua turnamen — untuk satu SeasonState. */
export function SeasonViews({ state, ruleset, world, version, onOpenPlayer, onOpenEvent }: {
  state: SeasonState; ruleset: Ruleset; world: World; version: number; onOpenPlayer?: (id: string) => void; onOpenEvent?: (id: string, year: number) => void;
}) {
  const [discipline, setDiscipline] = useState<Discipline>('MS');
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
  const lastChampions = state.champions.filter((c) => c.year === state.date.year && ruleset.calendar.find((e) => e.id === c.tournamentId)?.week === state.date.week - 1);

  return (
    <section>
      <nav className="controls">
        {(['ranking', 'calendar', 'events', 'nations', 'records'] as const).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{t(({ ranking: 'viewRanking', calendar: 'viewCalendar', events: 'viewEvents', nations: 'viewNations', records: 'viewRecords' } as const)[v])}</button>
        ))}
      </nav>
      {view === 'ranking' && (
        <nav className="controls subnav">
          {DISCIPLINES.map((d) => <button key={d} aria-pressed={d === discipline} onClick={() => { setDiscipline(d); setSelected(undefined); }}>{d}</button>)}
        </nav>
      )}
      <div className="controls">
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
      {view === 'ranking' && lastChampions.length > 0 && (
        <p><b>{t('lastWeekChampions')}:</b> {lastChampions.map((c) => `${eventName(c.tournamentId)} ${c.discipline}: ${name(c.winner).name}`).join(' · ')}</p>
      )}
      {view === 'calendar' && <Calendar state={state} ruleset={ruleset} world={world} year={calYear} short={(id) => name(id).name} onOpenEvent={onOpenEvent} />}
      {view === 'nations' && <NationsTable state={state} ruleset={ruleset} world={world} />}
      {view === 'records' && <Records state={state} ruleset={ruleset} world={world} onOpenPlayer={onOpenPlayer} />}
      {view === 'events' && <EventDirectory state={state} ruleset={ruleset} world={world} onOpenEvent={onOpenEvent} />}
      {view === 'ranking' && olympic && og && (
        <p className="hint">{t(olympic.projected ? 'olympicHintProjected' : 'olympicHint', { from: og.year - 1, to: og.year, n: olympic.field.size })}</p>
      )}
      {view === 'ranking' && <div className="split">
        <div>
          <table className="fit">
            <thead><tr><th className="num" title={prevRank ? t('rankMoveHint') : undefined}>#</th><th>{t('name')}</th><th className="hide-sm">{t('country')}</th><th className="num">{t('points')}</th><th className="num hide-sm">{t('tournaments')}</th>{olympic && <th className="hide-sm">{t('olympicQualified')}</th>}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.entrantId} onClick={() => setSelected(r.entrantId)} className={selected === r.entrantId ? 'sel' : ''} style={{ cursor: 'pointer' }}>
                  <td className="num rankcell">{r.rank} <small>{move(r.entrantId, r.rank)}</small></td><td><span className="show-sm"><Flag id={name(r.entrantId).country} /></span>{name(r.entrantId).name}{olympic && <span className="show-sm"> {qualified(r.entrantId)}</span>}</td><td className="hide-sm"><Flag id={name(r.entrantId).country} />{name(r.entrantId).country}</td>
                  <td className="num">{r.points.toLocaleString(numLocale())}</td><td className="num hide-sm">{r.tournamentsPlayed}</td>
                  {olympic && <td className="hide-sm">{qualified(r.entrantId)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected && <Detail id={selected} label={name(selected).name} state={state} discipline={discipline} ruleset={ruleset} eventName={eventName} junior={mode === 'junior'} />}
      </div>}
    </section>
  );
}

function Detail({ id, label, state, discipline, ruleset, eventName, junior }: {
  id: string; label: string; state: SeasonState; discipline: Discipline; ruleset: Ruleset; eventName: (id: string) => string; junior?: boolean;
}) {
  const now = absWeek(state.date);
  const history = rankFromSnapshots(state, id, discipline);
  const expiring = expiringPoints(junior ? state.juniorResults ?? [] : state.results, id, discipline, now, 12, ruleset);
  // HP: panel ada di bawah tabel → gulir ke panel saat atlet dipilih.
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (window.innerWidth < 900) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [id]);
  return (
    <aside ref={ref}>
      <h3>{label}</h3>
      <h4>{t('rankHistory')}</h4>
      <RankChart history={history} />
      <h4>{t('expiringSoon')}</h4>
      {expiring.length === 0 ? <p>—</p> : (
        <table>
          <tbody>{expiring.map((e, i) => (
            <tr key={i}><td>{eventName(e.entry.tournamentId)} {e.entry.year}</td><td className="num">{e.entry.points}</td>
              <td>{e.weeksLeft} {t('weeksLeft')}</td><td>{e.counted ? t('counted') : t('notCounted')}</td></tr>
          ))}</tbody>
        </table>
      )}
    </aside>
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
      {[1, best, worst].filter((v, i, a) => a.indexOf(v) === i).map((r) => (
        <g key={r}><line x1={L} x2={W - R} y1={y(r)} y2={y(r)} stroke="var(--line)" /><text x={L - 4} y={y(r) + 3} fontSize="9" textAnchor="end" fill="currentColor">{r}</text></g>
      ))}
      {years.map((yr) => { const a = Math.max(x0, yr * 52 + 1); return (
        <g key={yr}><line x1={x(a)} x2={x(a)} y1={T} y2={H - B} stroke="var(--line)" strokeDasharray="2 3" /><text x={x(a) + 2} y={H - 8} fontSize="9" fill="currentColor">{yr}</text></g>
      ); })}
      {segs.filter((p) => p.length > 1).map((p, i) => <polyline key={i} points={p.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" />)}
      {ranked.map((h, i) => <circle key={h.absWeek} cx={x(h.absWeek)} cy={y(h.rank!)} r={i === hover ? 4.5 : h === last ? 3.5 : 2} fill="var(--accent)" />)}
      {hover === undefined && <text x={x(last.absWeek) - 4} y={y(last.rank!) - 6} fontSize="10" fontWeight="700" textAnchor="end" fill="var(--accent)">#{last.rank}</text>}
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
  const events = ruleset.calendar.filter((e) => isHeld(e, year)).sort((a, b) => weekOf(a, year) - weekOf(b, year));
  const teams = ruleset.team.events.filter((e) => isHeld(e, year));
  const city = new Map(world.cities.map((c) => [c.id, c]));
  // Kejuaraan beregu: juara per format (Thomas/Uber/Sudirman/…) di kolom nomor.
  const teamRow = (e: (typeof teams)[number]) => (
    <tr key={e.id} className={year === state.date.year && weekOf(e, year) === state.date.week ? 'sel' : ''}>
      <td className="num">{weekOf(e, year)}</td><td>{onOpenEvent ? <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenEvent(e.id, year); }}>{eventNameOf(ruleset, e.id, year)}</a> : eventNameOf(ruleset, e.id, year)}</td><td>{teamLabel(e)}</td>
      <td className="hide-sm">{dataName(city.get(hostCityId(e, year))?.name)} ({city.get(hostCityId(e, year))?.countryId})</td>
      <td className="num hide-sm">—</td>
      <td colSpan={DISCIPLINES.length}>{state.teamResults.filter((x) => x.eventId === e.id && x.year === year).map((x) => {
        const w = winnerOf(x);
        return w && <span key={x.format} style={{ marginRight: 12, whiteSpace: 'nowrap' }}><small className="muted-text">{formatName(x.format, x.eventId)}</small> <Flag id={w} />{w}</span>;
      })}</td>
    </tr>
  );
  return (
    <div className="scroll">
      <table>
        <thead><tr><th className="num">{t('week')}</th><th>{t('tournament')}</th><th>{t('tier')}</th><th className="hide-sm">{t('city')}</th><th className="num hide-sm">{t('prize')}</th>{DISCIPLINES.map((d) => <th key={d}>{d}</th>)}</tr></thead>
        <tbody>{[...events, ...teams].sort((a, b) => weekOf(a, year) - weekOf(b, year)).map((e) => !('tierId' in e) ? teamRow(e) : (
          <tr key={e.id} className={year === state.date.year && weekOf(e, year) === state.date.week ? 'sel' : ''}>
            <td className="num">{weekOf(e, year)}</td><td>{onOpenEvent ? <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenEvent(e.id, year); }}>{dataName(e.name)}</a> : dataName(e.name)}</td><td>{tierLabel(e.tierId)}</td>
            <td className="hide-sm">{dataName(city.get(hostCityId(e, year))?.name)} ({city.get(hostCityId(e, year))?.countryId})</td>
            <td className="num hide-sm">{e.prizeUsd ? `$${e.prizeUsd.toLocaleString(numLocale())}` : '—'}</td>
            {DISCIPLINES.map((d) => {
              const c = state.champions.find((x) => x.year === year && x.tournamentId === e.id && x.discipline === d);
              return <td key={d}>{c && <><Flag id={entrantLabel(state, c.winner).country} />{short(c.winner)}</>}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
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
 * Daftar semua turnamen di ruleset (termasuk yang tidak digelar tiap tahun / baru mulai tahun depan), per tier:
 * frekuensi, edisi berikutnya (tahun, minggu, tuan rumah) & juara terakhir. Klik → halaman turnamen.
 */
function EventDirectory({ state, ruleset, world, onOpenEvent }: { state: SeasonState; ruleset: Ruleset; world: World; onOpenEvent?: (id: string, year: number) => void }) {
  const { year, week } = state.date;
  const city = new Map(world.cities.map((c) => [c.id, c]));
  const all = [...ruleset.calendar.map((e) => ({ e, tier: e.tierId })), ...ruleset.team.events.map((e) => ({ e, tier: e.countries ? 'MSG' : 'TEAM' }))];
  const next = (e: (typeof all)[number]['e']) => {
    for (let y = year; y < year + 12; y++) if (isHeld(e, y) && (y > year || weekOf(e, y) >= week)) return y;
    return undefined;
  };
  const tiers = [...new Set(all.map((x) => x.tier))];
  const tierName = (id: string) => (id === 'TEAM' ? t('teamShort') : id === 'MSG' ? tierLabel(id) : dataName(ruleset.tiers.find((x) => x.id === id)?.name) ?? id);
  const freq = (e: (typeof all)[number]['e']) => (!e.everyYears ? t('everyYear') : e.everyYears.invert ? t('mostYears', { n: e.everyYears.interval }) : t('everyNYears', { n: e.everyYears.interval }));
  return (
    <>{tiers.map((tier) => (
      <section key={tier} className="card">
        <h3>{tierName(tier)} <span className="muted-text">({all.filter((x) => x.tier === tier).length})</span></h3>
        <table className="fit"><tbody>{all.filter((x) => x.tier === tier)
          .map((x) => ({ ...x, y: next(x.e) }))
          .sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999) || (a.y ? weekOf(a.e, a.y) - weekOf(b.e, b.y!) : 0))
          .map(({ e, y }) => {
            const host = y ? city.get(hostCityId(e, y)) : undefined;
            const last = state.champions.filter((c) => c.tournamentId === e.id).at(-1)?.year ?? state.teamResults.filter((r) => r.eventId === e.id).at(-1)?.year;
            return (
              <tr key={e.id}>
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
