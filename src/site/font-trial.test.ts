import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { FONT_SETS, LATIN_RANGE, alias, faceRules, roleProperties, trialFrom } from './font-trial.ts';
import { stylesheetKey, stylesheetKeys } from './font-trial-panel.ts';

const sheet = `/* x-[0]-500-normal */
@font-face {
  font-family: 'Zen Kaku Gothic New';
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url(/assets/a.woff2) format('woff2');
  unicode-range: U+3000-30ff;
}
@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:500;src:url(/assets/b.woff2) format("woff2")}`;

describe('書体のお試し', () => {
  test('候補は6〜8通りで、いまの組から始まり、どれも URL に書ける別々の名前を持つ', () => {
    const ids = FONT_SETS.map((s) => s.id);
    assert.ok(FONT_SETS.length >= 6 && FONT_SETS.length <= 8);
    assert.equal(ids[0], 'current');
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(
      ids.filter((id) => !/^[a-z]+(?:-[a-z]+)*$/.test(id)),
      [],
    );
  });

  test('?font= で選んだ組を使い、次のページでも続け、off で忘れる。知らない名前はパネルだけ開く', () => {
    assert.deepEqual(trialFrom(null, null), { id: 'current', set: undefined, panel: false, forget: false });
    assert.equal(trialFrom('mincho', null).set?.id, 'mincho');
    assert.equal(trialFrom('mincho', null).panel, true);
    assert.equal(trialFrom(null, 'klee').set?.id, 'klee');
    assert.equal(trialFrom('mincho', 'klee').id, 'mincho');
    assert.deepEqual(trialFrom('current', 'klee'), {
      id: 'current',
      set: undefined,
      panel: true,
      forget: false,
    });
    assert.deepEqual(trialFrom('nope', 'klee').id, 'klee');
    assert.deepEqual(trialFrom('', null), { id: 'current', set: undefined, panel: true, forget: false });
    assert.equal(trialFrom('off', 'klee').forget, true);
    assert.equal(trialFrom('off', 'klee').set, undefined);
  });

  test('書体は役の名前と太さで登録し直し、欧文の書体は欧文の範囲だけを、決めた大きさで受け持つ', () => {
    const rules = faceRules(sheet, alias('round', 0), 700, { sizeAdjust: 94, latin: true });
    const faces = rules.split('\n');
    assert.equal(faces.length, 2);
    for (const face of faces) {
      assert.match(face, /font-family:'cp20 trial round 0';font-weight:700;/);
      assert.equal(face.match(/font-family/g)?.length, 1);
      assert.equal(face.match(/font-weight/g)?.length, 1);
      assert.match(face, /size-adjust:94%;/);
      assert.ok(face.endsWith(`unicode-range:${LATIN_RANGE}}`), face);
    }
    const japanese = faceRules(sheet, alias('hand', 1), 400).split('\n')[0];
    assert.match(japanese, /;unicode-range: U\+3000-30ff}$/);
    assert.match(japanese, /;src: url\(\/assets\/a\.woff2\) format\('woff2'\);/);
    assert.doesNotMatch(japanese, /size-adjust/);
  });

  test('役ごとに、組の書体を前から順に並べ、残した役はサイトの書体を使う', () => {
    const mincho = roleProperties(FONT_SETS.find((s) => s.id === 'mincho')!);
    assert.match(mincho['--round'], /^'cp20 trial round 0', 'cp20 trial round 1', /);
    assert.match(mincho['--hand'], /^'cp20 trial hand 0', 'cp20 trial hand 1', 'cp20 trial round 0'/);
    assert.match(mincho['--mono']!, /^'cp20 trial mono 0', 'cp20 Mono'/);
    const yusei = roleProperties(FONT_SETS.find((s) => s.id === 'yusei-kaku')!);
    assert.match(yusei['--hand'], /^'Yusei Magic', 'cp20 trial round 0'/);
    assert.equal(yusei['--mono'], undefined);
  });

  test('どの組の書体にも読み込むスタイルシートがあり、使わないものは置かない', () => {
    const used = new Set(
      FONT_SETS.flatMap((set) => [...(set.hand ?? []), ...(set.round ?? []), ...(set.mono ?? [])]).map(
        stylesheetKey,
      ),
    );
    assert.deepEqual(
      [...used].filter((key) => !stylesheetKeys.includes(key)),
      [],
    );
    assert.deepEqual(
      stylesheetKeys.filter((key) => !used.has(key)),
      [],
    );
  });
});
