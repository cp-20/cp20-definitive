// One read-modify-write of your own sticker record through the REST API, against a fake fetch.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVER_TIME, writeBody, writeRecord } from '../src/data/stamp-write.mjs';

// A fake database at https://db.example: answers each request from `answers` by method and path
// (a function gets the parsed body) and records what was asked.
function fakeDatabase(answers) {
  const requests = [];
  const fetch = async (url, init = {}) => {
    const { pathname, searchParams } = new URL(url);
    const method = init.method || 'GET';
    const path = pathname.replace(/^\/|\.json$/g, '');
    const body = init.body && JSON.parse(init.body);
    requests.push({ method, path, auth: searchParams.get('auth'), body });
    const answer = answers[`${method} ${path}`.trim()];
    const value = typeof answer === 'function' ? answer(body) : answer;
    return value instanceof Response ? value : Response.json(value ?? null);
  };
  return { fetch, requests };
}
const where = (fetch) => ({
  fetch,
  databaseURL: 'https://db.example',
  token: 'id-token',
  page: 'home',
  uid: 'alice',
});

describe('writeBody', () => {
  test('レコードとスロットルを1回の更新で書き、prev に読んだ時刻を入れる', () => {
    assert.deepEqual(writeBody('home', 'alice', { stamps: {} }, { at: 1234, prev: 1000 }), {
      'pages/home/alice': { stamps: {} },
      'throttle/alice': { at: SERVER_TIME, prev: 1234 },
    });
  });

  for (const throttle of [null, undefined, {}, { at: '5' }, { at: Infinity }])
    test(`読めないスロットル（${JSON.stringify(throttle)}）は「書き込みなし」の 0 とする`, () => {
      assert.equal(writeBody('home', 'alice', null, throttle)['throttle/alice'].prev, 0);
    });

  test('null のレコードはレコードの削除になる', () => {
    assert.equal(writeBody('home', 'alice', null, null)['pages/home/alice'], null);
  });
});

describe('writeRecord', () => {
  test('スロットル、レコードの順に読み、更新して、書いたレコードを読み直す', async () => {
    const db = fakeDatabase({ 'GET throttle/alice': { at: 5, prev: 0 }, 'GET pages/home/alice': null });
    await writeRecord(where(db.fetch), () => ({ stamps: { 0: 'new' } }));
    assert.deepEqual(
      db.requests.map((r) => `${r.method} ${r.path}`.trim()),
      ['GET throttle/alice', 'GET pages/home/alice', 'PATCH', 'GET pages/home/alice'],
    );
  });

  test('すべてのリクエストに ID トークンを付ける', async () => {
    const db = fakeDatabase({});
    await writeRecord(where(db.fetch), () => ({ stamps: {} }));
    assert.deepEqual(new Set(db.requests.map((r) => r.auth)), new Set(['id-token']));
  });

  test('update には保存されているレコードを渡す', async () => {
    const stored = { stamps: { 0: 'old' } };
    const db = fakeDatabase({ 'GET pages/home/alice': stored });
    let given;
    await writeRecord(where(db.fetch), (record) => ((given = record), {}));
    assert.deepEqual(given, stored);
  });

  test('update の戻り値を、読んだスロットルの時刻を prev にして書く', async () => {
    const db = fakeDatabase({ 'GET throttle/alice': { at: 5 } });
    await writeRecord(where(db.fetch), () => ({ stamps: { 1: 'new' } }));
    const patch = db.requests.find((r) => r.method === 'PATCH');
    assert.deepEqual(patch.body, writeBody('home', 'alice', { stamps: { 1: 'new' } }, { at: 5 }));
  });

  test('読み直したレコード（サーバー時刻が入ったもの）を返す', async () => {
    let written = null;
    const db = fakeDatabase({
      PATCH: () => (written = { stamps: { 0: 'saved' }, updatedAt: 42 }),
      'GET pages/home/alice': () => written,
    });
    assert.deepEqual(await writeRecord(where(db.fetch), () => ({})), {
      stamps: { 0: 'saved' },
      updatedAt: 42,
    });
  });

  test('update が undefined なら書き込まず、読んだレコードを返す', async () => {
    const db = fakeDatabase({ 'GET pages/home/alice': { stamps: { 0: 'kept' } } });
    const result = await writeRecord(where(db.fetch), () => undefined);
    assert.deepEqual(result, { stamps: { 0: 'kept' } });
    assert.equal(db.requests.filter((r) => r.method === 'PATCH').length, 0);
  });

  test('ルールに拒否された書き込みは再試行せず失敗にする', async () => {
    const db = fakeDatabase({ PATCH: new Response('{"error":"Permission denied"}', { status: 401 }) });
    await assert.rejects(
      writeRecord(where(db.fetch), () => ({})),
      /PATCH \/: HTTP 401/,
    );
    assert.equal(db.requests.filter((r) => r.method === 'PATCH').length, 1);
  });

  test('読み込みに失敗したら書き込まない', async () => {
    const db = fakeDatabase({ 'GET throttle/alice': new Response('busy', { status: 503 }) });
    await assert.rejects(
      writeRecord(where(db.fetch), () => ({})),
      /HTTP 503/,
    );
    assert.equal(db.requests.length, 1);
  });
});
