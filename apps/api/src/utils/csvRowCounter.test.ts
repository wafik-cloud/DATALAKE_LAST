import { describe, expect, it } from 'vitest';
import { Readable } from 'stream';
import { countCsvRows } from './csvRowCounter';

describe('CSV record counts', () => {
  it('handles quoted newlines and escaped quotes across chunks', async () => {
    const result = await countCsvRows(Readable.from(['id,name\r\n1,"first\nsecond"\r\n2,"a"', '"b"\r\n3,last']));
    expect(result.rowCount).toBe(3);
  });
  it('excludes the header and blank lines, preserving a zero-row export', async () => {
    expect((await countCsvRows(Readable.from(['id,name\n\n\r\n']))).rowCount).toBe(0);
  });
  it('rejects a truncated quoted record instead of certifying an incomplete count', async () => {
    await expect(countCsvRows(Readable.from(['id,name\n1,"unterminated']))).rejects.toThrow('CSV incomplet');
  });
});
