import assert from 'node:assert/strict';
import { stampEntries } from '../src/data/stamp-record.mjs';
const stamp = { anchor: 'intro', x: 0.5, y: 0.5, kind: 0, angle: 0, createdAt: 1 };
assert.deepEqual(stampEntries(null), []);
assert.deepEqual(stampEntries({ stamps: [null, stamp, null] }), [['1', stamp]]);
assert.deepEqual(stampEntries({ stamps: { 0: null, 4: stamp } }), [['4', stamp]]);
const remaining = Object.fromEntries(stampEntries({ stamps: [null, stamp] }));
delete remaining['1'];
assert.equal(Object.keys(remaining).length, 0, 'removing the last occupied slot must delete the record');
