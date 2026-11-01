// Fails (after the snapshot has been saved) when a source has not been fetched for a while,
// so a broken collector shows up as a red scheduled run instead of a silent ::warning::.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MAX_STALE_HOURS = 48;
/** @param {{sources: Record<string, {status: string, lastSuccess?: string, reason?: string}>}} snapshot */
export function staleSources(snapshot, now = Date.now(), maxHours = MAX_STALE_HOURS) {
  return Object.entries(snapshot.sources)
    .filter(([, s]) => s.status !== 'ok')
    .map(([name, s]) => ({ name, hours: (now - Date.parse(s.lastSuccess ?? 0)) / 3_600_000 }))
    .filter((s) => !(s.hours <= maxHours));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const snapshot = JSON.parse(await readFile(new URL('../src/data/generated.json', import.meta.url), 'utf8'));
  const stale = staleSources(snapshot);
  for (const s of stale)
    console.error(
      `::error::${s.name} has not been fetched for ${Number.isFinite(s.hours) ? Math.round(s.hours) + ' hours' : 'ever'}; the site shows its last successful data`,
    );
  if (stale.length) process.exit(1);
  console.log('All sources fetched within the last ' + MAX_STALE_HOURS + ' hours');
}
