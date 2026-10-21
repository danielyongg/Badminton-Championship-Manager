import { useMemo, useState } from 'react';
import { dissolvePair, formPair, promoteJunior, promoteTrial } from '../engine/career';
import { ageAt, currentAbility, isPratama } from '../engine/generator';
import { absWeek, computeRanking, rankMap } from '../engine/ranking';
import type { Pair } from '../engine/types';
import type { SeasonState } from '../engine/season';
import { t, type TextKey } from '../i18n';
import { FatigueBar, FitStatus, MoraleTag, RankCell, TierPrefs } from './Squad';
import { moraleTier, pairAbility } from '../engine/match';
import { lookup, saveGame, useGame } from './game';

const DOUBLES: Pair['discipline'][] = ['MD', 'WD', 'XD'];

/** Pasangan aktif negara manajer satu nomor ganda (junior = kedua atlet junior pratama), tanpa yang dilepas/dadakan. */
export function ownPairs(state: SeasonState, d: Pair['discipline'], juniors: boolean) {
  const { players } = lookup(state);
  const country = state.career!.countryId!;
  const isJunior = (id: string) => isPratama(players.get(id)!, state.date);
  return state.pairs.filter((p) => p.discipline === d && !p.dissolved && !p.adHoc && players.get(p.playerIds[0])?.countryId === country
    && p.playerIds.every((id) => players.get(id)!.released === undefined) && p.playerIds.every(isJunior) === juniors);
}

