// The response headers Cloudflare serves from public/_headers, and the files a build publishes.
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// public/_headers as { path pattern: { header: value } }.
function parseHeaders(text) {
  const rules = {};
  let current;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) rules[line.trim()] = current = {};
    else {
      const at = line.indexOf(':');
      current[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  return rules;
}
const headers = parseHeaders(readFileSync(new URL('../public/_headers', import.meta.url), 'utf8'));

describe('public/_headers', () => {
  for (const path of ['/assets/*', '/media/*'])
    test(`名前にハッシュのある ${path} は1年間変わらないものとしてキャッシュする`, () => {
      assert.equal(headers[path]['Cache-Control'], 'public, max-age=31536000, immutable');
    });

  for (const path of ['/images/*', '/stamps/*'])
    test(`ハッシュのない ${path} は1日キャッシュし、1週間は裏で取り直す`, () => {
      assert.equal(headers[path]['Cache-Control'], 'public, max-age=86400, stale-while-revalidate=604800');
    });

  test('/404 を直接開いても検索結果に載せない', () => {
    assert.equal(headers['/404']['X-Robots-Tag'], 'noindex');
  });

  test('すべてのページで MIME スニッフィングを止める', () => {
    assert.equal(headers['/*']['X-Content-Type-Options'], 'nosniff');
  });
});

const built = new URL('../dist/client/', import.meta.url);
test.skipIf(!existsSync(new URL('404.html', built)) && 'run `npm run build` first')(
  'ビルド用のマニフェストは公開しない',
  () => {
    assert.equal(existsSync(new URL('.vite', built)), false);
  },
);
