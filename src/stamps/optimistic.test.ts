// Optimistic updates: what is drawn while your changes wait, and how they are saved one at a time.
import { describe, expect, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createPendingSaves, projectStamps, serialWrites } from './optimistic.ts';
import type { Operation, PlacedStamp, SavedRecord } from './types.ts';

const stamp = (id: string, owner = 'me', fields: Partial<PlacedStamp> = {}): PlacedStamp => ({
  id,
  owner,
  slot: owner === 'local' ? '' : id.split('-').at(-1)!,
  anchor: 'intro',
  x: 0.2,
  y: 0.3,
  kind: 0,
  angle: 0,
  createdAt: 1,
  ...fields,
});
const ids = (stamps: PlacedStamp[]) => stamps.map((s) => s.id).sort();
const add = (s: PlacedStamp, id = `add-${s.id}`): Operation => ({
  id,
  path: '/',
  uid: 'me',
  type: 'add',
  stamp: s,
});
const move = (target: PlacedStamp, s: PlacedStamp, id = `move-${s.id}`): Operation => ({
  id,
  path: '/',
  uid: 'me',
  type: 'move',
  target,
  stamp: s,
});
const remove = (target: PlacedStamp, id = `remove-${target.id}`): Operation => ({
  id,
  path: '/',
  uid: 'me',
  type: 'remove',
  target,
});
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

  test('6枚目を貼ると、配列の順ではなく作成時刻が一番古い自分のシールが押し出される', () => {
    const remote = [50, 10, 40, 20, 30].map((createdAt, i) =>
      stamp(`me-${i}`, 'me', { x: i / 10, createdAt }),
    );
    const local = stamp('l1', 'local', { x: 0.9, createdAt: 99 });
    assert.deepEqual(ids(projectStamps(remote, [add(local)], 'me')), ['l1', 'me-0', 'me-2', 'me-3', 'me-4']);
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
    assert.equal(result.find((s) => s.id === 'l1')?.createdAt, 3);
  });

  test('保存の返事より先にストリームで届いた同じシールは、1枚だけ描く', () => {
    const local = stamp('l1', 'local', { x: 0.9 });
    const echoed = stamp('me-0', 'me', { x: 0.9, createdAt: 100 });
    assert.deepEqual(ids(projectStamps([echoed], [add(local)], 'me')), ['l1']);
  });

  test('同じ位置でも絵柄が違う自分の保存済みシールは消さない', () => {
    const local = stamp('l1', 'local', { x: 0.9 });
    const other = stamp('me-0', 'me', { x: 0.9, kind: 1 });
    assert.deepEqual(ids(projectStamps([other], [add(local)], 'me')), ['l1', 'me-0']);
  });

  test('見た目が同じでも、ほかの人のシールは消さない', () => {
    const local = stamp('l1', 'local', { x: 0.9 });
    const theirs = stamp('someone-0', 'someone', { x: 0.9 });
    assert.deepEqual(ids(projectStamps([theirs], [add(local)], 'me')), ['l1', 'someone-0']);
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

// Lets every promise callback that is ready run.
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('serialWrites', () => {
  test('書き込みを1つずつ、前の書き込みが終わってから始める', async () => {
    const write = serialWrites(async () => {});
    const first = Promise.withResolvers<void>();
    const started: string[] = [];
    write(() => (started.push('first'), first.promise));
    write(async () => started.push('second'));
    await flush();
    assert.deepEqual(started, ['first']);
    first.resolve();
    await flush();
    assert.deepEqual(started, ['first', 'second']);
  });

  test('次の書き込みは、前の書き込みの完了から指定の間隔だけ待ってから始める', async () => {
    const pause = Promise.withResolvers<void>();
    const wait = vi.fn((_ms: number) => pause.promise);
    const write = serialWrites(wait, 1100);
    let second = false;
    await write(async () => {});
    write(async () => (second = true));
    await flush();
    expect(wait.mock.calls).toEqual([[1100]]);
    assert.equal(second, false);
    pause.resolve();
    await flush();
    assert.equal(second, true);
  });

  test('失敗した書き込みのあとも、指定の間隔だけ待ってから次を始める', async () => {
    const pause = Promise.withResolvers<void>();
    const wait = vi.fn((_ms: number) => pause.promise);
    const write = serialWrites(wait, 1100);
    let second = false;
    await assert.rejects(write(() => Promise.reject(Error('denied'))));
    write(async () => (second = true));
    await flush();
    expect(wait.mock.calls).toEqual([[1100]]);
    assert.equal(second, false);
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
type Reply = PromiseWithResolvers<SavedRecord | null>;
function pendingSaves() {
  const calls: [string, string | undefined][] = [];
  const replies: Reply[] = [];
  const send = (op: Operation, target?: PlacedStamp) => {
    calls.push([op.id, target?.id]);
    const reply: Reply = Promise.withResolvers();
    replies.push(reply);
    return reply.promise;
  };
  const shown: { pending: readonly Operation[] } = { pending: [] };
  const saves = createPendingSaves({
    send,
    wait: async () => {},
    changed: (pending) => (shown.pending = pending),
  });
  // Lets the next queued request start, then answers it.
  const reply = async (fn: (reply: Reply) => void) => {
    await flush();
    fn(replies.shift()!);
    await flush();
  };
  return { saves, calls, shown, reply };
}
const saved = (placed: PlacedStamp): SavedRecord => ({ owner: 'me', stamps: [placed], placed });

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
      calls.map((c) => c[0]),
      ['add-a'],
    );
    await reply((r) => r.resolve(saved(stamp('me-0'))));
    assert.deepEqual(
      calls.map((c) => c[0]),
      ['add-a', 'add-b'],
    );
  });

  test('保存済みのシールを動かす操作は、そのシールを対象にして送る', async () => {
    const { saves, calls } = pendingSaves();
    saves.add(move(stamp('me-2'), stamp('l1', 'local')));
    await flush();
    assert.deepEqual(calls, [['move-l1', 'me-2']]);
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
    assert.deepEqual(calls.at(-1), ['remove-l1', 'me-3']);
  });

  test('貼ったシールが保存されると、保存待ちの操作の対象も保存済みのシールになる', async () => {
    const { saves, shown, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local));
    saves.add(remove(local));
    await reply((r) => r.resolve(saved(stamp('me-3'))));
    const [next] = shown.pending;
    assert.equal(next.type !== 'add' && next.target.id, 'me-3');
  });

  test('貼るのに失敗したら、そのシールへの保存待ちの操作も一覧から外す', async () => {
    const { saves, shown, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local)).catch(() => {});
    saves.add(move(local, stamp('l2', 'local')));
    await reply((r) => r.reject(Error('offline')));
    assert.deepEqual(shown.pending, []);
  });

  test('貼るのに失敗したシールへの続く操作は、何も送らない', async () => {
    const { saves, calls, reply } = pendingSaves();
    const local = stamp('l1', 'local');
    saves.add(add(local)).catch(() => {});
    const moved = saves.add(move(local, stamp('l2', 'local')));
    await reply((r) => r.reject(Error('offline')));
    assert.deepEqual([await moved, calls.length], [null, 1]);
  });

  test('動かすのに失敗したシールへの続く操作は、動かす前の保存済みのシールに対して送る', async () => {
    const { saves, calls, reply } = pendingSaves();
    const original = stamp('me-1');
    const moved = stamp('l1', 'local');
    saves.add(move(original, moved)).catch(() => {});
    saves.add(remove(moved));
    await reply((r) => r.reject(Error('offline')));
    await flush();
    assert.deepEqual(calls.at(-1), ['remove-l1', 'me-1']);
  });
});
