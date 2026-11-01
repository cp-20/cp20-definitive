import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectStamps } from '../src/data/stamp-optimistic.mjs';
const stamp = (id, owner = 'me', createdAt = 1) => ({
  id,
  owner,
  slot: id,
  anchor: 'intro',
  x: 0.2,
  y: 0.3,
  kind: 0,
  angle: createdAt,
  createdAt,
});
test('optimistic placement, stream acknowledgement, undo and rollback preserve other visitors', () => {
  const other = stamp('other', 'someone');
  const local = stamp('pending', 'local', 9);
  const op = { type: 'add', stamp: local };
  const original = [other, stamp('old')];
  assert.deepEqual(
    projectStamps(original, [op], 'me').map((s) => s.id),
    ['other', 'old', 'pending'],
  );
  const server = { ...local, id: 'me-1', owner: 'me', slot: '1', createdAt: 100 };
  assert.deepEqual(
    projectStamps([...original, server], [op], 'me').map((s) => s.id),
    ['other', 'old', 'pending'],
  );
  assert.deepEqual(projectStamps(original, [op, { type: 'remove', target: local }], 'me'), original);
  assert.deepEqual(projectStamps(original, [], 'me'), original);
  assert.equal(original.length, 2);
});
test('rapid pending operations roll the oldest of five own stamps and can be undone before saving', () => {
  const remote = [
    ...Array.from({ length: 5 }, (_, i) => stamp(String(i), 'me', i)),
    stamp('other', 'visitor'),
  ];
  const a = stamp('a', 'local', 10),
    b = stamp('b', 'local', 11);
  const result = projectStamps(
    remote,
    [
      { type: 'add', stamp: a },
      { type: 'add', stamp: b },
      { type: 'remove', target: b },
    ],
    'me',
  );
  assert.deepEqual(
    result.map((s) => s.id),
    ['2', '3', '4', 'other', 'a'],
  );
  assert.equal(remote.length, 6);
});
test('moving one of five own stamps keeps the other four, including the oldest', () => {
  const remote = [
    ...Array.from({ length: 5 }, (_, i) => ({ ...stamp(`me-${i}`, 'me', i), slot: String(i) })),
    stamp('other', 'visitor'),
  ];
  const target = remote[3];
  const moved = { ...stamp('local-move', 'local', target.createdAt), x: 0.57, y: 0.01, angle: 3 };
  const result = projectStamps(remote, [{ type: 'move', target, stamp: moved }], 'me');
  assert.deepEqual(result.map((s) => s.id).sort(), ['local-move', 'me-0', 'me-1', 'me-2', 'me-4', 'other']);
  assert.equal(result.find((s) => s.id === 'local-move').createdAt, 3);
  // The stream echoes the moved sticker in its own slot before the response: still one copy.
  const echoed = remote.map((s) => (s.id === 'me-3' ? { ...s, x: 0.57, y: 0.01, angle: 3 } : s));
  assert.equal(projectStamps(echoed, [{ type: 'move', target, stamp: moved }], 'me').length, 6);
  // Moving a sticker another tab already peeled places it as a new one.
  const gone = remote.filter((s) => s.id !== 'me-3');
  assert.deepEqual(
    projectStamps(gone, [{ type: 'move', target, stamp: moved }], 'me')
      .map((s) => s.id)
      .sort(),
    ['local-move', 'me-0', 'me-1', 'me-2', 'me-4', 'other'],
  );
});
