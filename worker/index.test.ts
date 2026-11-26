// What the Worker does with the paths the 2026 edition used to answer on cp20.dev.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import worker, { route } from './index.ts';

const curl = { 'user-agent': 'curl/8.5.0', accept: '*/*' };
const browser = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130',
  accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
};
const at = (path: string, headers: Record<string, string> = browser, method = 'GET') =>
  route(new Request('https://cp20.dev' + path, { headers, method }));

describe('route', () => {
  for (const path of ['/', '/articles', '/works', '/works/isuc', '/featured-tracks'])
    test(`curl で開いた ${path} は 2026 版が答える`, () => {
      assert.deepEqual(at(path, curl), { to: 'legacy', url: 'https://2026.cp20.dev' + path });
    });

  test('?raw=true はどの道具からでも 2026 版の JSON で、クエリはそのまま渡す', () => {
    assert.deepEqual(at('/featured-series?raw=true&no-image=true', { 'user-agent': 'node' }), {
      to: 'legacy',
      url: 'https://2026.cp20.dev/featured-series?raw=true&no-image=true',
    });
  });

  test('ブラウザで開いたページは新しいサイト', () => {
    for (const path of ['/', '/articles', '/works', '/works/isuc'])
      assert.deepEqual(at(path), { to: 'assets' });
  });

  test('クローラーや OGP の取得は新しいサイト', () => {
    assert.deepEqual(at('/', { 'user-agent': 'Twitterbot/1.0', accept: '*/*' }), { to: 'assets' });
    assert.deepEqual(at('/', { 'user-agent': 'node', accept: '*/*' }), { to: 'assets' });
  });

  test('HTML を求める curl は新しいサイト', () => {
    assert.deepEqual(at('/', { 'user-agent': 'curl/8.5.0', accept: 'text/html' }), { to: 'assets' });
  });

  test('ブラウザで開いた好きな曲・漫画の一覧は、プロフィールのその欄へ移す', () => {
    assert.deepEqual(at('/featured-tracks'), { to: 'redirect', url: 'https://cp20.dev/about#music' });
    assert.deepEqual(at('/featured-series'), { to: 'redirect', url: 'https://cp20.dev/about#manga' });
  });

  test('ほかのパスと GET 以外は、curl からでも新しいサイト', () => {
    assert.deepEqual(at('/about', curl), { to: 'assets' });
    assert.deepEqual(at('/works/isuc/x', curl), { to: 'assets' });
    assert.deepEqual(at('/', curl, 'POST'), { to: 'assets' });
  });
});

test('2026 版へは元のリクエストのヘッダーのまま渡し、それ以外は静的ファイル', async () => {
  const seen: string[] = [];
  const fetcher = (name: string) => ({
    fetch: async (r: Request) => (
      seen.push(`${name} ${r.url} ${r.headers.get('user-agent')}`),
      new Response(name)
    ),
  });
  const env = { ASSETS: fetcher('assets'), LEGACY: fetcher('legacy') };
  await worker.fetch(new Request('https://cp20.dev/works?raw=true', { headers: curl }), env);
  await worker.fetch(new Request('https://cp20.dev/works', { headers: browser }), env);
  const moved = await worker.fetch(
    new Request('https://cp20.dev/featured-series', { headers: browser }),
    env,
  );
  assert.deepEqual(seen, [
    'legacy https://2026.cp20.dev/works?raw=true curl/8.5.0',
    `assets https://cp20.dev/works ${browser['user-agent']}`,
  ]);
  assert.deepEqual([moved.status, moved.headers.get('location')], [301, 'https://cp20.dev/about#manga']);
});
