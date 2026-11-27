// Publishes the built site (dist/client) on LOLIPOP! Deploy Now, project `cp20` (framework
// `static`), which serves cp20.dev while the site is away from Cloudflare. Run after
// `npm run build`; the `lolipop` CLI must be logged in.
// The CLI leaves out files Git ignores, so the upload is copied to a directory outside the
// repository first. The Cloudflare-only _headers file is left out. Deploy Now has the browser keep
// a page for a day (max-age=86400), so a page from an earlier deploy can still ask for that
// deploy's scripts: every /assets file ever deployed is kept (node_modules/.cache/cp20) and
// uploaded again with the new ones.
import { cp, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export const LOLIPOP_PROJECT = '01M8E1135X6JQV83PQ395NTSN7';
const site = 'dist/client';
const history = 'node_modules/.cache/cp20/deployed-assets';

const upload = await mkdtemp(join(tmpdir(), 'cp20-lolipop-'));
try {
  await mkdir(history, { recursive: true });
  await cp(join(site, 'assets'), history, { recursive: true });
  await cp(site, upload, { recursive: true, filter: (from) => !from.endsWith('/_headers') });
  await cp(history, join(upload, 'assets'), { recursive: true, force: false });
  console.log(`Uploading ${site} (+${(await readdir(history)).length} kept assets) to Deploy Now`);
  const result = spawnSync('npx', ['--yes', 'lolipop', 'deploy', '--project', LOLIPOP_PROJECT], {
    cwd: upload,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(upload, { recursive: true, force: true });
}
