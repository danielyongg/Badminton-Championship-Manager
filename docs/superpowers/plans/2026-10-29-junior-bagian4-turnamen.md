# Junior bagian 4 — Turnamen junior: rencana implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Target federasi junior, chip Junior di Dashboard, junior Pratama yang siap ikut turnamen senior grade 3, kuota junior dicocokkan dengan data BWF.

**Spesifikasi:** `docs/superpowers/specs/2026-10-29-junior-scouting-promosi-design.md` bagian 4.

## Global Constraints
- Target junior memakai jenis target yang sudah ada (`medals` untuk Kejuaraan Dunia Junior, `team` untuk Suhandinata) — tanpa jenis baru.
- Pratama ke grade 3 senior: hanya IC/IS/FS, hanya atlet Pratama negara manajer dengan `readySince` (siap promosi = kemampuan ≥ peringkat 200 senior atau 10 besar junior), aturan peluang ikut/istirahat AI tetap berlaku, entry yang di-submit manajer tetap dihormati.
- Kuota (temuan 2026-10-29): Kejuaraan Dunia Junior 2025 — negara besar mengirim 4 tunggal, ganda terlihat s/d 3 pasangan → `WJC` 4/3 (sebelumnya 3/2). Pan Am Junior (regulasi Badminton Pan Am): 4 tunggal, 2 ganda, 4 campuran → `JC2` 4/2 (campuran tidak dibedakan). `JC` Asia/Eropa & Junior International tetap (regulasi lengkap tidak terbaca; JIS/JIC/JGP sebenarnya terbuka, kuota game = perkiraan keikutsertaan). Save lama memakai kuota lama (tier tersimpan di save).

### Task 1: Target junior (`src/engine/career.ts`, tes `src/engine/career.test.ts`, `src/engine/team.test.ts`)
- [ ] Tes: negara dengan junior berperingkat ≤ 4 di ranking junior mendapat target `medals` Kejuaraan Dunia Junior (target = jumlah nomor dengan junior top 4); negara tanpa junior top 4 tidak. Target Suhandinata (format `suhandinata`) hanya bila kekuatan tim junior peringkat 1–8 (1 → juara, 2 → final, 3–4 → semifinal, 5–8 → perempat final). Ubah `team.test.ts` baris "goals.some(g.format === 'suhandinata') false" → bila ada, targetnya ≥ 2.
- [ ] Implementasi `juniorGoals(state, rs, countryId)` dipanggil di `seasonGoals`:

```ts
/** Target junior (ASUMSI): medali Kejuaraan Dunia Junior sebanyak nomor dengan junior top 4 ranking junior; Suhandinata dari peringkat kekuatan tim junior (1–8). */
function juniorGoals(state: SeasonState, rs: Ruleset, countryId: string): FederationGoal[] {
  const year = state.date.year, out: FederationGoal[] = [];
  const wjc = heldOfTier(rs, 'WJC', year);
  const country = countryOfEntrant(state), now = absWeek(state.date);
  const top4 = DISCIPLINES.filter((d) => computeRanking(state.juniorResults ?? [], d, now, rs).some((r) => r.rank <= 4 && country(r.entrantId) === countryId)).length;
  if (wjc && top4) out.push({ kind: 'medals', eventId: wjc.id, target: top4 });
  if (rs.team.events.some((e) => e.formats?.includes('suhandinata') && isHeld(e, year))) {
    const rank = teamStrengths(state, rs, 'suhandinata').findIndex((t) => t.countryId === countryId) + 1;
    const target = rank === 1 ? 5 : rank === 2 ? 4 : rank >= 3 && rank <= 4 ? 3 : rank >= 5 && rank <= 8 ? 2 : 0;
    if (target) out.push({ kind: 'team', format: 'suhandinata', target });
  }
  return out;
}
```

### Task 2: Pratama siap ke grade 3 senior (`src/engine/season.ts` `chooseEntries`, tes `src/engine/promotion.test.ts`)
- [ ] Tes: musim INA dimainkan beberapa minggu dengan satu Pratama ber-`readySince` & kemampuan tinggi → pernah masuk entry IC/IS/FS, tidak pernah ke World Tour; Pratama tanpa `readySince` tidak pernah masuk turnamen senior.
- [ ] Implementasi: `readyPratama` = Pratama negara manajer dengan `readySince`; Pratama siap tidak di-skip, tetapi `options` dibatasi ke `['IC', 'IS', 'FS']` bila bukan keputusan manual.

### Task 3: Chip Junior & kuota (`src/ui/Career.tsx`, `src/engine/presets/bwf2026.ts`, i18n/CSS, `docs/ASUMSI.md`, `docs/RENCANA.md`)
- [ ] Helper `juniorEvent(id)` (tier `junior` atau event beregu berformat junior) → chip `t('juniorShort')` di judul event kartu Hasil turnamen (individu & beregu) dan baris Turnamen mendatang.
- [ ] Preset: `WJC` quota `{ singles: 4, doubles: 3 }`, `JC2` `{ singles: 4, doubles: 2 }`; jalankan tes kalibrasi junior (populasi & bagan penuh).
- [ ] ASUMSI (kuota & target junior), RENCANA centang bagian 4; tes, build, uji browser, commit.
