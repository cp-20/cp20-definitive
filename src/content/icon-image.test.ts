// Which works show their image as an app icon rather than an OG card.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import works from '../data/works.json' with { type: 'json' };
import { isIconImage } from './icon-image.ts';

test('works.json で icon と書いた作品だけがアイコン扱いになる', () => {
  assert.deepEqual(
    works.filter(isIconImage).map((w) => w.id),
    ['foodmoji'],
  );
});