/** Pasangan negara sendiri satu nomor ganda untuk satu kelompok usia: junior = kedua atlet junior, selain itu senior. */
export function Pairs({ discipline: d, onOpen, juniors = false }: { discipline: Pair['discipline']; onOpen: (id: string) => void; juniors?: boolean }) {
  const { game, version, changed } = useGame();
  const { state, ruleset } = game;
  const country = state.career!.countryId!;
  const { players } = lookup(state);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [trial, setTrial] = useState(false);

  const ranks = useMemo(() => {
    const now = absWeek(state.date);
    const of = (results: typeof state.results) => Object.fromEntries(DOUBLES.map((x) => [x, rankMap(computeRanking(results, x, now, ruleset))]));
    return { senior: of(state.results), junior: of(state.juniorResults ?? []) };
  }, [version, state, ruleset]);
  const [sort, setSort] = useState({ key: 'rank', desc: false });

  const commit = () => { changed(); void saveGame(game); };
  const isJunior = (id: string) => isPratama(players.get(id)!, state.date); // junior yang sudah promosi masuk Senior
  // Pasangan berisi atlet Development (pratama): tidak masuk turnamen senior otomatis sampai dipromosikan.
  const pratama = (p: Pair) => p.playerIds.some((id) => isPratama(players.get(id)!, state.date));
  const mine = ownPairs(state, d, juniors);
  const athletes = (gender: 'M' | 'F') => state.players
    .filter((p) => p.countryId === country && p.retired === undefined && p.released === undefined && p.gender === gender && p.focus !== 'S' && isJunior(p.id) === juniors)
    .sort((x, y) => currentAbility(y.attrs) - currentAbility(x.attrs));
  const genders: Record<Pair['discipline'], ['M' | 'F', 'M' | 'F']> = { MD: ['M', 'M'], WD: ['F', 'F'], XD: ['M', 'F'] };
  const option = (id: string) => {
    const p = players.get(id)!;
    return <option key={id} value={id}>{p.name} ({ageAt(p.birth, state.date)} {t('yearsShort')}, {currentAbility(p.attrs)})</option>;
  };

  // Tabel bergaya sama dengan daftar pemain (Single): satu baris per pasangan, kolom bisa diurutkan.
  const avg = (p: Pair, f: (x: NonNullable<ReturnType<typeof players.get>>) => number) => p.playerIds.reduce((t, id) => t + f(players.get(id)!), 0) / p.playerIds.length;
  const rankList = (p: Pair) => [
    { d: p.discipline as string, r: ranks.senior[p.discipline].get(p.id) },
    { d: `${p.discipline} Jr`, r: ranks.junior[p.discipline].get(p.id) },
  ].filter((x) => x.r !== undefined).sort((a, b) => a.r! - b.r!);
  // Kolom mengikuti tab tunggal (Nama, Usia, Ability, Potensi→Chemistry, Morale, Kelelahan, Status, BWF rank); mHide = disembunyikan di HP.
  // Jenis pasangan (percobaan / Development) tampil sebagai tag di bawah nama.
  // Ability pasangan = kekuatan sisi ganda di mesin (rata-rata ability + bonus chemistry), bukan sekadar rata-rata.
  const abilityOf = (p: Pair) => pairAbility(p.playerIds.map((id) => currentAbility(players.get(id)!.attrs)), p.chemistry, ruleset.match);
  const abilityTitle = (p: Pair) => {
    const base = avg(p, (x) => currentAbility(x.attrs)), bonus = abilityOf(p) - base;
    return `${p.playerIds.map((id) => currentAbility(players.get(id)!.attrs)).join(' / ')} → ${t('average')} ${Math.round(base)} ${bonus >= 0 ? '+' : '−'} ${t('chemistry')} ${Math.abs(bonus).toFixed(1)}`;
  };
  const fatigue = (p: Pair) => Math.max(...p.playerIds.map((id) => players.get(id)!.fatigue));
  const COLS: { key: string; label: TextKey; num?: boolean; value: (p: Pair) => string | number; desc?: boolean; mHide?: boolean }[] = [
    { key: 'pair', label: 'pair', value: (p) => p.playerIds.map((id) => players.get(id)!.name).join(' / ') },
    { key: 'age', label: 'age', num: true, value: (p) => avg(p, (x) => ageAt(x.birth, state.date)) }, // tampil keduanya, urut menurut rata-rata
    { key: 'ability', label: 'ability', num: true, value: (p) => abilityOf(p), desc: true },
    { key: 'chem', label: 'chemistry', num: true, value: (p) => p.chemistry, desc: true },
    { key: 'together', label: 'matchesShort', num: true, value: (p) => p.matchesTogether, desc: true, mHide: true },
    { key: 'morale', label: 'morale', value: (p) => avg(p, (x) => x.form), desc: true }, // = efek morale sisi ganda di mesin (rata-rata)
    { key: 'fatigue', label: 'fatigue', value: fatigue, desc: true, mHide: true },
    { key: 'status', label: 'status', value: (p) => { const hurt = p.playerIds.map((id) => players.get(id)!.injury?.weeksLeft ?? 0); return Math.max(...hurt) ? 2 + Math.max(...hurt) / 100 : fatigue(p) > ruleset.ai.restAbove ? 1 : 0; }, desc: true },
    { key: 'rank', label: 'bwfRank', num: true, value: (p) => rankList(p)[0]?.r ?? Infinity },
  ];
  // Morale pasangan: tingkat dari rata-rata morale kedua atlet; keterangan menyebut morale masing-masing.
  const moraleTitle = (p: Pair) => p.playerIds.map((id) => `${players.get(id)!.name}: ${t(`morale_${moraleTier(players.get(id)!.form)}` as TextKey)}`).join(' · ');
  const col = COLS.find((c) => c.key === sort.key)!;
  const cmp = (a: Pair, b: Pair) => {
    const x = col.value(a), y = col.value(b);
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return (sort.desc ? -r : r) || (rankList(a)[0]?.r ?? Infinity) - (rankList(b)[0]?.r ?? Infinity);
  };
  const list = [...mine].sort(cmp);
  // Jenis pasangan di bawah nama: hanya yang tidak biasa (percobaan / Development); pasangan utama tanpa tag.
  const kind = (p: Pair) => p.trial ? <span className="tag muted-tag">{t('trialPair')}</span>
    : pratama(p) ? <span className="tag muted-tag" title={t('pratamaHint')}>{t('pratama')}</span> : null;

  return (
    <>
      {list.length === 0 ? <p className="hint">{t('noPairsYet')}</p> : (
        <div className="scroll">
          <table className="squadtable pairtable">
            <thead><tr>{COLS.map((c) => (
              <th key={c.key} className={`sortable${c.num ? ' num' : ''}${c.mHide ? ' m-hide' : ''}`} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
                onClick={() => setSort(sort.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: !!c.desc })}>
                {t(c.label)}{sort.key === c.key ? (sort.desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}<th title={t('tierPrefsHint')}>{t('tierPrefs')}</th><th></th></tr></thead>
            <tbody>{list.map((p) => (
              <tr key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: 'pointer' }}>{/* baris → profil pasangan, nama → profil atlet */}
                <td>{p.playerIds.map((id) => (
                  <a key={id} href="#" className="pname" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(id); }}>{players.get(id)!.name}</a>
                ))}{kind(p)}</td>
                <td className="num">{p.playerIds.map((id) => ageAt(players.get(id)!.birth, state.date)).join(' / ')}</td>
                <td className="num" title={abilityTitle(p)}>{Math.round(abilityOf(p))}</td>
                <td className="num">{Math.round(p.chemistry)}</td>
                <td className="num m-hide">{p.matchesTogether}</td>
                <td><MoraleTag value={avg(p, (x) => x.form)} short detail={moraleTitle(p)} /></td>
                <td className="m-hide"><FatigueBar value={fatigue(p)} /></td>
                <td><FitStatus ps={p.playerIds.map((id) => players.get(id)!)} /></td>
                <td className="num"><RankCell ranks={rankList(p)} /></td>
                <td onClick={(e) => e.stopPropagation()}>{p.trial ? '—' : <TierPrefs id={p.id} />}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
                  {pratama(p) && <button className="mini btn-go" onClick={() => { p.playerIds.forEach((id) => promoteJunior(state, id)); commit(); }}>{t('promote')}</button>}
                  {p.trial && <button className="mini" onClick={() => { if (confirm(t('confirmPromote'))) { promoteTrial(state, p.id); commit(); } }}>{t('promoteTrial')}</button>}
                  {' '}<button className="mini" onClick={() => { if (p.trial || confirm(t('confirmDissolve'))) { dissolvePair(state, p.id); commit(); } }}>{t('dissolve')}</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <section className="card">
        <h3>{t('formPair')} {d}</h3>
        <div className="controls formpair">
          <select value={a} onChange={(e) => setA(e.target.value)}><option value="">—</option>{athletes(genders[d][0]).map((p) => option(p.id))}</select>
          <select value={b} onChange={(e) => setB(e.target.value)}><option value="">—</option>{athletes(genders[d][1]).map((p) => option(p.id))}</select>
          <button disabled={!a || !b} onClick={() => {
            const r = formPair(state, d, a, b, game.rng, trial);
            if (typeof r === 'string') setError(r);
            else { setError(''); setA(''); setB(''); commit(); }
          }}>{t('formPair')}</button>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} /> {t('trialCheckbox')}</label>
        </div>
        {trial && <p className="hint">{t('trialHint')}</p>}
        {error && <p className="down">{error}</p>}
      </section>
    </>
  );
}
