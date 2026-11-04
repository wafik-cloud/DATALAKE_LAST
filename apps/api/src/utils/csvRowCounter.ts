import { createHash } from 'crypto';

/** Count records rather than physical lines, including quoted multiline fields. */
export async function countCsvRows(stream: AsyncIterable<Buffer | string>) {
  let quoted = false;
  let content = false;
  let records = 0;
  let bytes = 0;
  const hash = createHash('sha256');
  for await (const value of stream) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    hash.update(chunk);
    bytes += chunk.length;
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];
      if (byte === 34) { quoted = !quoted; content = true; }
      else if (byte === 10 && !quoted) {
        if (content) records++;
        content = false;
      } else if (byte !== 13 && byte !== 10 && byte !== 32 && byte !== 9) content = true;
    }
  }
  if (quoted) throw new Error('CSV incomplet : champ entre guillemets non terminé');
  if (content) records++;
  return { rowCount: Math.max(0, records - 1), bytes, checksumSha256: hash.digest('hex') };
}
