// Optimistic updates: what is drawn while your changes wait, and how they are saved one at a time.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createPendingSaves, projectStamps, serialWrites } from '../src/data/stamp-optimistic.mjs';

const stamp = (id, owner = 'me', fields = {}) => ({
  id,
  owner,
  slot: owner === 'local' ? '' : id.split('-').at(-1),
  anchor: 'intro',
  x: 0.2,
  y: 0.3,
  kind: 0,
  angle: 0,
  createdAt: 1,
  ...fields,
});
const ids = (stamps) => stamps.map((s) => s.id).sort();
const add = (s, id = `add-${s.id}`) => ({ id, path: '/', uid: 'me', type: 'add', stamp: s });
const move = (target, s, id = `move-${s.id}`) => ({
  id,
  path: '/',
  uid: 'me',
  type: 'move',
  target,
  stamp: s,
});
const remove = (target, id = `remove-${target.id}`) => ({ id, path: '/', uid: 'me', type: 'remove', target });
// Your five saved stickers (me-0 the oldest) and someone else's.
const fivePlusOther = () => [
  ...[0, 1, 2, 3, 4].map((i) => stamp(`me-${i}`, 'me', { x: i / 10, createdAt: i })),
  stamp('other-0', 'someone'),
];

describe('projectStamps', () => {
  test('保存待ちの追加は、すぐに描かれる', () => {
    const local = stamp('l1', 'local', { x: 0.9, createdAt: 9 });
    assert.deepEqual(ids(projectStamps([stamp('other-0', 'someone')], [add(local)], 'me')), [
      'l1',
      'other-0',
    ]);
  });

  test('保存待ちの操作がなければ、届いたままを描く', () => {
    const remote = fivePlusOther();
    assert.deepEqual(projectStamps(remote, [], 'me'), remote);
  });

  test('保存待ちの削除は、そのシールを消す', () => {
    const remote = fivePlusOther();
    assert.deepEqual(ids(projectStamps(remote, [remove(remote[2])], 'me')), [
      'me-0',
      'me-1',
      'me-3',
      'me-4',
      'other-0',
    ]);
  });

  test('6枚目を貼ると、自分の一番古いシールが押し出される（ほかの人のは残る）', () => {
    const local = stamp('l1', 'local', { x: 0.9, createdAt: 9 });
    assert.deepEqual(ids(projectStamps(fivePlusOther(), [add(local)], 'me')), [
      'l1',
      'me-1',
      'me-2',
      'me-3',
      'me-4',
      'other-0',
    ]);
  });

  test('貼ってすぐはがしたシールは、押し出したシールを戻さない', () => {
    const a = stamp('a', 'local', { x: 0.8, createdAt: 10 });
    const b = stamp('b', 'local', { x: 0.9, createdAt: 11 });
    const result = projectStamps(fivePlusOther(), [add(a), add(b), remove(b)], 'me');
    assert.deepEqual(ids(result), ['a', 'me-2', 'me-3', 'me-4', 'other-0']);
  });

  test('動かしたシールは元の位置から消え、新しい位置に元の作成時刻で描かれる', () => {
    const remote = fivePlusOther();
    const moved = stamp('l1', 'local', { x: 0.57, createdAt: 99 });
    const result = projectStamps(remote, [move(remote[3], moved)], 'me');
    assert.deepEqual(ids(result), ['l1', 'me-0', 'me-1', 'me-2', 'me-4', 'other-0']);
    assert.equal(result.find((s) => s.id === 'l1').createdAt, 3);
  });

  test('保存の返事より先にストリームで届いた同じシールは、1枚だけ描く', () => {
    const local = stamp('l1', 'local', { x: 0.9 });
    const echoed = stamp('me-0', 'me', { x: 0.9, createdAt: 100 });
    assert.deepEqual(ids(projectStamps([echoed], [add(local)], 'me')), ['l1']);
  });

  test('ほかのタブではがされていたシールを動かすと、新しいシールとして描く', () => {
    const remote = fivePlusOther();
    const gone = remote.filter((s) => s.id !== 'me-3');
    const moved = stamp('l1', 'local', { x: 0.57, createdAt: 3 });
    assert.deepEqual(ids(projectStamps(gone, [move(remote[3], moved)], 'me')), [
      'l1',
      'me-0',
      'me-1',
      'me-2',
      'me-4',
      'other-0',
    ]);
  });

  test('届いたシールの配列を書き換えない', () => {
    const remote = fivePlusOther();
    projectStamps(remote, [remove(remote[0])], 'me');
    assert.equal(remote.length, 6);
  });
});

// A promise and the functions that settle it, so a test decides when a save finishes.
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('serialWrites', () => {
  test('書き込みを1つずつ、前の書き込みが終わってから始める', async () => {
    const write = serialWrites(async () => {});
    const first = deferred();
    const started = [];
    write(() => (started.push('first'), first.promise));
    write(async () => started.push('second'));
    await flush();
    assert.deepEqual(started, ['first']);
    first.resolve();
    await flush();
    assert.deepEqual(started, ['first', 'second']);
  });

  test('次の書き込みは、前の書き込みの完了から指定の間隔だけ待ってから始める', async () => {
    const pause = deferred();
    const waits = [];
    const write = serialWrites((ms) => (waits.push(ms), pause.promise), 1100);
    let second = false;
    await write(async () => {});
    write(async () => (second = true));
    await flush();
    assert.deepEqual([waits, second], [[1100], false]);
    pause.resolve();
    await flush();
    assert.equal(second, true);
  });

  test('失敗した書き込みのあとも、続く書き込みを送る', async () => {
    const write = serialWrites(async () => {});
    await assert.rejects(write(() => Promise.reject(Error('denied'))));
    assert.equal(await write(async () => 'next'), 'next');
  });
});

