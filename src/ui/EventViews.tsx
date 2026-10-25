import type { Candidate } from '../engine/entry';
import type { EventRecord } from '../engine/tournament';
import type { DrawStep, Match } from '../engine/types';
import { t } from '../i18n';
import { Flag } from './Flag';
import { MatchLink } from './MatchDetail';

// Tampilan satu nomor turnamen (entry, kualifikasi, grup, undian, bagan). Dipakai Wizard (Lab) & halaman turnamen karier.

export interface ViewProps {
  rec: EventRecord;
  name: (id: string) => string;
  matches: Match[]; // laga nomor ini saja (untuk skor)
  mine?: (id: string) => boolean; // disorot (atlet negara sendiri)
  onOpen?: (id: string) => void; // klik nama → profil
  eventTitle?: string; // judul pop-up detail laga
}
type WhoProps = Pick<ViewProps, 'name' | 'mine' | 'onOpen' | 'eventTitle'>;

/** Nama peserta: disorot bila milik negara sendiri, bisa diklik bila `onOpen` ada. */
export function Who({ id, name, mine, onOpen, suffix = '' }: WhoProps & { id?: string | null; suffix?: string }) {
  if (!id) return <span className="muted">{t('bye')}</span>;
  const cls = mine?.(id) ? 'mine' : undefined;
  return onOpen
    ? <a href="#" className={cls} onClick={(e) => { e.preventDefault(); onOpen(id); }}><Flag id={id} />{name(id)}{suffix}</a>
    : <span className={cls}><Flag id={id} />{name(id)}{suffix}</span>;
}

export function EntryView({ rec, ...who }: ViewProps) {
  return <EntryLists entry={rec.entry} {...who} />;
}

/**
 * Daftar entry: diterima langsung, wildcard, kualifikasi, cadangan. Tabel ringkas: urutan, atlet, negara, ranking;
 * baris negara sendiri disorot. Cadangan (bisa sangat panjang) tertutup dulu.
 */
export function EntryLists({ entry, ...who }: WhoProps & { entry: EventRecord['entry'] }) {
  // ponytail: nama tampilan sebagian pemanggil berakhiran " (KODE)"; negara sudah punya kolom sendiri.
  const short = (id: string) => who.name(id).replace(/ \([A-Z]{3}\)$/, '');
  const list = (title: string, items: Candidate[], open = true) => items.length > 0 && (
    <details className="entrylist" open={open}>
      <summary>{title} <span className="count">{items.length}</span></summary>
      <table>
        <tbody>{items.map((c, i) => (
          <tr key={c.id} className={who.mine?.(c.id) ? 'sel' : undefined}>
            <td className="num muted-text">{i + 1}</td>
            <td><Who id={c.id} {...who} name={short} /></td>
            <td className="muted-text">{c.countryId}</td>
            <td className="num">{c.rank ? `#${c.rank}` : '—'}</td>
          </tr>
        ))}</tbody>
      </table>
    </details>
  );
  return (
    <>
      {list(t('directEntry'), entry.main)}
      {list(t('wildcard'), entry.wildcards)}
      {list(t('qualifying'), entry.qualifying)}
      {list(t('reserves'), entry.reserves, false)}
    </>
  );
}

const matchOf = (matches: Match[], a?: string | null, b?: string | null) =>
  (a && b && matches.find((x) => x.sides.includes(a) && x.sides.includes(b))) || undefined;
const scoreText = (m: Match, a: string) =>
  m.scores.map(([x, y]) => (m.sides[0] === a ? `${x}-${y}` : `${y}-${x}`)).join(', ') + (m.walkover ? ' w/o' : m.retired ? ' ret.' : '');

export function QualView({ rec, matches, ...who }: ViewProps) {
  if (!rec.qualRounds.length) return <p>{t('noQualifying')}</p>;
  return <>{rec.qualRounds.map((rounds, i) => (
    <div key={i}>
      <h4>{t('section')} {i + 1}{winnerOf(rounds) && <> → <Who id={winnerOf(rounds)} {...who} /></>}</h4>
      <RoundColumns rounds={rounds} matches={matches} {...who} />
    </div>
  ))}</>;
}

