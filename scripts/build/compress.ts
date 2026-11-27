// Brotli copies of the built pages and text files, served by the Worker (worker/index.ts
// serveAsset) to clients that take Brotli. Quality 11 with a large window: written once per build,
// read by every visitor.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { COMPRESSED_TYPES } from '../../worker/index.ts';

const compress = promisify(brotliCompress);
// Smaller than this, a file fits in one packet anyway.
const MIN_BYTES = 1024;

export const brotli = (bytes: Buffer) =>
  compress(bytes, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_LGWIN]: 24,
      [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
    },
  });

/**
 * Writes `<file>.br` beside every compressible file under `root` (the extensions the Worker
 * serves copies for) that is at least MIN_BYTES; a page's copy is always written, as the Worker
 * asks for it. @returns the bytes before and after
 */
export async function compressSite(root: string) {
  const extensions = new RegExp(`\\.(${Object.keys(COMPRESSED_TYPES).join('|')})$`);
  let before = 0,
    after = 0;
  const files = (await readdir(root, { recursive: true })).filter((f) => extensions.test(f));
  await Promise.all(
    files.map(async (name) => {
      const file = join(root, name);
      const bytes = await readFile(file);
      if (bytes.length < MIN_BYTES && !name.endsWith('.html')) return;
      const packed = await brotli(bytes);
      before += bytes.length;
      after += packed.length;
      await writeFile(file + '.br', packed);
    }),
  );
  return { files: files.length, before, after };
}
