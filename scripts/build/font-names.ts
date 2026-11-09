// For the tests of the subset fonts: the copyright and license records a WOFF2 file carries.
import assert from 'node:assert/strict';
import { brotliDecompressSync } from 'node:zlib';

// The `name` table of a WOFF2 font: nameID → string (Windows Unicode records first).
export function nameRecords(woff2: Buffer) {
  const view = new DataView(woff2.buffer, woff2.byteOffset, woff2.byteLength);
  assert.equal(view.getUint32(0), 0x774f4632, 'WOFF2 signature');
  const numTables = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = view.getUint8(at++);
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw Error('bad UIntBase128');
  };
  const known = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name'];
  let offset = 0,
    name: { offset: number; length: number } | undefined;
  for (let i = 0; i < numTables; i++) {
    const flags = view.getUint8(at++);
    const index = flags & 0x3f;
    const tag =
      index === 63 ? String.fromCharCode(...woff2.subarray(at, (at += 4))) : (known[index] ?? index);
    let length = base128();
    const version = flags >> 6;
    const transformed = index === 10 || index === 11 ? version === 0 : version !== 0;
    if (transformed) length = base128();
    if (tag === 'name') name = { offset, length };
    offset += length;
  }
  assert.ok(name, 'name table');
  const data = brotliDecompressSync(woff2.subarray(at, at + compressedSize));
  const table = new DataView(data.buffer, data.byteOffset + name!.offset, name!.length);
  const count = table.getUint16(2),
    strings = table.getUint16(4);
  const out = new Map<number, string>();
  for (let i = 0; i < count; i++) {
    const r = 6 + i * 12;
    const [platform, , , id, length, start] = [0, 2, 4, 6, 8, 10].map((o) => table.getUint16(r + o));
    const bytes = data.subarray(name!.offset + strings + start, name!.offset + strings + start + length);
    const text =
      platform === 3 || platform === 0
        ? String.fromCharCode(
            ...Array.from({ length: length / 2 }, (_, k) => (bytes[2 * k] << 8) | bytes[2 * k + 1]),
          )
        : bytes.toString('latin1');
    if (!out.has(id) || platform === 3) out.set(id, text);
  }
  return out;
}

/** Fails unless the records keep the copyright and the SIL Open Font License, as the OFL requires. */
export const assertOflNotice = (names: Map<number, string>) => {
  assert.match(names.get(13) ?? '', /SIL Open Font License, Version 1\.1/);
  assert.match(names.get(14) ?? '', /scripts\.sil\.org\/OFL|openfontlicense\.org/);
  assert.match(names.get(0) ?? '', /Copyright/);
};
