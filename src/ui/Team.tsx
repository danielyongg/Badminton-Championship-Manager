import { useEffect, useMemo, useState } from 'react';
import { hostCityId, isHeld, weekOf, lineupStrength, teamFormatsIn, teamStrengths, type TeamResult, type TeamStrength, type TeamTie } from '../engine/season';
import { ageAt, currentAbility } from '../engine/generator';
import { AD_HOC, adHocEntrants, adHocId, autoLineup, autoSquad, lineupError, rankOrder, squadError, squadPool, type Lineup, type TeamEntrant } from '../engine/team';
import { isDoubles, isJuniorFormat, type Discipline, type TeamFormat } from '../engine/types';
import { dataName, t, type TextKey } from '../i18n';
import { entrantLabel, eventName, lookup, saveGame, useGame } from './game';
import { LiveDraw } from './LiveDraw';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';

// Beregu: jadwal, line-up negara sendiri, dan hasil Thomas/Uber/Sudirman Cup + kejuaraan kontinental.

export const formatName = (f: TeamFormat) => t(`team_${f}` as TextKey);
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
          <li key={e.id}>{t('week')} {weekOf(e, year)}: <b>{eventName(ruleset, e.id, year)}</b> ({(e.formats ?? teamFormatsIn(ruleset, year)).map(formatName).join(', ')}, {city(hostCityId(e, year))}){weekOf(e, year) < week ? ' ✓' : ''}</li>
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
                <td>{eventName(ruleset, r.eventId, r.year)}</td><td>{formatName(r.format)}</td>
                <td><b><Flag id={winnerOf(r)} />{winnerOf(r)}</b></td><td>{r.teams.length} {t('teams')}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

/** Daftar atlet unik dalam pool, urut seperti pool (terbaik menurut ranking dulu). */
function poolPlayers(pool: Record<string, TeamEntrant[]>) {
  return [...new Set(Object.values(pool).flat().flatMap((e) => e.playerIds))];
}