/** Klasemen grup + hasil laganya. Grup yang belum selesai: klasemen sementara dihitung dari laga yang sudah dimainkan. */
export function GroupView({ rec, matches, ...who }: ViewProps) {
  const { groups, standings } = rec.groups!;
  return (
    <div className="groups">
      {groups.map((ids, i) => {
        const games = matches.filter((m) => m.round === 'G' && ids.includes(m.sides[0]) && ids.includes(m.sides[1]));
        // ponytail: urutan sementara tanpa head-to-head; klasemen final (dengan tiebreak) dari mesin begitu grup selesai.
        const rows = standings[i] ?? ids.map((id) => {
          const r = { id, wins: 0, gameDiff: 0, pointDiff: 0 };
          for (const m of games.filter((x) => x.sides.includes(id))) {
            const s = m.sides.indexOf(id);
            if (m.winner === s) r.wins++;
            for (const g of m.scores) { r.gameDiff += g[s] > g[1 - s] ? 1 : -1; r.pointDiff += g[s] - g[1 - s]; }
          }
          return r;
        }).sort((a, b) => b.wins - a.wins || b.gameDiff - a.gameDiff || b.pointDiff - a.pointDiff);
        return (
          <section key={i} className="card group">
            <table>
              <thead><tr><th>{t('group')} {String.fromCharCode(65 + i)}</th><th className="num" title={t('wins')}>W</th><th className="num" title={'±' + t('games')}>±G</th><th className="num" title={'±' + t('points')}>±P</th></tr></thead>
              <tbody>{rows.map((r, k) => (
                <tr key={r.id} className={who.mine?.(r.id) ? 'sel' : undefined}><td><span className="muted-text">{k + 1}.</span> <Who id={r.id} {...who} /></td><td className="num">{r.wins}</td><td className="num">{r.gameDiff}</td><td className="num">{r.pointDiff}</td></tr>
              ))}</tbody>
            </table>
            {games.length > 0 && (
              <ul className="groupgames">{games.map((m) => {
                const [w, l] = m.winner === 0 ? m.sides : [m.sides[1], m.sides[0]];
                return <li key={m.id}><span className="win"><Who id={w} {...who} /></span><span><Who id={l} {...who} /></span><span className="score"><MatchLink m={m} name={who.name} title={who.eventTitle}>{scoreText(m, w).replace(/, /g, '\n')}</MatchLink></span></li>;
              })}</ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Daftar unggulan: nomor unggulan, peserta, posisi di bagan (format grup: urutan pot = peringkat). */
export function SeedsView({ rec, ...who }: ViewProps) {
  if (rec.groups) {
    const ids = [...rec.entry.main, ...rec.entry.wildcards].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).map((c) => c.id);
    return <ol>{ids.map((id) => <li key={id}><Who id={id} {...who} /></li>)}</ol>;
  }
  return (
    <table className="drawboard seeds"><tbody>
      {rec.slots.filter((s) => s.seed).sort((a, b) => a.seed! - b.seed!).map((s) => (
        <tr key={s.pos} className={who.mine?.(s.entrant!) ? 'sel' : undefined}>
          <td className="num muted-text">[{s.seed}]</td><td><Who id={s.entrant} {...who} /></td><td className="num muted-text">{t('position')} {s.pos}</td>
        </tr>
      ))}
    </tbody></table>
  );
}

/** Hasil undian bagan gugur: posisi demi posisi (unggulan, Q, WC, bye), dibagi paruh atas & bawah. */
export function DrawResultView({ rec, ...who }: ViewProps) {
  const half = rec.slots.length / 2;
  const rows = (from: number, to: number) => (
    <table className="drawboard"><tbody>{rec.slots.slice(from, to).map((s) => (
      <tr key={s.pos} className={s.entrant && who.mine?.(s.entrant) ? 'sel' : undefined}>
        <td className="num muted-text">{s.pos}</td>
        <td className="muted-text">{s.seed ? `[${s.seed}]` : s.qualifier ? '[Q]' : s.wildcard ? '[WC]' : ''}</td>
        <td>{s.bye ? <span className="muted">{t('bye')}</span> : s.entrant ? <Who id={s.entrant} {...who} /> : <span className="muted">{t('qualifying')}</span>}</td>
      </tr>
    ))}</tbody></table>
  );
  return (
    <div className="halves">
      <div><h4>{t('draw_topHalf')}</h4>{rows(0, half)}</div>
      <div><h4>{t('draw_bottomHalf')}</h4>{rows(half, rec.slots.length)}</div>
    </div>
  );
}

/** Teks satu langkah undian, dengan id peserta diganti nama. */
export const stepText = (s: DrawStep, name: (id: string) => string) =>
  t(s.key, { ...s.vars, ...(s.vars.e !== undefined ? { e: name(String(s.vars.e)) } : {}) });

/** Langkah undian; `count` membatasi jumlah yang tampil (Wizard: langkah demi langkah). */
export function DrawStepsView({ rec, name, count }: ViewProps & { count?: number }) {
  return <ol>{rec.steps.slice(0, count ?? rec.steps.length).map((s, i) => <li key={i}>{stepText(s, name)}</li>)}</ol>;
}

/** Pemenang bagan; kosong selama bagan belum selesai. */
const winnerOf = (rounds: (string | null)[][]) => (rounds.at(-1)?.length === 1 ? rounds.at(-1)![0] : null);

/** Bagan utama; kualifikasi (bila ada) ditampilkan di atasnya. Posisi qualifier yang belum terisi bertuliskan "Kualifikasi". */
export function BracketView({ rec, matches, ...who }: ViewProps) {
  const tag = (id?: string | null) => {
    const s = rec.slots.find((x) => x.entrant === id);
    return s?.seed ? ` [${s.seed}]` : s?.qualifier ? ' [Q]' : s?.wildcard ? ' [WC]' : '';
  };
  const champ = winnerOf(rec.rounds);
  if (rec.groups) {
    // Format grup: klasemen & laga grup, lalu bagan gugur (laga grup disaring agar ulangan di babak gugur tidak tertukar skornya).
    const ko = matches.filter((m) => m.round !== 'G');
    return (
      <>
        {champ && <p><b>{t('champion')}:</b> <Who id={champ} {...who} /></p>}
        <h4>{t('groupStage')}</h4>
        <GroupView rec={rec} matches={matches} {...who} />
        <h4>{t('knockout')}</h4>
        {rec.rounds.length ? <RoundColumns rounds={rec.rounds} matches={ko} {...who} /> : <p className="muted">{t('knockoutPending')}</p>}
      </>
    );
  }
  return (
    <>
      {champ && <p><b>{t('champion')}:</b> <Who id={champ} {...who} suffix={tag(champ)} /></p>}
      {rec.qualRounds.length > 0 && (
        <details>
          <summary>{t('qualifying')} ({rec.qualRounds.length})</summary>
          <QualView rec={rec} matches={matches} {...who} />
        </details>
      )}
      <RoundColumns rounds={rec.rounds} matches={matches} {...who} tag={tag} pending={(i) => (rec.slots[i]?.qualifier ? t('qualifying') : undefined)} />
    </>
  );
}

/**
 * Bagan: satu kolom per babak, kotak pertandingan berisi dua nama + skor. Bagan yang sedang berjalan: babak terakhir
 * terisi sebagian. `pending`: teks untuk posisi babak pertama yang belum terisi (mis. menunggu lolosan kualifikasi).
 */
export function RoundColumns({ rounds, matches, tag, pending, ...who }: WhoProps & {
  rounds: (string | null)[][]; matches: Match[]; tag?: (id?: string | null) => string; pending?: (pos: number) => string | undefined;
}) {
  const cols = rounds.at(-1)!.length > 1 ? [...rounds, []] : rounds; // babak yang belum dimulai: kolom tanpa pemenang
  // Kosong di babak pertama = bye (atau menunggu lolosan kualifikasi); di babak berikutnya = laga belum dimainkan.
  const side = (id: string | null, r: number, pos: number) =>
    id ? <Who id={id} {...who} suffix={tag?.(id)} />
    : r > 0 ? <span className="muted">—</span>
    : pending?.(pos) ? <span className="muted">{pending(pos)}</span> : <Who id={id} {...who} />;
  return (
    <div className="bracket">
      {cols.slice(0, -1).map((field, r) => (
        <div className="round" key={r}>
          {Array.from({ length: field.length / 2 }, (_, k) => {
            const a = field[2 * k], b = field[2 * k + 1], w = cols[r + 1][k];
            const m = matchOf(matches, a, b);
            return (
              <div className={`match${a && who.mine?.(a) || b && who.mine?.(b) ? ' mine' : ''}`} key={k}>
                <div className={w && w === a ? 'win' : ''}>{side(a, r, 2 * k)}</div>
                <div className={w && w === b ? 'win' : ''}>{side(b, r, 2 * k + 1)}</div>
                <small>{m && a && <MatchLink m={m} name={who.name} title={who.eventTitle}>{scoreText(m, a)}</MatchLink>}</small>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