// A pending-save list whose requests the test answers by hand.
function pendingSaves() {
  const calls = [];
  const replies = [];
  const answer = (name) => (op, target) => {
    calls.push([name, op.id, target?.id]);
    const reply = deferred();
    replies.push(reply);
    return reply.promise;
  };
  const shown = { pending: [] };
  const saves = createPendingSaves({
    send: { place: answer('place'), move: answer('move'), remove: answer('remove') },
    wait: async () => {},
    changed: (pending) => (shown.pending = pending),
  });
  // Lets the next queued request start, then answers it.
  const reply = async (fn) => {
    await flush();
    fn(replies.shift());
    await flush();
  };
  return { saves, calls, shown, reply };
}
const saved = (placed) => ({ owner: 'me', stamps: [placed], placed });

describe('createPendingSaves', () => {
  test('追加した操作は、保存を待たずに保存待ちの一覧に入る', () => {
    const { saves, shown } = pendingSaves();
    const op = add(stamp('l1', 'local'));
    saves.add(op).catch(() => {});
    assert.deepEqual(shown.pending, [op]);
  });

  test('保存できた操作は一覧から外れ、保存されたレコードで解決する', async () => {
    const { saves, shown, reply } = pendingSaves();
    const result = saves.add(add(stamp('l1', 'local')));
    const record = saved(stamp('me-0'));
    await reply((r) => r.resolve(record));
    assert.deepEqual(shown.pending, []);
    assert.equal(await result, record);
  });

  test('保存できなかった操作は一覧から外れ（＝画面が元に戻り）、失敗で終わる', async () => {
    const { saves, shown, reply } = pendingSaves();
    const outcome = saves.add(add(stamp('l1', 'local'))).then(
      () => 'saved',
      (error) => error.message,
    );
    await reply((r) => r.reject(Error('HTTP 503')));
    assert.deepEqual(shown.pending, []);
    assert.equal(await outcome, 'HTTP 503');
  });

  test('失敗した操作は再送しない', async () => {
    const { saves, calls, reply } = pendingSaves();
    saves.add(add(stamp('l1', 'local'))).catch(() => {});
    await reply((r) => r.reject(Error('offline')));
    await flush();
    assert.equal(calls.length, 1);
  });

  test('操作は追加した順に、1つずつ送る', async () => {
    const { saves, calls, reply } = pendingSaves();
    saves.add(add(stamp('a', 'local')));
    saves.add(add(stamp('b', 'local')));
    await flush();
    assert.deepEqual(
      calls.map((c) => c[1]),
      ['add-a'],
    );
    await reply((r) => r.resolve(saved(stamp('me-0'))));
    assert.deepEqual(
      calls.map((c) => c[1]),
      ['add-a', 'add-b'],
    );
  });

  test('保存済みのシールを動かす操作は move として送る', async () => {
    const { saves, calls } = pendingSaves();
    const target = stamp('me-2');
    saves.add(move(target, stamp('l1', 'local')));
    await flush();
    assert.deepEqual(calls, [['move', 'move-l1', 'me-2']]);
  });

  test('保存前のシールをはがす操作は、リクエストなしで終わる', async () => {
    const { saves, calls, shown } = pendingSaves();
    const result = await saves.add(remove(stamp('l1', 'local')));
    assert.deepEqual([result, calls, shown.pending], [null, [], []]);
  });

  test('貼ったシールが保存されると、続く操作はその保存済みのシールに対して送る', async () => {
    const { saves, calls, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local));
    saves.add(remove(local));
    await reply((r) => r.resolve(saved(stamp('me-3'))));
    await flush();
    assert.deepEqual(calls.at(-1), ['remove', 'remove-l1', 'me-3']);
  });

  test('貼ったシールが保存されると、保存待ちの操作の対象も保存済みのシールになる', async () => {
    const { saves, shown, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local));
    saves.add(remove(local));
    await reply((r) => r.resolve(saved(stamp('me-3'))));
    assert.equal(shown.pending[0].target.id, 'me-3');
  });

  test('貼るのに失敗したシールを動かすと、新しく貼り直す', async () => {
    const { saves, calls, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local)).catch(() => {});
    saves.add(move(local, stamp('l2', 'local')));
    await reply((r) => r.reject(Error('offline')));
    await flush();
    assert.deepEqual(calls.at(-1), ['place', 'move-l2', undefined]);
  });

  test('動かすのに失敗したシールへの続く操作は、動かす前の保存済みのシールに対して送る', async () => {
    const { saves, calls, reply } = pendingSaves();
    const original = stamp('me-1');
    const moved = stamp('l1', 'local');
    saves.add(move(original, moved)).catch(() => {});
    saves.add(remove(moved));
    await reply((r) => r.reject(Error('offline')));
    await flush();
    assert.deepEqual(calls.at(-1), ['remove', 'remove-l1', 'me-1']);
  });
});