/** Pilih atlet skuad (kotak centang). Menampilkan nomor yang bisa dimainkan tiap atlet. */
export function SquadPicker({ pool, value, onChange, size }: {
  pool: Record<string, TeamEntrant[]>; value: string[]; onChange: (v: string[]) => void; size: { min: number; max: number };
}) {
  const { game } = useGame();
  const { players } = lookup(game.state);
  const plays = (id: string) => Object.entries(pool).filter(([, list]) => list.some((e) => e.playerIds.includes(id))).map(([d]) => d).join(', ');
  return (
    <div>
      <p>{t('squadCount')}: <b>{value.length}</b> ({size.min}–{size.max})</p>
      <div className="scroll squadlist">
        <table>
          <tbody>{poolPlayers(pool).map((id) => {
            const p = players.get(id)!;
            const on = value.includes(id);
            return (
              <tr key={id} className={on ? 'sel' : ''}>
                <td><label><input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== id) : [...value, id])} /> {p.name}</label></td><td>{p.gender}</td>
                <td className="num">{ageAt(p.birth, game.state.date)} {t('yearsShort')}</td><td className="num">{currentAbility(p.attrs)}</td><td>{plays(id)}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
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
              <>{pick(d, i, 0)} / {pick(d, i, 1)}{value[i]?.startsWith(AD_HOC) && <> <span className="tag">{t('adHocPair')}</span></>}</>
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
        <SquadPicker pool={mine.pool} value={squad} size={size} onChange={(v) => { setSquad(v); setMsg(''); }} />
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

/** Pop-up sebelum turnamen beregu: daftarkan skuad. */
export function SquadModal({ title, format, pool, suggested, onDone }: {
  title: string; format: TeamFormat; pool: Record<string, TeamEntrant[]>; suggested: string[]; onDone: (squad: string[]) => void;
}) {
  const { game } = useGame();
  const rs = game.ruleset;
  const [squad, setSquad] = useState(suggested);
  const err = squadError(squad, rs.team.order[format], pool, rs.team.maxMatchesPerPlayer, rs.team.squadSize[format]);
  return (
    <div className="modal" role="dialog" aria-label={t('registerSquad')}>
      <div className="live card">
        <h3>{title} · {formatName(format)}: {t('registerSquad')}</h3>
        <p className="hint">{t('squadHint')}</p>
        <SquadPicker pool={pool} value={squad} onChange={setSquad} size={rs.team.squadSize[format]} />
        <div className="controls roundbar">
          <button className="primary" disabled={!!err} onClick={() => onDone(squad)}>{t('registerSquad')}</button>
          <button onClick={() => setSquad(suggested)}>{t('resetSuggestion')}</button>
          <small className="down">{err}</small>
        </div>
      </div>
    </div>
  );
}

/** Pop-up sebelum tiap pertandingan beregu: pilih line-up dari skuad. */
export function TieLineupModal({ title, format, round, opponent, pool, squad, suggested, onDone, onAuto }: {
  title: string; format: TeamFormat; round: string; opponent: string; pool: Record<string, TeamEntrant[]>; squad: string[]; suggested: Lineup;
  onDone: (l: Lineup) => void; onAuto: () => void;
}) {
  const { game } = useGame();
  const rs = game.ruleset;
  const order = rs.team.order[format];
  const [lineup, setLineup] = useState(suggested);
  const err = lineupProblem(lineup, order, pool, squad, rs.team.maxMatchesPerPlayer, (id) => lookup(game.state).players.get(id)?.gender);
  const name = dataName(game.world.countries.find((c) => c.id === opponent)?.name) ?? opponent;
  return (
    <div className="modal" role="dialog" aria-label={t('lineup')}>
      <div className="live card">
        <h3>{title} · {formatName(format)} {round === 'G' ? t('group') : round} — vs {name}</h3>
        <p className="hint">{t('tieLineupHint')}</p>
        <LineupPicker format={format} order={order} pool={pool} squad={squad} value={lineup} onChange={setLineup} />
        <div className="controls roundbar">
          <button className="primary" disabled={!!err} onClick={() => onDone(lineup)}>{t('confirmLineup')}</button>
          <button onClick={() => setLineup(suggested)}>{t('resetSuggestion')}</button>
          <button onClick={() => { onAuto(); onDone(suggested); }}>{t('autoRestOfWeek')}</button>
          <small className="down">{err}</small>
        </div>
      </div>
    </div>
  );
}

export function FinalsResult({ r }: { r: TeamResult }) {
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
      <h3>{formatName(r.format)} — {t('champion')}: {champion ? name(champion) : '—'}</h3>
      {r.drawSteps && <button onClick={() => setReplay(true)}>{t('draw_replay')}</button>}
      {replay && r.drawSteps && (
        <LiveDraw replay title={`${eventName(game.ruleset, r.eventId, r.year)} · ${formatName(r.format)}`} show={{ steps: r.drawSteps, groups: r.groups?.length }}
          name={name} mine={(c) => c === managed} onClose={() => setReplay(false)} />
      )}
      {r.groups && (
        <div className="groups">{r.standings!.map((s, gi) => (
          <div key={gi}>
          <table>
            <thead><tr><th>{t('group')} {String.fromCharCode(65 + gi)}</th><th>{t('tiesWon')}</th><th>{t('matchDiff')}</th><th>{t('gameDiff')}</th></tr></thead>
            <tbody>{s.map((row, place) => (
              <tr key={row.id} className={row.id === managed ? 'sel' : ''}>
                <td>{place + 1}. <Flag id={row.id} />{name(row.id)}</td><td className="num">{row.wins}</td>
                <td className="num">{row.gameDiff > 0 ? '+' : ''}{row.gameDiff}</td><td className="num">{row.pointDiff > 0 ? '+' : ''}{row.pointDiff}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="tiegrid">{r.ties.filter((x) => x.round === 'G' && r.groups![gi].includes(x.sides[0])).map(tieBox)}</div>
          </div>
        ))}</div>
      )}
      <h4>{t('knockout')}</h4>
      <div className="bracket">{(ko.some((x) => x.round === 'R16') ? ['R16', 'QF', 'SF', 'F'] : ['QF', 'SF', 'F']).map((round) => (
        <div key={round} className="round">{ko.filter((x) => x.round === round).map(tieBox)}</div>
      ))}</div>
    </section>
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
  const title = `${eventName(game.ruleset, r.eventId, r.year)} · ${formatName(r.format)}`;
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
          <div className="scroll">
            <table className="rubbers">
              <tbody>{rubbers.map((m, i) => (
                <tr key={m.id}>
                  <td className="muted-text">{t('matchNo')} {i + 1}</td>
                  <td><span className="chip">{m.discipline}</span></td>
                  <td className={m.winner === 0 ? 'strong' : 'muted-text'}>{who(m.sides[0])}</td>
                  <td className="num"><MatchLink m={m} name={who} title={title}>{m.scores.map((g) => g.join('-')).join(', ')}</MatchLink></td>
                  <td className={m.winner === 1 ? 'strong' : 'muted-text'}>{who(m.sides[1])}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
