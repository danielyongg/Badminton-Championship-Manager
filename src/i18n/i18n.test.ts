import { afterEach, describe, expect, it } from 'vitest';
import { formPair } from '../engine/career';
import { makeRng } from '../engine/rng';
import { en } from './en';
import { setLang, t, type TextKey } from './index';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('kamus bahasa', () => {
  afterEach(() => setLang('id'));

  it('tiap teks Inggris terisi & memakai parameter yang sama dengan versi Indonesia', () => {
    setLang('id');
    for (const key of Object.keys(en) as TextKey[]) {
      expect(en[key].trim(), key).not.toBe('');
      expect(params(en[key]), key).toEqual(params(t(key)));
    }
  });

  it('parameter diganti; pesan engine ikut bahasa terpilih', () => {
    expect(t('err_max', { max: 2 })).toBe('Satu atlet maksimal 2 partai.');
    setLang('en');
    expect(t('err_max', { max: 2 })).toBe('A player may play at most 2 matches.');
    expect(formPair({ players: [], pairs: [], date: { year: 2026, week: 1 } }, 'MD', 'a', 'b', makeRng(1))).toBe('Choose two different players.');
  });
});
