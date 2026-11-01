// For the tests of the collectors that write files: a copy of the repository's code (scripts and
// src, none of the data) in a temporary directory, with the data files and media a test gives it,
// so the code under test never touches src/data or public/media.
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));

export async function sandbox(data: Record<string, unknown>, media: Record<string, Buffer> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'cp20-sync-'));
  const code = (path: string) => !path.endsWith('.json');
  await cp(join(root, 'scripts'), join(dir, 'scripts'), { recursive: true, filter: code });
  await cp(join(root, 'src'), join(dir, 'src'), { recursive: true, filter: code });
  await mkdir(join(dir, 'src/data'), { recursive: true });
  await mkdir(join(dir, 'public/media'), { recursive: true });
  await symlink(join(root, 'node_modules'), join(dir, 'node_modules'));
  for (const [name, value] of Object.entries({ works: [], ...data }))
    await writeFile(join(dir, 'src/data', `${name}.json`), JSON.stringify(value));
  for (const [name, bytes] of Object.entries(media)) await writeFile(join(dir, 'public/media', name), bytes);
  return {
    dir,
    load: (name: string) => readFile(join(dir, 'src/data', `${name}.json`), 'utf8').then(JSON.parse),
    exists: (path: string) =>
      access(join(dir, path))
        .then(() => true)
        .catch(() => false),
    /** Imports the sandbox's copy of a module under scripts/sync. */
    importModule: <T>(name: string): Promise<T> =>
      import(pathToFileURL(join(dir, 'scripts/sync', name)).href),
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
