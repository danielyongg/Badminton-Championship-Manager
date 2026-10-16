import { useMemo, useState } from 'react';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import { entrantsFor, hostCityId, openTo, weekOf, isHeld, isManaged, releasedIds, teamFormatsIn, teamStrengths, weekKey } from '../engine/season';
import { autoSquad, squadError, squadPool } from '../engine/team';
import { contingentOf, inContingent, lockWeek } from '../engine/contingent';
import { DISCIPLINES, isDoubles, type Discipline, type TeamFormat, type TournamentDef } from '../engine/types';
import { dataName, t } from '../i18n';
import { entrantLabel, eventName, lookup, saveGame, teamLabel, tierLabel, useGame } from './game';
import { FatigueBar } from './Squad';
import { isPratama } from '../engine/generator';
import { formatName, SquadPicker } from './Team';
import { plannableEvents, planWeek, type PlanCell } from '../engine/plan';

/** Kalender & entry: daftar jadwal turnamen musim ini + status entry; klik turnamen → isi entry-nya. */
export function Entries({ onOpenEvent }: { onOpenEvent?: (id: string, year: number) => void }) {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const { year, week } = state.date;
  const [open, setOpen] = useState<string>();
  const [showPast, setShowPast] = useState(false); // turnamen yang sudah selesai disembunyikan dulu (minggu ini langsung terlihat)
  const [view, setView] = useState<'calendar' | 'plan'>('calendar');
  const submit = (id: string) => { (state.entriesSubmitted ??= {})[`${year}:${id}`] = true; changed(); void saveGame(game); setOpen(undefined); };
  const teamEv = open && ruleset.team.events.find((e) => e.id === open);
  if (teamEv) return (
    <>
      <p><button onClick={() => setOpen(undefined)}>← {t('back')}</button></p>
      <h3>{t('week')} {weekOf(teamEv, year)} · {eventName(ruleset, teamEv.id, year)} <small className="muted-text">{teamLabel(teamEv)}</small></h3>
      <TeamSquads eventId={teamEv.id} formats={teamEv.formats ?? teamFormatsIn(ruleset, year)} onSubmit={() => submit(teamEv.id)} />
    </>
  );
  const ev = open && ruleset.calendar.find((e) => e.id === open);
  if (ev) return (
    <>
      <p><button onClick={() => setOpen(undefined)}>← {t('back')}</button></p>
      <h3>{t('week')} {weekOf(ev, year)} · {dataName(ev.name)} <small className="muted-text">{tierLabel(ev.tierId)}</small></h3>
      <EntryRules ev={ev} />
      <EntryTable week={weekOf(ev, year)} eventId={ev.id} />
      <p><button className="primary" onClick={() => submit(ev.id)}>{t('submitEntries')}</button></p>
    </>
  );
  const city = (id: string) => dataName(game.world.cities.find((c) => c.id === id)?.name);
  const submitted = (id: string) => state.entriesSubmitted?.[`${year}:${id}`];
  const teamIds = new Set(ruleset.team.events.map((e) => e.id));
  const all = [...ruleset.calendar, ...ruleset.team.events].filter((e) => isHeld(e, year) && (!state.managedCountryId || openTo(e, state.managedCountryId, game.world))) // hanya event yang terbuka untuk negara manajer
   .sort((a, b) => weekOf(a, year) - weekOf(b, year));
  const pastCount = all.filter((e) => weekOf(e, year) < week).length;
  const list = showPast ? all : all.filter((e) => weekOf(e, year) >= week);
  const nav = (
    <nav className="controls subnav">
      <button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>{t('calendarTab')}</button>
      <button aria-pressed={view === 'plan'} onClick={() => setView('plan')}>{t('seasonPlan')}</button>
    </nav>
  );
  if (view === 'plan') return <>{nav}<SeasonPlan /></>;
  return (
    <>{nav}
    <div className="scroll">
      {pastCount > 0 && <p><button onClick={() => setShowPast(!showPast)}>{showPast ? t('hidePast') : t('showPast', { n: pastCount })}</button></p>}
      <table className="callist">
        <thead><tr><th className="num">{t('week')}</th><th>{t('tournament')}</th><th>{t('tier')}</th><th className="hide-sm">{t('city')}</th><th>{t('entryStatus')}</th></tr></thead>
        <tbody>{list.map((e) => {
          const past = weekOf(e, year) < week;
          const team = teamIds.has(e.id);
          const tier = 'tierId' in e ? e.tierId : '';
          const auto = !team && (tier === 'WTF' || tier === 'OG' || ruleset.tiers.find((x) => x.id === tier)?.junior); // junior, Finals & Olimpiade: otomatis
          return (
            <tr key={e.id} className={past ? 'muted-text' : undefined}>
              <td className="num">{weekOf(e, year)}</td>
              <td><a href="#" onClick={(x) => { x.preventDefault(); if (past || auto) onOpenEvent?.(e.id, year); else setOpen(e.id); }}>{team ? eventName(ruleset, e.id, year) : dataName(e.name)}</a></td>
              <td><span className="chip">{team ? teamLabel(e) : ruleset.tiers.find((x) => x.id === tier)?.junior ? t('juniorShort') : tierLabel(tier)}</span></td>
              <td className="hide-sm">{city(hostCityId(e, year))}</td>
              <td>{past ? t('finished') : auto ? t('auto')
                : submitted(e.id) ? <span className="badge good">✓ {t('entrySubmitted')}</span> : <span className="badge">{t('entryIncomplete')}</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
    </>
  );
}

/**
 * Rencana musim: peserta negara manajer × minggu turnamen tersisa. Sel = keputusan manual (tegas), turnamen wajib (⭐)
 * atau "Otomatis" (samar); diubah lewat pilihan yang sama dengan entry mingguan (`manualEntries`).
 */
const PLAN_WEEKS = 8;

function SeasonPlan() {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const { year, week } = state.date;
  const { players } = lookup(state);
  const ranks = useMemo(() => new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, absWeek(state.date), ruleset))])), [version, state, ruleset]);
  const allWeeks = [...new Set(ruleset.calendar.map((e) => weekOf(e, year)))].filter((w) => w >= week && plannableEvents(ruleset, year, w, state.managedCountryId).length).sort((a, b) => a - b);
  // Per halaman 8 minggu: tabel penuh (±48 baris × 40+ minggu) membuat scroll patah-patah di HP.
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(allWeeks.length / PLAN_WEEKS)), pg = Math.min(page, pages - 1);
  const weeks = allWeeks.slice(pg * PLAN_WEEKS, (pg + 1) * PLAN_WEEKS);
  const plan = useMemo(() => new Map(weeks.map((w) => [w, planWeek(state, ruleset, w)])), [version, pg, week]);
  const released = releasedIds(state);
  const rows = DISCIPLINES.flatMap((d) => entrantsFor(state, d).filter((e) => isManaged(state, released, e))
    .map((e) => ({ ...e, d, rank: ranks.get(d)!.get(e.id) }))
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)));
  const set = (w: number, id: string, value: string) => {
    const key = weekKey({ year, week: w });
    const next = { ...state.manualEntries[key] };
    if (value === 'auto') delete next[id]; else next[id] = value;
    state.manualEntries[key] = next;
    changed();
    void saveGame(game);
  };
  const short = (id: string) => { const ev = ruleset.calendar.find((e) => e.id === id)!; return `${tierLabel(ev.tierId)} ${dataName(ev.name).split(' ')[0]}`; };
  const label = (c: PlanCell) => c.eventId === 'rest' ? t('rest') : c.eventId ? short(c.eventId) : '—';

  if (!weeks.length) return <p>{t('noEvents')}</p>;
  return (
    <>
      <p className="hint">{t('seasonPlanHint')}</p>
      {pages > 1 && <div className="controls" style={{ alignItems: 'center' }}>
        <button className="mini" style={{ fontSize: '1.2rem' }} disabled={pg === 0} onClick={() => setPage(pg - 1)}>‹</button>
        <span>{t('weekShort')}{weeks[0]}–{t('weekShort')}{weeks[weeks.length - 1]} ({pg + 1}/{pages})</span>
        <button className="mini" style={{ fontSize: '1.2rem' }} disabled={pg === pages - 1} onClick={() => setPage(pg + 1)}>›</button>
      </div>}
      <div className="scroll">
        <table className="plan">
          <thead><tr><th>{t('name')}</th>{weeks.map((w) => (
            <th key={w} title={plannableEvents(ruleset, year, w, state.managedCountryId).map((e) => `${dataName(e.name)} (${tierLabel(e.tierId)})`).join(' · ')}>
              {t('weekShort')}{w} · {tierLabel(plannableEvents(ruleset, year, w, state.managedCountryId)[0].tierId)}
            </th>
          ))}</tr></thead>
          <tbody>{rows.map((e) => (
            <tr key={e.id}>
              <td><span className="chip">{e.d}</span> {entrantLabel(state, e.id).name}</td>
              {weeks.map((w) => {
                const injured = e.playerIds.some((id) => (players.get(id)?.injury?.weeksLeft ?? 0) > w - week);
                if (injured) return <td key={w} title={t('injury')}>🩹</td>;
                const c = plan.get(w)!.get(e.id) ?? { eventId: null, kind: 'auto' as const };
                const offered = plannableEvents(ruleset, year, w, state.managedCountryId).filter((ev) => ruleset.tiers.find((x) => x.id === ev.tierId)!.drawSize[e.d] > 0);
                const shown = c.kind === 'manual' ? label(c) : c.kind === 'required' ? `⭐ ${label(c)}` : t('tierPrefsFree');
                // Sel menampilkan pilihan manual / turnamen wajib / "Otomatis"; select transparan di atasnya untuk mengubah.
                return (
                  <td key={w}>
                    <label className={`plan-cell ${c.kind}${c.conflict ? ' conflict' : ''}`} title={c.conflict ? t('planConflict') : undefined}>
                      {shown}
                      <select value={c.kind === 'manual' ? c.eventId! : 'auto'} onChange={(ev) => set(w, e.id, ev.target.value)}>
                        <option value="auto">{t('tierPrefsFree')}</option>
                        {offered.map((ev) => <option key={ev.id} value={ev.id}>{short(ev.id)}</option>)}
                        <option value="rest">{t('rest')}</option>
                      </select>
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

/** Tabel entry satu minggu; `eventId`: hanya atlet/pasangan di nomor yang dipertandingkan turnamen itu. */
export function EntryTable({ week: w, eventId }: { week: number; eventId?: string }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const { year } = state.date;
  const events = ruleset.calendar.filter((e) => weekOf(e, year) === w && isHeld(e, year) && e.tierId !== 'WTF' && e.tierId !== 'OG' && !ruleset.tiers.find((x) => x.id === e.tierId)?.junior); // junior & Olimpiade: otomatis
  const key = weekKey({ year, week: w });
  const decisions = state.manualEntries[key] ?? {};
  const { players } = lookup(state);

  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    return new Map(DISCIPLINES.map((d) => [d, rankMap(computeRanking(state.results, d, now, ruleset))]));
  }, [version, state, ruleset]);

  const set = (id: string, value: string) => {
    const next = { ...decisions };
    if (value === 'auto') delete next[id]; else next[id] = value;
    state.manualEntries[key] = next;
    changed();
    void saveGame(game);
  };

  const drawOf = (id: string) => ruleset.tiers.find((tt) => tt.id === events.find((e) => e.id === id)?.tierId)?.drawSize;
  const rows = DISCIPLINES.filter((d) => !eventId || (drawOf(eventId)?.[d] ?? 0) > 0).flatMap((d) =>
    entrantsFor(state, d).filter((e) => e.countryId === country && !e.playerIds.some((id) => players.get(id)?.released !== undefined))
      .map((e) => ({ ...e, d, rank: ranks.get(d)!.get(e.id) }))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)));

  // Multi-event: hanya anggota kontingen (setelah dikunci) yang bisa didaftarkan.
  const offeredFor = (e: (typeof rows)[number]) => events.filter((ev) => ruleset.tiers.find((tt) => tt.id === ev.tierId)!.drawSize[e.d] > 0
    && inContingent(state, ev.id, country, e.playerIds));
  // Semua baris sekaligus: Main = turnamen ini (atau turnamen pertama yang membuka nomornya; pasangan trial tidak diubah
  // agar pasangan utama tidak tergeser), Istirahat, atau kembali Otomatis.
  const setAll = (pick: (e: (typeof rows)[number]) => string | undefined) => {
    const next = { ...decisions };
    for (const e of rows) {
      if (e.playerIds.some((id) => players.get(id)?.injury)) continue;
      const v = pick(e);
      if (!v || v === 'auto') delete next[e.id]; else next[e.id] = v;
    }
    state.manualEntries[key] = next;
    changed();
    void saveGame(game);
  };

  return (
    <>
      <p>{t('entryHelp')}</p>
      {events.length === 0 ? <p>{t('noEvents')}</p> : (
        <>
          {!eventId && <p>{events.map((e) => `${dataName(e.name)} (${tierLabel(e.tierId)})`).join(' · ')}</p>}
          <p className="controls">
            <button onClick={() => setAll((e) => e.trial ? decisions[e.id] : (eventId && offeredFor(e).some((ev) => ev.id === eventId) ? eventId : offeredFor(e)[0]?.id))}>{t('playAll')}</button>
            <button onClick={() => setAll(() => 'rest')}>{t('restAll')}</button>
            <button onClick={() => setAll(() => 'auto')}>{t('autoAll')}</button>
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>{t('name')}</th><th className="num">{t('rank')}</th><th className="hide-sm">{t('fatigue')}</th><th>{t('tournament')}</th></tr></thead>
              <tbody>{rows.map((e) => {
                const required = events.find((ev) => state.commitments[e.id]?.includes(ev.id));
                const injured = e.playerIds.some((id) => players.get(id)?.injury);
                const tired = Math.max(...e.playerIds.map((id) => players.get(id)?.fatigue ?? 0));
                const offered = offeredFor(e);
                return (
                  <tr key={e.id}>
                    {/* Nomor sebagai label di depan nama: kolom nama yang menempel saat tabel digeser di HP. */}
                    <td><span className="chip">{e.d}</span> {entrantLabel(state, e.id).name}{required ? ` ⭐ ${t('required')}` : ''}{e.trial && <> <span className="tag">{t('trialPair')}</span></>}{e.playerIds.some((id) => { const x = players.get(id); return x && isPratama(x, state.date); }) && <> <span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span></>}</td>
                    <td className="num">{e.rank ?? '—'}</td>
                    <td className="hide-sm"><FatigueBar value={tired} /></td>
                    <td>{injured ? `🩹 ${t('injury')}` : (
                      <select value={decisions[e.id] ?? 'auto'} onChange={(ev) => set(e.id, ev.target.value)}>
                        <option value="auto">{e.trial ? t('notEntered') : t('auto')}</option>
                        {offered.map((ev) => <option key={ev.id} value={ev.id}>{dataName(ev.name)}</option>)}
                        <option value="rest">{t('rest')}</option>
                      </select>
                    )}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Aturan skuad beregu: urutan partai & kebutuhan minimal per sektor. Tunggal: atlet berbeda per partai;
 * ganda: pasangan berbeda; tiap atlet maks `max` partai di nomor berbeda → minimal atlet per gender.
 */
function TeamRules({ format }: { format: TeamFormat }) {
  const { ruleset } = useGame().game;
  const order = ruleset.team.order[format], max = ruleset.team.maxMatchesPerPlayer;
  const slots = (d: Discipline) => order.filter((x) => x === d).length;
  const need = [...new Set(order)].map((d) => `${d} ${slots(d)} ${t(isDoubles(d) ? 'pairsDistinct' : 'playersDistinct')}`);
  const minOf = (g: 'M' | 'F') => {
    const per = [...new Set(order)].map((d) => slots(d) * (d === 'XD' ? 1 : isDoubles(d) ? 2 : 1) * Number(GENDER_OF[d].includes(g)));
    return Math.max(...per, Math.ceil(per.reduce((a, b) => a + b, 0) / max));
  };
  const men = minOf('M'), women = minOf('F');
  return (
    <p className="hint">{t('teamRules', { order: order.join(' · '), need: need.join(', '), max })}
      {' '}{[men && `${men} ${t('men').toLowerCase()}`, women && `${women} ${t('women').toLowerCase()}`].filter(Boolean).join(' + ')} {t('minimumBring')}</p>
  );
}
const GENDER_OF: Record<Discipline, string> = { MS: 'M', WS: 'F', MD: 'M', WD: 'F', XD: 'MF' };

/** Aturan entry turnamen individu: kuota per negara & (multi-event) kontingen. */
function EntryRules({ ev }: { ev: TournamentDef }) {
  const { game } = useGame();
  const { ruleset, state } = game;
  const q = ruleset.tiers.find((x) => x.id === ev.tierId)?.countryQuota;
  if (!q && !ev.contingent) return null;
  const { year } = state.date;
  return (
    <p className="hint">
      {q && (q.max > q.base ? t('quotaRuleTop', { n: q.base, max: q.max, top: q.topRank }) : t('quotaRule', { n: q.base }))}
      {ev.contingent && <> {t('contingentRule', { m: ev.contingent.M, f: ev.contingent.F, w: lockWeek(ruleset, ev, year) })}</>}
    </p>
  );
}

/** Skuad beregu per format turnamen (line-up dipilih di pop-up sebelum tiap pertandingan). */
function TeamSquads({ eventId, formats, onSubmit }: { eventId: string; formats: TeamFormat[]; onSubmit: () => void }) {
  const { game } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const max = ruleset.team.maxMatchesPerPlayer;
  const contingent = contingentOf(state, eventId, country); // multi-event: hanya atlet kontingen
  const games = ruleset.calendar.find((e) => e.contingent && `${e.id}-team` === eventId);
  const pools = formats.map((f) => {
    const all = teamStrengths(state, ruleset, f);
    const rank = all.findIndex((x) => x.countryId === country);
    const pool = all[rank]?.pool;
    return { f, rank, total: all.length, pool: pool && contingent ? squadPool(pool, contingent) : pool };
  });
  const [squads, setSquads] = useState(() => Object.fromEntries(pools.map(({ f, pool }) =>
    [f, state.teamSquads[f] ?? (pool ? autoSquad(ruleset.team.order[f], pool, max, ruleset.team.squadSize[f].max) : [])])) as Record<TeamFormat, string[]>);
  const errs = pools.map(({ f, pool }) => pool && squadError(squads[f], ruleset.team.order[f], pool, max, ruleset.team.squadSize[f]));
  return (
    <>
      <p className="hint">{t('squadHint')}</p>
      {games && <p className="hint">{t('contingentRule', { m: games.contingent!.M, f: games.contingent!.F, w: lockWeek(ruleset, games, state.date.year) })}</p>}
      {pools.map(({ f, rank, total, pool }, i) => (
        <section key={f} className="card">
          <h4>{formatName(f)}</h4>
          {!pool ? <p>{t('teamNotEligible')}</p> : <>
            <p>{t('teamStrengthRank')}: <b>#{rank + 1}</b> / {total}</p>
            <TeamRules format={f} />
            <SquadPicker pool={pool} value={squads[f]} size={ruleset.team.squadSize[f]} onChange={(v) => setSquads({ ...squads, [f]: v })} />
            {errs[i] && <small className="down">{errs[i]}</small>}
          </>}
        </section>
      ))}
      <p><button className="primary" disabled={errs.some(Boolean)} onClick={() => {
        for (const { f, pool } of pools) if (pool) state.teamSquads[f] = squads[f];
        onSubmit();
      }}>{t('submitEntries')}</button></p>
    </>
  );
}
