import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { OG_SIZE, ogImage } from './og.ts';
import { OG_IMAGE } from '../../src/site/route.ts';

describe('共有したリンクの画像', () => {
  test('ページが告げる大きさの PNG を、ビルドのたびに描く', async () => {
    const { format, width, height } = await sharp(await ogImage()).metadata();
    assert.equal(format, 'png');
    assert.deepEqual({ width, height }, OG_SIZE);
    assert.deepEqual({ width: OG_IMAGE.width, height: OG_IMAGE.height }, OG_SIZE);
  });
});
