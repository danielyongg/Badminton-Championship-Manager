import type { Candidate } from '../engine/entry';
import type { EventRecord } from '../engine/tournament';
import type { DrawStep, Match } from '../engine/types';
import { t } from '../i18n';
import { Flag } from './Flag';

// Tampilan satu nomor turnamen (entry, kualifikasi, grup, undian, bagan). Dipakai Wizard (Lab) & halaman turnamen karier.

export interface ViewProps {
  rec: EventRecord;
  name: (id: string) => string;
  matches: Match[]; // laga nomor ini saja (untuk skor)
  mine?: (id: string) => boolean; // disorot (atlet negara sendiri)
  onOpen?: (id: string) => void; // klik nama → profil
}
type WhoProps = Pick<ViewProps, 'name' | 'mine' | 'onOpen'>;

/** Nama peserta: disorot bila milik negara sendiri, bisa diklik bila `onOpen` ada. */
export function Who({ id, name, mine, onOpen, suffix = '' }: WhoProps & { id?: string | null; suffix?: string }) {
  if (!id) return <span className="muted">{t('bye')}</span>;
  const cls = mine?.(id) ? 'mine' : undefined;
  return onOpen
    ? <a href="#" className={cls} onClick={(e) => { e.preventDefault(); onOpen(id); }}><Flag id={id} />{name(id)}{suffix}</a>
    : <span className={cls}><Flag id={id} />{name(id)}{suffix}</span>;
}

export function EntryView({ rec, ...who }: ViewProps) {
  const list = (title: string, items: Candidate[]) => (
    <details open={items.length > 0 && items.length < 40}>
      <summary>{title} ({items.length})</summary>
      <ol>{items.map((c) => <li key={c.id}><Who id={c.id} {...who} /> — {c.rank ? `#${c.rank}` : '—'}</li>)}</ol>
    </details>
  );
  return (
    <>
      {list(t('directEntry'), rec.entry.main)}
      {list(t('wildcard'), rec.entry.wildcards)}
      {list(t('qualifying'), rec.entry.qualifying)}
      {list(t('reserves'), rec.entry.reserves)}
    </>
  );
}

const scoreOf = (matches: Match[], a?: string | null, b?: string | null) => {
  const m = a && b && matches.find((x) => x.sides.includes(a) && x.sides.includes(b));
  return m ? m.scores.map(([x, y]) => (m.sides[0] === a ? `${x}-${y}` : `${y}-${x}`)).join(', ') + (m.walkover ? ' w/o' : m.retired ? ' ret.' : '') : '';
};

export function QualView({ rec, matches, ...who }: ViewProps) {
  if (!rec.qualRounds.length) return <p>{t('noQualifying')}</p>;
  return <>{rec.qualRounds.map((rounds, i) => (
    <div key={i}>
      <h4>{t('section')} {i + 1} → <Who id={rounds.at(-1)![0]} {...who} /></h4>
      <RoundColumns rounds={rounds} matches={matches} {...who} />
    </div>
  ))}</>;
}

export function GroupView({ rec, ...who }: ViewProps) {
  return (
    <div className="groups">
      {rec.groups!.standings.map((rows, i) => (
        <table key={i}>
          <thead><tr><th>{t('group')} {String.fromCharCode(65 + i)}</th><th>{t('wins')}</th><th>±{t('games')}</th><th>±{t('points')}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td><Who id={r.id} {...who} /></td><td className="num">{r.wins}</td><td className="num">{r.gameDiff}</td><td className="num">{r.pointDiff}</td></tr>
          ))}</tbody>
        </table>
      ))}
    </div>
  );
}

/** Daftar unggulan (format grup: urutan pot = peringkat). */
export function SeedsView({ rec, ...who }: ViewProps) {
  const ids = rec.groups
    ? [...rec.entry.main, ...rec.entry.wildcards].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).map((c) => c.id)
    : rec.slots.filter((s) => s.seed).sort((a, b) => a.seed! - b.seed!).map((s) => s.entrant!);
  return <ol>{ids.map((id) => <li key={id}><Who id={id} {...who} /></li>)}</ol>;
}

/** Teks satu langkah undian, dengan id peserta diganti nama. */
export const stepText = (s: DrawStep, name: (id: string) => string) =>
  t(s.key, { ...s.vars, ...(s.vars.e !== undefined ? { e: name(String(s.vars.e)) } : {}) });

/** Langkah undian; `count` membatasi jumlah yang tampil (Wizard: langkah demi langkah). */
export function DrawStepsView({ rec, name, count }: ViewProps & { count?: number }) {
  return <ol>{rec.steps.slice(0, count ?? rec.steps.length).map((s, i) => <li key={i}>{stepText(s, name)}</li>)}</ol>;
}

export function BracketView({ rec, matches, ...who }: ViewProps) {
  const tag = (id?: string | null) => {
    const s = rec.slots.find((x) => x.entrant === id);
    return s?.seed ? ` [${s.seed}]` : s?.qualifier ? ' [Q]' : s?.wildcard ? ' [WC]' : '';
  };
  const champ = rec.rounds.at(-1)![0];
  return (
    <>
      <p><b>{t('champion')}:</b> <Who id={champ} {...who} suffix={tag(champ)} /></p>
      <RoundColumns rounds={rec.rounds} matches={matches} {...who} tag={tag} />
    </>
  );
}

/** Bagan: satu kolom per babak, kotak pertandingan berisi dua nama + skor. */
function RoundColumns({ rounds, matches, tag, ...who }: WhoProps & { rounds: (string | null)[][]; matches: Match[]; tag?: (id?: string | null) => string }) {
  return (
    <div className="bracket">
      {rounds.slice(0, -1).map((field, r) => (
        <div className="round" key={r}>
          {Array.from({ length: field.length / 2 }, (_, k) => {
            const a = field[2 * k], b = field[2 * k + 1], w = rounds[r + 1][k];
            return (
              <div className="match" key={k}>
                <div className={w && w === a ? 'win' : ''}><Who id={a} {...who} suffix={tag?.(a)} /></div>
                <div className={w && w === b ? 'win' : ''}><Who id={b} {...who} suffix={tag?.(b)} /></div>
                <small>{scoreOf(matches, a, b)}</small>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
