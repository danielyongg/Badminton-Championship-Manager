import { hostCityId, liveTeamResults, weekOf } from '../engine/season';
import { useState, type ReactNode } from 'react';
import { DISCIPLINES, type Discipline } from '../engine/types';
import { dataName, numLocale, t } from '../i18n';
import { BracketView, DrawResultView, DrawStepsView, EntryView, GroupView, QualView, SeedsView, Who } from './EventViews';
import { entrantLabel, eventName, lookup, tierLabel, useGame } from './game';
import { LiveDraw } from './LiveDraw';
import { FinalsResult, formatName, winnerOf } from './Team';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';

// Halaman turnamen di karier: entry, kualifikasi/grup, undian, bagan untuk tiap nomor (data 2 musim terakhir).

const SECTIONS = ['entry', 'qual', 'draw', 'bracket'] as const;
type Section = (typeof SECTIONS)[number];
const LABEL = { entry: 'stageEntry', qual: 'stageQual', draw: 'stageDraw', bracket: 'stageBracket' } as const;

/** `onBack` kosong = disematkan di halaman turnamen yang sedang dimainkan (sudah ada sub-tab Jadwal), tanpa tombol Kembali. */
export function TournamentView({ id, year, onOpenPlayer, onBack }: { id: string; year: number; onOpenPlayer: (id: string) => void; onBack?: () => void }) {
  const { game } = useGame();
  const { state, ruleset, world } = game;
  const managed = state.career?.countryId;
  const def = ruleset.calendar.find((e) => e.id === id) ?? ruleset.team.events.find((e) => e.id === id);
  const city = world.cities.find((c) => def && c.id === hostCityId(def, year));
  const records = state.eventRecords.filter((r) => r.tournamentId === id && r.year === year);
  const played = DISCIPLINES.filter((d) => records.some((r) => r.discipline === d) || state.matches.some((m) => m.tournamentId === id && m.year === year && m.discipline === d));
  const [d, setD] = useState<Discipline | undefined>(played.find((x) => x === 'MS') ?? played[0]);
  const [section, setSection] = useState<Section>('bracket');
  const [replay, setReplay] = useState(false);
  const [page, setPage] = useState<'event' | 'participants' | 'winners' | 'history'>('event');

  const label = (x: string) => { const l = entrantLabel(state, x); return `${l.name} (${l.country})`; };
  const who = {
    name: label,
    mine: (x: string) => !!managed && entrantLabel(state, x).country === managed,
    onOpen: (x: string) => onOpenPlayer(lookup(state).pairs.get(x)?.playerIds[0] ?? x),
    eventTitle: eventName(ruleset, id, year),
  };
  // Beregu: hasil yang sudah selesai, atau yang sedang dimainkan (halaman dibuka dari layar babak).
  const team = [...state.teamResults, ...(liveTeamResults.get(state) ?? [])].filter((r) => r.eventId === id && r.year === year);
  const tier = def && 'tierId' in def ? tierLabel(def.tierId) : def?.countries ? t('multiEvent') : t('tabTeam');
  const prize = def && 'prizeUsd' in def && def.prizeUsd ? `$${def.prizeUsd.toLocaleString(numLocale())}` : '';

  const rec = records.find((r) => r.discipline === d);
  const matches = state.matches.filter((m) => m.tournamentId === id && m.year === year && m.discipline === d);
  const country = city && world.countries.find((c) => c.id === city.countryId);
  const fact = (k: string, v: ReactNode) => <div><dt>{k}</dt><dd>{v}</dd></div>;
  return (
    <section>
      {onBack && <div className="controls"><button onClick={onBack}>{t('back')}</button></div>}
      {/* Info turnamen: tier, tuan rumah, kota, venue, minggu, hadiah. */}
      <section className="card evinfo">
        <h2>{eventName(ruleset, id, year)} {year}</h2>
        <dl className="facts">
          {fact(t('tier'), tier)}
          {fact(t('hostCountry'), <><Flag id={city?.countryId} />{dataName(country?.name) ?? city?.countryId}</>)}
          {fact(t('city'), dataName(city?.name))}
          {fact(t('venue'), city?.venue)}
          {fact(t('week'), def && weekOf(def, year))}
          {prize && fact(t('prizeMoney'), prize)}
        </dl>
      </section>
      <nav className="controls">
        {(['event', 'participants', 'winners', 'history'] as const).map((x) => (
          <button key={x} aria-pressed={page === x} onClick={() => setPage(x)}>
            {x === 'event' ? t('pageEvent') : x === 'participants' ? t('participants') : x === 'winners' ? t('winnersOf', { y: year }) : t('winnersHistory')}
          </button>
        ))}
      </nav>
      {page === 'winners' ? <Winners id={id} year={year} who={{ ...who, name: (x) => entrantLabel(state, x).name }} />
      : page === 'history' ? <WinnersHistory id={id} who={{ ...who, name: (x) => entrantLabel(state, x).name }} />
      : page === 'participants' ? <Participants id={id} year={year} who={{ ...who, name: (x) => entrantLabel(state, x).name }} />
      : team.length > 0 ? team.map((r) => <FinalsResult key={r.format} r={r} />) : played.length === 0 ? <p>{t('notPlayedYet')}</p> : (
        <>
          {/* Bagian (entry, kualifikasi, undian, bagan) dulu, lalu nomor sebagai sub-tab. */}
          {records.length > 0 && (
            <nav className="controls">
              {SECTIONS.map((x) => <button key={x} aria-pressed={x === section} onClick={() => setSection(x)}>{t(LABEL[x])}</button>)}
            </nav>
          )}
          <nav className="controls subnav">
            {played.map((x) => <button key={x} aria-pressed={x === d} onClick={() => setD(x)}>{x}</button>)}
          </nav>
          {!rec ? (
            // Turnamen sebelum catatan disimpan (save lama): daftar laga per babak.
            <>
              <p className="hint">{t('limitedData')}</p>
              {[...new Set(matches.map((m) => m.round))].map((round) => (
                <div key={round}>
                  <h4>{round}</h4>
                  <ul>{matches.filter((m) => m.round === round).map((m) => (
                    <li key={m.id}>{label(m.sides[0])} {m.winner === 0 ? '✓' : ''} – {label(m.sides[1])} {m.winner === 1 ? '✓' : ''} · {m.scores.map((x) => x.join('-')).join(', ')}</li>
                  ))}</ul>
                </div>
              ))}
            </>
          ) : (
            <>
              {section === 'entry' && <EntryView rec={rec} matches={matches} {...who} />}
              {section === 'qual' && (rec.groups ? <GroupView rec={rec} matches={matches} {...who} /> : <QualView rec={rec} matches={matches} {...who} />)}
              {replay && (
                <LiveDraw replay title={`${eventName(ruleset, id, year)} · ${d}`} name={label} mine={who.mine} onClose={() => setReplay(false)}
                  show={{ steps: rec.steps, size: rec.groups ? undefined : rec.slots.length, groups: rec.groups?.groups.length }} />
              )}
              {section === 'draw' && (
                <>
                  <div className="controls"><button onClick={() => setReplay(true)}>▶ {t('draw_replay')}</button></div>
                  <h4>{t('stageSeeds')}</h4>
                  <SeedsView rec={rec} matches={matches} {...who} />
                  {rec.groups ? <GroupView rec={rec} matches={matches} {...who} /> : <DrawResultView rec={rec} matches={matches} {...who} />}
                  <details className="entrylist">
                    <summary>{t('drawLog')} <span className="count">{rec.steps.length}</span></summary>
                    <DrawStepsView rec={rec} matches={matches} {...who} />
                  </details>
                </>
              )}
              {section === 'bracket' && <BracketView rec={rec} matches={matches} {...who} />}
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Peserta per negara: atlet/pasangan tiap nomor (langsung, WC, kualifikasi) dan sejauh mana mereka melaju.
 * Beregu: skuad tiap negara per format. Negara sendiri di atas (terbuka), lalu yang terbanyak.
 */
function Participants({ id, year, who }: { id: string; year: number; who: WhoFns }) {
  const { game } = useGame();
  const { state, world } = game;
  const managed = state.career?.countryId;
  const countryName = (c: string) => dataName(world.countries.find((x) => x.id === c)?.name) ?? c;
  const team = [...state.teamResults, ...(liveTeamResults.get(state) ?? [])].filter((r) => r.eventId === id && r.year === year);
  type Row = { key: string; chip: string; body: ReactNode; result?: string };
  const byCountry = new Map<string, Row[]>();
  const add = (c: string, r: Row) => byCountry.set(c, [...(byCountry.get(c) ?? []), r]);
  if (team.length) {
    for (const r of team) for (const c of r.teams)
      add(c, { key: r.format + c, chip: formatName(r.format, r.eventId), body: (r.squads[c] ?? []).map((p) => entrantLabel(state, p).name).join(', ') || '—',
        result: r.reached[c] === 'W' ? `🏆 ${t('champion')}` : r.reached[c] });
  } else {
    const ms = state.matches.filter((m) => m.tournamentId === id && m.year === year);
    // Hasil: kalah di babak terakhirnya, juara, atau masih bertanding.
    const result = (e: string) => {
      const m = ms.filter((x) => x.sides.includes(e)).at(-1);
      if (!m) return undefined;
      const won = m.sides[m.winner] === e;
      return won ? (m.round === 'F' ? `🏆 ${t('champion')}` : t('stillIn')) : m.round;
    };
    for (const r of state.eventRecords.filter((x) => x.tournamentId === id && x.year === year)) {
      const tagged = [...r.entry.main.map((c) => ({ c, tag: '' })), ...r.entry.wildcards.map((c) => ({ c, tag: ' [WC]' })), ...r.entry.qualifying.map((c) => ({ c, tag: ' [Q]' }))];
      for (const { c, tag } of tagged) add(c.countryId, { key: r.discipline + c.id, chip: r.discipline, body: <Who id={c.id} {...who} suffix={tag} />, result: result(c.id) });
    }
  }
  if (!byCountry.size) return <p>{t('notPlayedYet')}</p>;
  const order = [...byCountry.keys()].sort((a, b) => Number(b === managed) - Number(a === managed) || byCountry.get(b)!.length - byCountry.get(a)!.length || countryName(a).localeCompare(countryName(b)));
  return (
    <>{order.map((c) => (
      <details key={c} className="entrylist" open={c === managed}>
        <summary><Flag id={c} />{countryName(c)} <span className="count">{byCountry.get(c)!.length}</span></summary>
        <table><tbody>{byCountry.get(c)!.map((r) => (
          <tr key={r.key}>
            <td><span className="chip">{r.chip}</span></td>
            <td>{r.body}</td>
            <td className="muted-text">{r.result ?? ''}</td>
          </tr>
        ))}</tbody></table>
      </details>
    ))}</>
  );
}

type WhoFns = { name: (id: string) => string; mine?: (id: string) => boolean; onOpen?: (id: string) => void };

/** Juara tiap nomor (atau format beregu) pada satu tahun: juara, runner-up, skor final. */
function Winners({ id, year, who }: { id: string; year: number; who: WhoFns }) {
  const { game } = useGame();
  const { state } = game;
  const country = (c: string) => dataName(game.world.countries.find((x) => x.id === c)?.name) ?? c;
  const team = state.teamResults.filter((r) => r.eventId === id && r.year === year);
  if (team.length) return (
    <table style={{ maxWidth: 720 }}>
      <thead><tr><th></th><th>{t('champion')}</th><th>{t('runnerUp')}</th><th>{t('finalScore')}</th></tr></thead>
      <tbody>{team.map((r) => {
        const w = winnerOf(r), f = r.ties.find((x) => x.round === 'F');
        const k = f ? f.sides.indexOf(w ?? '') : -1, ru = f && k >= 0 ? f.sides[1 - k] : undefined;
        return (
          <tr key={r.format} className={w && who.mine?.(w) ? 'sel' : ''}>
            <td><span className="chip">{formatName(r.format, r.eventId)}</span></td>
            <td><b><Flag id={w} />{w ? country(w) : '—'}</b></td>
            <td>{ru ? <><Flag id={ru} />{country(ru)}</> : '—'}</td>
            <td className="num">{f && k >= 0 ? `${f.score[k]}–${f.score[1 - k]}` : ''}</td>
          </tr>
        );
      })}</tbody>
    </table>
  );
  const rows = DISCIPLINES.flatMap((d) => {
    const c = state.champions.find((x) => x.tournamentId === id && x.year === year && x.discipline === d);
    if (!c) return [];
    const f = state.matches.find((m) => m.tournamentId === id && m.year === year && m.discipline === d && m.round === 'F');
    const i = f ? f.sides.indexOf(c.winner) : -1;
    return [{ d, winner: c.winner, ru: f && i >= 0 ? f.sides[1 - i] : undefined, f, i }];
  });
  if (!rows.length) return <p>{t('noChampions')}</p>;
  return (
    <table style={{ maxWidth: 900 }}>
      <thead><tr><th></th><th>{t('champion')}</th><th>{t('runnerUp')}</th><th>{t('finalScore')}</th></tr></thead>
      <tbody>{rows.map(({ d, winner, ru, f, i }) => (
        <tr key={d} className={who.mine?.(winner) ? 'sel' : ''}>
          <td><span className="chip">{d}</span></td>
          <td><b><Who id={winner} {...who} /></b></td>
          <td>{ru ? <Who id={ru} {...who} /> : '—'}</td>
          <td className="num">{f && <MatchLink m={f} name={who.name}>{f.scores.map((g) => `${g[i]}-${g[1 - i]}`).join(', ')}</MatchLink>}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** Riwayat juara turnamen ini di semua tahun yang sudah dimainkan (terbaru dulu). */
function WinnersHistory({ id, who }: { id: string; who: WhoFns }) {
  const { game } = useGame();
  const { state } = game;
  const country = (c: string) => dataName(game.world.countries.find((x) => x.id === c)?.name) ?? c;
  const team = state.teamResults.filter((r) => r.eventId === id);
  if (team.length) {
    const formats = [...new Set(team.map((r) => r.format))];
    const years = [...new Set(team.map((r) => r.year))].sort((a, b) => b - a);
    return (
      <div className="scroll"><table style={{ maxWidth: 720 }}>
        <thead><tr><th>{t('year')}</th>{formats.map((f) => <th key={f}>{formatName(f, id)}</th>)}</tr></thead>
        <tbody>{years.map((y) => (
          <tr key={y}><td>{y}</td>{formats.map((f) => {
            const r = team.find((x) => x.year === y && x.format === f);
            const w = r && winnerOf(r);
            return <td key={f} className={w && who.mine?.(w) ? 'mine' : ''}>{w ? <><Flag id={w} />{country(w)}</> : '—'}</td>;
          })}</tr>
        ))}</tbody>
      </table></div>
    );
  }
  const champs = state.champions.filter((c) => c.tournamentId === id);
  if (!champs.length) return <p>{t('noChampions')}</p>;
  const years = [...new Set(champs.map((c) => c.year))].sort((a, b) => b - a);
  const ds = DISCIPLINES.filter((d) => champs.some((c) => c.discipline === d));
  return (
    <div className="scroll"><table>
      <thead><tr><th>{t('year')}</th>{ds.map((d) => <th key={d}>{d}</th>)}</tr></thead>
      <tbody>{years.map((y) => (
        <tr key={y}><td>{y}</td>{ds.map((d) => {
          const c = champs.find((x) => x.year === y && x.discipline === d);
          return <td key={d}>{c ? <Who id={c.winner} {...who} /> : '—'}</td>;
        })}</tr>
      ))}</tbody>
    </table></div>
  );
}
