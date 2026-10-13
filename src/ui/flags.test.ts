import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WORLD } from '../engine/presets/world';
import { flagCode } from './Flag';

describe('bendera', () => {
  it('tiap negara game punya file bendera', () => {
    const missing = WORLD.countries.filter((c) => !existsSync(`src/assets/flags/${c.id}.svg`)).map((c) => c.id);
    expect(missing).toEqual([]);
  });
  it('kode negara dari id negara, atlet & pasangan', () => {
    expect(flagCode('INA')).toBe('INA');
    expect(flagCode('JPN-r-12345')).toBe('JPN');
    expect(flagCode('DEN-MD2026-1')).toBe('DEN');
    expect(flagCode('XXX-M1')).toBeUndefined();
  });
});
