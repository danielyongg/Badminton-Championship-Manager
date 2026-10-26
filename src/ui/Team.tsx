import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { hostCityId, isHeld, weekOf, lineupStrength, teamFormatsIn, teamStrengths, type TeamResult, type TeamStrength, type TeamTie } from '../engine/season';
import { ageAt, currentAbility, isPratama } from '../engine/generator';
import { AD_HOC, adHocEntrants, adHocId, autoLineup, autoSquad, lineupError, rankOrder, squadError, squadPool, type Lineup, type TeamEntrant } from '../engine/team';
import { isDoubles, isJuniorFormat, type Discipline, type TeamFormat } from '../engine/types';
import { mainRoundName } from '../engine/knockout';
import { dataName, t, type TextKey } from '../i18n';
import { entrantLabel, eventName, lookup, saveGame, useGame } from './game';
import { LiveDraw } from './LiveDraw';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';
import { FitStatus, MoraleTag } from './Squad';
import { EntryRow } from './Entries';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';

// Beregu: jadwal, line-up negara sendiri, dan hasil Thomas/Uber/Sudirman Cup + kejuaraan kontinental.

/** Nama format; di kejuaraan selain Thomas & Uber / Sudirman / Suhandinata Cup: beregu putra / putri / campuran. */
const OWN_EVENT: Record<TeamFormat, string> = { thomas: 'thomas-uber-cup', uber: 'thomas-uber-cup', sudirman: 'sudirman-cup', suhandinata: 'suhandinata-cup' };
export const formatName = (f: TeamFormat, eventId?: string) => t((eventId && eventId !== OWN_EVENT[f] ? `teamGeneric_${f}` : `team_${f}`) as TextKey);
export const levelName = (n: number) => t(`teamLevel_${n}` as TextKey);
export const winnerOf = (r: TeamResult) => Object.keys(r.reached).find((c) => r.reached[c] === 'W');

