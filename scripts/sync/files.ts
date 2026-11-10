// Where the collectors read and write: the JSON files under src/data and the files served from
// public. Every collector takes them as `dirs`, so a test can point it at a temporary directory.
import { access, readFile, rename, writeFile } from 'node:fs/promises';

export type Dirs = { data: URL; public: URL };
export const repoDirs: Dirs = {
  data: new URL('../../src/data/', import.meta.url),
  public: new URL('../../public/', import.meta.url),
};

/** A successful fetch is trusted for this long before it is fetched again. */
export const REFRESH_MS = 7 * 86_400_000;

export const dataFile = (dirs: Dirs, name: string) => new URL(`${name}.json`, dirs.data);
/** A served file by its public path (`/media/a.png`). */
export const publicFile = (dirs: Dirs, path: string) => new URL(path.replace(/^\//, ''), dirs.public);

export const readData = (dirs: Dirs, name: string) => readFile(dataFile(dirs, name), 'utf8').then(JSON.parse);

/** Writes src/data/<name>.json whole or not at all (through a temporary file). */
export async function writeData(dirs: Dirs, name: string, value: unknown) {
  const file = dataFile(dirs, name);
  const temporary = new URL(file.href + '.tmp');
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await rename(temporary, file);
}

export const exists = (url: URL) =>
  access(url).then(
    () => true,
    () => false,
  );

/** Runs `work` on every item, at most `limit` at a time. */
export async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (queue.length) await work(queue.shift()!);
    }),
  );
}
