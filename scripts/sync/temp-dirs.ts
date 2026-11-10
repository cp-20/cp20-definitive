// For the tests of the collectors that write files: a temporary data and public directory that
// holds only the data files and media a test gives it, so the code under test never touches
// src/data or public.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataFile, exists, publicFile, readData, type Dirs } from './files.ts';

export async function tempDirs(data: Record<string, unknown>, media: Record<string, Buffer> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'cp20-sync-'));
  const dirs: Dirs = { data: pathToFileURL(`${root}/data/`), public: pathToFileURL(`${root}/public/`) };
  await mkdir(dirs.data, { recursive: true });
  await mkdir(publicFile(dirs, '/media/'), { recursive: true });
  const write = (name: string, value: unknown) => writeFile(dataFile(dirs, name), JSON.stringify(value));
  for (const [name, value] of Object.entries({ works: [], ...data })) await write(name, value);
  for (const [name, bytes] of Object.entries(media))
    await writeFile(publicFile(dirs, `/media/${name}`), bytes);
  return {
    dirs,
    load: (name: string) => readData(dirs, name),
    write,
    /** Whether a public file (`/media/a.png`) exists. */
    exists: (path: string) => exists(publicFile(dirs, path)),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
