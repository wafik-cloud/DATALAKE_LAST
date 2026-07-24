import { describe, expect, it } from 'vitest';
import { maskSecret } from './maskSecret';

describe('maskSecret', () => {
  it('masque les secrets longs', () => {
    expect(maskSecret('abcdefghijklmnop')).toBe('abcd••••••••');
  });

  it('retourne des points pour valeur vide', () => {
    expect(maskSecret('')).toBe('••••••••');
  });
});