export function Team() {
  const { game, version } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId ?? null;
  const { year, week } = state.date;
  // Format senior tahun ini + Suhandinata Cup (junior) bila digelar.
  const formats = [...teamFormatsIn(ruleset, year), ...ruleset.team.events.filter((e) => isHeld(e, year)).flatMap((e) => e.formats ?? []).filter(isJuniorFormat)];
  const city = (id: string) => dataName(world.cities.find((c) => c.id === id)?.name);
  const strengths = useMemo(
    () => Object.fromEntries(formats.map((f) => [f, teamStrengths(state, ruleset, f)])) as Record<TeamFormat, TeamStrength[]>,
    [version, state, ruleset, year],
  );
  // Hasil terbaru: tahun ini, atau tahun lalu bila beregu tahun ini belum dimainkan.
  const resultYear = state.teamResults.some((r) => r.year === year) ? year : year - 1;
  const results = state.teamResults.filter((r) => r.year === resultYear);

  return (
    <>
      <section className="card">
        <h3>{t('teamSchedule')} {year}</h3>
        <ul>{ruleset.team.events.filter((e) => isHeld(e, year)).sort((a, b) => weekOf(a, year) - weekOf(b, year)).map((e) => (
          <li key={e.id}>{t('week')} {weekOf(e, year)}: <b>{eventName(ruleset, e.id, year)}</b> ({(e.formats ?? teamFormatsIn(ruleset, year)).map((f) => formatName(f, e.id)).join(', ')}, {city(hostCityId(e, year))}){weekOf(e, year) < week ? ' ✓' : ''}</li>
        ))}</ul>
        <p className="hint">{t('teamHelp')}</p>
      </section>
      {managed && formats.map((f) => <DefaultTeamEditor key={`${f}-${version}`} format={f} strengths={strengths[f]} country={managed} />)}
      {results.length > 0 && <h3>{t('teamResults')} {resultYear}</h3>}
      {results.filter((r) => !r.confederation).map((r) => <FinalsResult key={r.eventId + r.format} r={r} />)}
      {results.some((r) => r.confederation) && (
        <section className="card">
          <h3>{t('continentalChampions')}</h3>
          <table>
            <tbody>{results.filter((r) => r.confederation).map((r) => (
              <tr key={r.eventId + r.format}>
                <td>{eventName(ruleset, r.eventId, r.year)}</td><td>{formatName(r.format, r.eventId)}</td>
                <td><b><Flag id={winnerOf(r)} />{winnerOf(r)}</b></td><td>{r.teams.length} {t('teams')}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

/**
 * Pilih skuad beregu, sama seperti form entry individu: tab per nomor, baris atlet/pasangan (kondisi, morale, kemampuan,
 * ranking) dengan centang. Centang pasangan = kedua atletnya masuk skuad; hapus centang = keduanya keluar.
 */
export function SquadPicker({ pool, value, onChange, size, suggestion, junior }: {
  pool: Record<string, TeamEntrant[]>; value: string[]; onChange: (v: string[]) => void; size: { min: number; max: number };
  /** Saran skuad AI untuk tombol Saran (tanpa = tombol tidak tampil). */
  suggestion?: string[];
  /** Format junior: ranking junior. */
  junior?: boolean;
}) {
  const { game, version } = useGame();
  const { state, ruleset } = game;
  const sectors = (SECTOR_ORDER as Discipline[]).filter((d) => pool[d]?.length);
  const [picked, setSector] = useState<Discipline>();
  const sector = picked && sectors.includes(picked) ? picked : sectors[0];
  const ranks = useMemo(() => new Map(sectors.map((d) => [d, rankMap(computeRanking(junior ? state.juniorResults ?? [] : state.results, d, absWeek(state.date), ruleset))])), [version, junior]);
  const { pairs } = lookup(state);
  const rows = (d: Discipline) => pool[d].map((e) => ({ ...e, d, rank: ranks.get(d)?.get(e.id), trial: pairs.get(e.id)?.trial }));
  const on = (e: TeamEntrant) => e.playerIds.every((id) => value.includes(id));
  const toggle = (e: TeamEntrant, yes: boolean) => onChange(yes ? [...new Set([...value, ...e.playerIds])] : value.filter((id) => !e.playerIds.includes(id)));
  return (
    <div>
      <p className="squad-count">{t('squadCount')}: <b className={value.length < size.min || value.length > size.max ? 'down' : undefined}>{value.length}</b> <span className="muted-text">({size.min}–{size.max})</span></p>
      <p className="controls entry-actions">
        {suggestion && <button title={t('suggestionHint')} onClick={() => onChange(suggestion)}>💡 {t('suggestion')}</button>}
        <button disabled={!value.length} onClick={() => onChange([])}>{t('clearAll')}</button>
      </p>
      <nav className="controls subnav">
        {sectors.map((d) => (
          <button key={d} aria-pressed={d === sector} onClick={() => setSector(d)}>
            {d} <span className="muted-text">{pool[d].filter(on).length}/{pool[d].length}</span>
          </button>
        ))}
      </nav>
      {sector && <div className="scroll">
        <table className="entrytable fit">
          <thead><tr><th>{t('name')}</th><th className="num">{t('ability')}</th><th className="num">{t('rank')}</th><th className="num">{t('enterCol')}</th></tr></thead>
          <tbody>{rows(sector).map((e) => <EntryRow key={e.id} e={e} checked={on(e)} disabled={false} onToggle={(yes) => toggle(e, yes)} />)}</tbody>
        </table>
      </div>}
    </div>
  );
}

const SECTOR_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD'];
/** Nomor atlet di pool: tunggal & pasangan terdaftar; ganda dadakan (pasangan otomatis junior) hanya bila tidak ada yang lain. */
const playsIn = (pool: Record<string, TeamEntrant[]>, id: string) => {
  const has = (adHoc: boolean) => SECTOR_ORDER.filter((d) => pool[d]?.some((e) => e.id.startsWith(AD_HOC) === adHoc && e.playerIds.includes(id)));
  const real = has(false);
  return real.length ? real : has(true);
};

/**
 * Satu baris pilih atlet (skuad beregu & kontingen multi-event): nama; data atlet, kondisi, morale, status Development
 * & nomor tanpa pasangan terdaftar; tiap nomor ganda berpasangan di baris sendiri. `rank` = peringkat terbaik (opsional).
 */
export function PickRow({ id, pool, on, onToggle, rank, disabled }: {
  id: string; pool: Record<string, TeamEntrant[]>; on: boolean; onToggle: () => void; rank?: number; disabled?: boolean;
}) {
  const { game } = useGame();
  const { players } = lookup(game.state);
  const p = players.get(id)!;
  // Pasangan terdaftar atlet di satu nomor ganda (ganda dadakan tidak ditampilkan).
  const mates = (d: string) => isDoubles(d as Discipline) && (pool[d] ?? []).filter((e) => !e.id.startsWith(AD_HOC) && e.playerIds.includes(id))
    .map((e) => players.get(e.playerIds.find((x) => x !== id)!)?.name).filter(Boolean).join(' / ');
  const plays = playsIn(pool, id);
  return (
    <label className={`pickrow${on ? ' sel' : ''}`}>
      {!disabled && <input type="checkbox" checked={on} onChange={onToggle} />}
      <span className="grow">
        <b>{p.name}</b>
        <small className="pick-plays"><span className="muted-text">{p.gender} · {ageAt(p.birth, game.state.date)} {t('yearsShort')}{rank !== undefined && ` · #${rank}`}</span>
          <FitStatus ps={[p]} /><MoraleTag short value={p.form} />
          {isPratama(p, game.state.date) && <span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span>}
          {plays.filter((d) => !mates(d)).map((d) => <span key={d} className="chip">{d}</span>)}</small>
        {plays.filter(mates).map((d) => (
          <small key={d} className="pick-mate"><span className="chip">{d}</span><span className="muted-text">{mates(d)}</span></small>
        ))}
      </span>
      <span className="val" title={t('ability')}>{currentAbility(p.attrs)}</span>
    </label>
  );
}

/** Validasi line-up di UI (sama seperti engine): pasangan terdaftar di skuad + ganda dadakan dari atlet skuad. */
function lineupProblem(l: Lineup, order: Discipline[], pool: Record<string, TeamEntrant[]>, squad: string[], max: number, gender: (id: string) => string | undefined) {
  const byId = new Map([...Object.values(pool).flat(), ...adHocEntrants(l, order, new Set(squad), gender)].map((e) => [e.id, e]));
  return lineupError(l, order, byId, max);
}

const SLOT_GENDERS: Record<string, ['M' | 'F', 'M' | 'F']> = { MD: ['M', 'M'], WD: ['F', 'F'], XD: ['M', 'F'] };

/**
 * Pilih peserta tiap partai. Tunggal: atlet. Ganda: dua atlet skuad — pasangan terdaftar bila ada,
 * selain itu ganda dadakan (pasangan khusus beregu). Tiap perubahan langsung diurutkan menurut ranking (aturan BWF).
 */
export function LineupPicker({ format, order, pool, squad, value, onChange }: {
  format: TeamFormat; order: Discipline[]; pool: Record<string, TeamEntrant[]>; squad: string[]; value: Lineup; onChange: (v: Lineup) => void;
}) {
  const { game, version } = useGame();
  const { players } = lookup(game.state);
  const strength = useMemo(() => lineupStrength(game.state, game.ruleset, format), [game, format, version]);
  const set = (i: number, id: string | null) => { const next = [...value]; next[i] = id; onChange(rankOrder(next, order, strength)); };
  const membersOf = (d: Discipline, id: string | null): string[] =>
    !id ? [] : id.startsWith(AD_HOC) ? id.slice(AD_HOC.length).split('+') : (pool[d] ?? []).find((e) => e.id === id)?.playerIds ?? [];
  const pick = (d: Discipline, i: number, k: 0 | 1) => {
    const cur = membersOf(d, value[i]);
    const choose = (pid: string) => {
      const ids = [...cur]; ids[k] = pid;
      const [a, b] = ids;
      if (!a || !b) return set(i, null);
      const registered = (pool[d] ?? []).find((e) => e.playerIds.includes(a) && e.playerIds.includes(b));
      set(i, registered ? registered.id : adHocId(a, b));
    };
    const gender = SLOT_GENDERS[d][k];
    return (
      <select value={cur[k] ?? ''} onChange={(e) => choose(e.target.value)}>
        <option value="">—</option>
        {squad.filter((id) => players.get(id)?.gender === gender).map((id) => <option key={id} value={id}>{players.get(id)!.name}</option>)}
      </select>
    );
  };
  return (
    <table className="lineup" style={{ maxWidth: 680 }}>
      <tbody>{order.map((d, i) => (
        <tr key={i}>
          <td>{t('matchNo')} {i + 1}</td><td>{d}</td>
          <td>
            {isDoubles(d) ? (
              <>{pick(d, i, 0)}<span className="pair-sep"> / </span>{pick(d, i, 1)}{value[i]?.startsWith(AD_HOC) && <> <span className="tag">{t('adHocPair')}</span></>}</>
            ) : (
              <select value={value[i] ?? ''} onChange={(e) => set(i, e.target.value || null)}>
                <option value="">—</option>
                {(pool[d] ?? []).map((e) => <option key={e.id} value={e.id}>{entrantLabel(game.state, e.id).name}</option>)}
              </select>
            )}
          </td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Skuad & line-up default: dipakai bila manajer memilih "otomatis" saat turnamen, dan sebagai saran di pop-up. */
function DefaultTeamEditor({ format, strengths, country }: { format: TeamFormat; strengths: TeamStrength[]; country: string }) {
  const { game, changed } = useGame();
  const { state, ruleset } = game;
  const order = ruleset.team.order[format];
  const max = ruleset.team.maxMatchesPerPlayer;
  const size = ruleset.team.squadSize[format];
  const rank = strengths.findIndex((x) => x.countryId === country);
  const mine = strengths[rank];
  const [squad, setSquad] = useState<string[]>(() => state.teamSquads[format] ?? (mine ? autoSquad(order, mine.pool, max, size.max) : []));
  const sp = mine ? squadPool(mine.pool, squad) : {};
  const [lineup, setLineup] = useState<Lineup>(() => state.teamLineups[format] ?? autoLineup(order, sp, max));
  const [msg, setMsg] = useState('');
  const goal = state.career?.goals.find((g) => g.kind === 'team' && g.format === format);

  if (!mine) return <section className="card"><h3>{formatName(format)}</h3><p>{t('teamNotEligible')}</p></section>;
  const squadErr = squadError(squad, order, mine.pool, max, size);
  const gender = (id: string) => lookup(state).players.get(id)?.gender;
  const lineupErr = squadErr ? null : lineupProblem(lineup, order, sp, squad, max, gender);
  const commit = (save: boolean) => {
    if (save) { state.teamSquads[format] = squad; state.teamLineups[format] = lineup; }
    else {
      delete state.teamSquads[format];
      delete state.teamLineups[format];
      const auto = autoSquad(order, mine.pool, max, size.max);
      setSquad(auto);
      setLineup(autoLineup(order, squadPool(mine.pool, auto), max));
    }
    setMsg(save ? t('lineupSaved') : t('lineupReset'));
    changed();
    void saveGame(game);
  };

  return (
    <section className="card">
      <h3>{formatName(format)}: {t('defaultSquad')}</h3>
      <p>{t('teamStrengthRank')}: <b>#{rank + 1}</b> / {strengths.length}
        {goal && <> · {t('target')}: <b>{levelName(goal.target)}</b></>}</p>
      <div className="split">
        <SquadPicker pool={mine.pool} value={squad} size={size} junior={isJuniorFormat(format)} onChange={(v) => { setSquad(v); setMsg(''); }} />
        <div>
          <h4>{t('defaultLineup')}</h4>
          <LineupPicker format={format} order={order} pool={sp} squad={squad} value={lineup} onChange={(v) => { setLineup(v); setMsg(''); }} />
        </div>
      </div>
      <div className="controls" style={{ marginTop: 8 }}>
        <button className="primary" disabled={!!(squadErr || lineupErr)} onClick={() => commit(true)}>{t('saveLineup')}</button>
        <button onClick={() => commit(false)}>{t('useAutoLineup')}</button>
        <small className={squadErr || lineupErr ? 'down' : 'up'}>{squadErr ?? lineupErr ?? msg}</small>
      </div>
    </section>
  );
}

/** Pop-up yang menunggu keputusan manajer: ✕ menyembunyikannya ke bilah bawah (turnamen menunggu) agar tab lain bisa dibuka. */
function WaitingModal({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return (
    <div className="livebar card">🏸 <b>{title}</b><button className="primary" onClick={() => setHidden(false)}>{t('reopen')}</button></div>
  );
  return (
    <div className="modal" role="dialog" aria-label={label}>
      <div className="live card">
        <button className="close" aria-label={t('close')} title={t('hideWaiting')} onClick={() => setHidden(true)}>✕</button>
        {children}
      </div>
    </div>
  );
}

/** Pop-up sebelum turnamen beregu: daftarkan skuad. */
export function SquadModal({ title, eventId, format, pool, suggested, onDone }: {
  eventId?: string;
  title: string; format: TeamFormat; pool: Record<string, TeamEntrant[]>; suggested: string[]; onDone: (squad: string[]) => void;
}) {
  const { game } = useGame();
  const rs = game.ruleset;
  const [squad, setSquad] = useState<string[]>([]);
  const err = squadError(squad, rs.team.order[format], pool, rs.team.maxMatchesPerPlayer, rs.team.squadSize[format]);
  return (
    <WaitingModal label={t('registerSquad')} title={`${title} · ${formatName(format, eventId)}: ${t('registerSquad')}`}>
        <h3>{title} · {formatName(format, eventId)}: {t('registerSquad')}</h3>
        <p className="hint">{t('squadHint')}</p>
        <SquadPicker pool={pool} value={squad} onChange={setSquad} size={rs.team.squadSize[format]} junior={isJuniorFormat(format)} suggestion={suggested} />
        <div className="controls roundbar">
          <button className="primary" disabled={!!err} onClick={() => onDone(squad)}>{t('registerSquad')}</button>
        </div>
        {err && <p className="form-err">{err}</p>}
    </WaitingModal>
  );
}

/** Pop-up sebelum tiap pertandingan beregu: pilih line-up dari skuad. */
export function TieLineupModal({ title, eventId, format, round, opponent, pool, squad, suggested, onDone, onAuto }: {
  title: string; eventId?: string; format: TeamFormat; round: string; opponent: string; pool: Record<string, TeamEntrant[]>; squad: string[]; suggested: Lineup;
  onDone: (l: Lineup) => void; onAuto: () => void;
}) {
  const { game } = useGame();
  const rs = game.ruleset;
  const order = rs.team.order[format];
  const [lineup, setLineup] = useState(suggested);
  const err = lineupProblem(lineup, order, pool, squad, rs.team.maxMatchesPerPlayer, (id) => lookup(game.state).players.get(id)?.gender);
  const name = dataName(game.world.countries.find((c) => c.id === opponent)?.name) ?? opponent;
  const heading = `${title} · ${formatName(format, eventId)} ${round === 'G' ? t('group') : round} — vs ${name}`;
  return (
    <WaitingModal label={t('lineup')} title={heading}>
        <h3>{heading}</h3>
        <p className="hint">{t('tieLineupHint')}</p>
        <LineupPicker format={format} order={order} pool={pool} squad={squad} value={lineup} onChange={setLineup} />
        <div className="controls roundbar">
          <button className="primary" disabled={!!err} onClick={() => onDone(lineup)}>{t('confirmLineup')}</button>
          <button onClick={() => setLineup(suggested)}>{t('resetSuggestion')}</button>
          <button onClick={() => { onAuto(); onDone(suggested); }}>{t('autoRestOfWeek', { format: formatName(format, eventId) })}</button>
          <small className="down">{err}</small>
        </div>
    </WaitingModal>
  );
}

/** Klasemen grup; selama fase grup berjalan dihitung dari pertandingan yang sudah selesai (menang, selisih partai). */
function standingsOf(r: TeamResult) {
  if (r.standings) return r.standings;
  return r.groups!.map((g) => g.map((id) => {
    const mine = r.ties.filter((x) => x.round === 'G' && x.sides.includes(id)).map((x) => (x.sides[0] === id ? x.score : [x.score[1], x.score[0]]));
    return { id, wins: mine.filter(([a, b]) => a > b).length, gameDiff: mine.reduce((n, [a, b]) => n + a - b, 0), pointDiff: 0 };
  }).sort((a, b) => b.wins - a.wins || b.gameDiff - a.gameDiff));
}

/** Hasil kejuaraan beregu di halaman turnamen: tab format (putra/putri/campuran) lalu tab Grup / Knockout. */
export function TeamResults({ results }: { results: TeamResult[] }) {
  const [f, setF] = useState(results[0]?.format);
  const r = results.find((x) => x.format === f) ?? results[0];
  const hasGroups = !!r?.groups;
  // Default: knockout begitu bagan gugur ada (fase grup selesai), selain itu grup.
  const [stage, setStage] = useState<'groups' | 'knockout'>();
  const shown = stage ?? (hasGroups && !r.bracket?.length && !r.ties.some((x) => x.round !== 'G') ? 'groups' : 'knockout');
  if (!r) return null;
  return (
    <>
      {results.length > 1 && (
        <nav className="controls">
          {results.map((x) => <button key={x.format} aria-pressed={x.format === r.format} onClick={() => setF(x.format)}>{formatName(x.format, x.eventId)}</button>)}
        </nav>
      )}
      {hasGroups && (
        <nav className="controls subnav">
          <button aria-pressed={shown === 'groups'} onClick={() => setStage('groups')}>{t('groupStage')}</button>
          <button aria-pressed={shown === 'knockout'} onClick={() => setStage('knockout')}>{t('knockout')}</button>
        </nav>
      )}
      <FinalsResult key={r.format} r={r} stage={hasGroups ? shown : 'knockout'} />
    </>
  );
}

export function FinalsResult({ r, stage }: { r: TeamResult; stage?: 'groups' | 'knockout' }) {
  const { game } = useGame();
  const champion = winnerOf(r);
  const name = (c: string) => dataName(game.world.countries.find((x) => x.id === c)?.name) ?? c;
  const managed = game.state.career?.countryId;
  const ko = r.ties.filter((x) => x.round !== 'G');
  const [replay, setReplay] = useState(false);
  const [open, setOpen] = useState<TeamTie>();
  // Kotak pertandingan beregu: klik → detail tiap partai.
  const tieBox = (x: TeamTie, i: number) => (
    <div key={i} role="button" tabIndex={0} title={t('matchDetail')} className={`match clickable${managed && x.sides.includes(managed) ? ' mine' : ''}`}
      onClick={() => setOpen(x)} onKeyDown={(e) => e.key === 'Enter' && setOpen(x)}>
      {x.sides.map((c, k) => <div key={c} className={x.score[k] > x.score[1 - k] ? 'win' : ''}><Flag id={c} />{name(c)} <small>{x.score[k]}</small></div>)}
    </div>
  );
  return (
    <section className="card">
      {open && <TieDetail r={r} tie={open} name={name} onClose={() => setOpen(undefined)} />}
      <h3>{formatName(r.format, r.eventId)} — {t('champion')}: {champion ? name(champion) : '—'}</h3>
      {r.drawSteps && stage !== 'knockout' && <button onClick={() => setReplay(true)}>{t('draw_replay')}</button>}
      {replay && r.drawSteps && (
        <LiveDraw replay title={`${eventName(game.ruleset, r.eventId, r.year)} · ${formatName(r.format, r.eventId)}`} show={{ steps: r.drawSteps, groups: r.groups?.length }}
          name={name} mine={(c) => c === managed} onClose={() => setReplay(false)} />
      )}
      {r.groups && stage !== 'knockout' && (
        <div className="groups">{standingsOf(r).map((s, gi) => (
          <section key={gi} className="card group">
          <table>
            <thead><tr><th>{t('group')} {String.fromCharCode(65 + gi)}</th><th className="num" title={t('tiesWon')}>W</th><th className="num" title={t('matchDiff')}>±M</th><th className="num" title={t('gameDiff')}>±G</th></tr></thead>
            <tbody>{s.map((row, place) => (
              <tr key={row.id} className={row.id === managed ? 'sel' : ''}>
                <td><span className="muted-text">{place + 1}.</span> <Flag id={row.id} />{name(row.id)}</td><td className="num">{row.wins}</td>
                <td className="num">{row.gameDiff > 0 ? '+' : ''}{row.gameDiff}</td><td className="num">{!r.standings ? '—' : `${row.pointDiff > 0 ? '+' : ''}${row.pointDiff}`}</td>
              </tr>
            ))}</tbody>
          </table>
          <ul className="groupgames">{r.ties.filter((x) => x.round === 'G' && r.groups![gi].includes(x.sides[0])).map((x, i) => {
            const w = x.score[0] >= x.score[1] ? 0 : 1;
            return (
              <li key={i} role="button" tabIndex={0} title={t('matchDetail')} className={`clickable${managed && x.sides.includes(managed) ? ' mine' : ''}`}
                onClick={() => setOpen(x)} onKeyDown={(e) => e.key === 'Enter' && setOpen(x)}>
                <span className="win"><Flag id={x.sides[w]} />{name(x.sides[w])}</span><span><Flag id={x.sides[1 - w]} />{name(x.sides[1 - w])}</span>
                <span className="score"><a>{x.score[w]}-{x.score[1 - w]}</a></span>
              </li>
            );
          })}</ul>
          </section>
        ))}</div>
      )}
      {stage !== 'groups' && <>
        {!stage && <h4>{t('knockout')}</h4>}
        {r.bracket?.length ? <KnockoutBracket r={r} name={name} tieBox={tieBox} />
        : ko.length ? (
          // Save lama tanpa bagan: susun dari pertandingan yang sudah dimainkan.
          <div className="bracket">{(ko.some((x) => x.round === 'R16') ? ['R16', 'QF', 'SF', 'F'] : ['QF', 'SF', 'F']).map((round) => (
            <div key={round} className="round">{ko.filter((x) => x.round === round).map(tieBox)}</div>
          ))}</div>
        ) : <p className="hint">{t('knockoutPending')}</p>}
      </>}
    </section>
  );
}

/**
 * Bagan gugur beregu dari posisi bagan: pasangan laga tampil begitu babaknya dimulai (sebelum dimainkan), skor setelah selesai.
 * Babak yang belum dimulai: kolom kosong "—".
 */
function KnockoutBracket({ r, name, tieBox }: { r: TeamResult; name: (c: string) => string; tieBox: (x: TeamTie, i: number) => ReactNode }) {
  const rounds = r.bracket!;
  const cols = rounds.at(-1)!.length > 1 ? [...rounds, []] : rounds;
  const slot = (c: string | null | undefined, r0: boolean) => c ? <div><Flag id={c} />{name(c)}</div> : <div className="muted">{r0 ? t('bye') : '—'}</div>;
  return (
    <div className="bracket">{cols.slice(0, -1).map((field, i) => (
      // Nama babak di atas kolom, di luar pembagian posisi laga: laga tiap babak tepat di tengah pasangan laga sebelumnya.
      <div key={i} className="round-col">
        <small className="muted-text">{mainRoundName(field.length, i)}</small>
        <div className="round">
          {Array.from({ length: Math.ceil(field.length / 2) }, (_, k) => {
            const a = field[2 * k], b = field[2 * k + 1];
            const tie = a && b && r.ties.find((x) => x.round !== 'G' && x.sides.includes(a) && x.sides.includes(b));
            return tie ? tieBox(tie, k) : <div key={k} className="match">{slot(a, i === 0)}{slot(b, i === 0)}</div>;
          })}
        </div>
      </div>
    ))}</div>
  );
}

/** Pop-up satu pertandingan beregu: tiap partai (nomor, atlet, skor → detail laga). */
function TieDetail({ r, tie, name, onClose }: { r: TeamResult; tie: TeamTie; name: (c: string) => string; onClose: () => void }) {
  const { game } = useGame();
  const { state } = game;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const who = (id: string) => entrantLabel(state, id).name;
  const country = (id: string) => entrantLabel(state, id).country;
  const order = new Set(game.ruleset.team.order[r.format]);
  // Save lama (tanpa matchIds): cari laga event/tahun/babak yang sama antara kedua negara, nomor sesuai format.
  const rubbers = tie.matchIds
    ? tie.matchIds.map((id) => state.matches.find((m) => m.id === id)!).filter(Boolean)
    : state.matches.filter((m) => m.tournamentId === r.eventId && m.year === r.year && m.round === tie.round && order.has(m.discipline)
      && [country(m.sides[0]), country(m.sides[1])].sort().join() === [...tie.sides].sort().join());
  const title = `${eventName(game.ruleset, r.eventId, r.year)} · ${formatName(r.format, r.eventId)}`;
  return (
    <div className="modal" role="dialog" aria-label={t('matchDetail')} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="live card" style={{ width: 'min(980px, 100%)' }}>
        <button className="close" aria-label={t('close')} title={t('close')} onClick={onClose}>✕</button>
        <h3>{title} · {tie.round === 'G' ? t('group') : tie.round}</h3>
        <p className="tiehead">
          <span className={tie.score[0] > tie.score[1] ? 'win' : ''}><Flag id={tie.sides[0]} />{name(tie.sides[0])}</span>
          <b>{tie.score[0]} – {tie.score[1]}</b>
          <span className={tie.score[1] > tie.score[0] ? 'win' : ''}><Flag id={tie.sides[1]} />{name(tie.sides[1])}</span>
        </p>
        {rubbers.length === 0 ? <p className="hint">{t('tieNoDetail')}</p> : (
          // Tiap partai: papan skor dua baris (tim kiri di atas, sama dengan judul), skor per game, klik → detail laga.
          <div className="rubbers">{rubbers.map((m, i) => {
            const top = country(m.sides[0]) === tie.sides[0] ? 0 : 1;
            return (
              <div key={m.id} className="rubber">
                <div className="rhead">
                  <span className="muted-text">{t('matchNo')} {i + 1}</span> <span className="chip">{m.discipline}</span>
                  {(m.walkover || m.retired) && <small className="muted-text"> {m.walkover ? 'w/o' : 'ret.'}</small>}
                  <MatchLink m={m} name={who} title={title}>{t('matchDetail')} ›</MatchLink>
                </div>
                {[top, 1 - top].map((k) => (
                  <div key={k} className={`rrow${m.winner === k ? ' strong' : ' muted-text'}`} style={{ gridTemplateColumns: `minmax(0, 1fr) repeat(${m.scores.length}, 2em)` }}>
                    <span className="rname"><Flag id={country(m.sides[k])} />{who(m.sides[k])}</span>
                    {m.scores.map((g, j) => <span key={j} className="num">{g[k]}</span>)}
                  </div>
                ))}
              </div>
            );
          })}</div>
        )}
      </div>
    </div>
  );
}
