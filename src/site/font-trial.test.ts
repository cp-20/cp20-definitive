import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import {
  FACES,
  LATIN_RANGE,
  PRESETS,
  SCALE,
  TRACKING,
  decodeTrial,
  encodeTrial,
  faceRules,
  findFace,
  findPreset,
  fromPreset,
  isPreset,
  planTrial,
  roleRules,
  stylesheetUrl,
  trialFrom,
  type TrialState,
} from './font-trial.ts';

const sheet = `/* x-[0]-500-normal */
@font-face {
  font-family: 'Zen Kaku Gothic New';
  font-style: normal;
  font-display: swap;
  font-weight: 500;
  src: url(./files/a.woff2) format('woff2'), url(./files/a.woff) format('woff');
  unicode-range: U+3000-30ff;
}
@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:500;src:url(./files/b.woff2) format("woff2")}`;
const base = 'https://cdn.jsdelivr.net/npm/@fontsource/x@1.0.0';
const current = () => fromPreset(PRESETS[0]);
const preset = (id: string) => fromPreset(findPreset(id)!);

describe('書体のお試し', () => {
  test('プリセットは6〜8通りで、いまの組から始まり、どれも URL に書ける別々の名前を持つ', () => {
    const ids = PRESETS.map((p) => p.id);
    assert.ok(PRESETS.length >= 6 && PRESETS.length <= 8);
    assert.equal(ids[0], 'current');
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(
      ids.filter((id) => !/^[a-z]+(?:-[a-z]+)*$/.test(id)),
      [],
    );
  });

  test('どのプリセットも、役に合った種類の書体を、その書体にある太さで使う', () => {
    const wrong = PRESETS.flatMap((p) =>
      (['hand', 'round', 'mono'] as const)
        .filter((key) => {
          const face = findFace(p[key].face);
          return face?.kind !== (key === 'mono' ? 'mono' : 'ja') || !face.weights.includes(p[key].weight);
        })
        .map((key) => `${p.id} ${key}`)
        .concat(
          p.latin.face === 'own' ||
            (findFace(p.latin.face)?.kind === 'latin' &&
              findFace(p.latin.face)!.weights.includes(p.latin.weight))
            ? []
            : [`${p.id} latin`],
        ),
    );
    assert.deepEqual(wrong, []);
  });

  test('いまの組は、サイトの3つの書体をそれぞれの役と太さで使う', () => {
    const { hand, round, mono } = PRESETS[0];
    for (const [setting, family] of [
      [hand, 'Yusei Magic'],
      [round, 'Zen Maru Gothic'],
      [mono, 'cp20 Mono'],
    ] as const) {
      const face = findFace(setting.face)!;
      assert.equal(face.site?.family, family);
      assert.equal(face.site?.weight, setting.weight);
    }
  });

  test('プリセットのままなら名前だけ、調整した役だけを後ろに付けて書き、読み戻すと同じ設定になる', () => {
    assert.equal(encodeTrial(preset('mincho')), 'mincho');
    assert.ok(isPreset(preset('mincho')));
    const tuned: TrialState = {
      ...preset('mincho'),
      hand: { face: 'klee-one', weight: 400, tracking: -10, scale: 108, palt: true },
      latin: { face: 'dm-sans', weight: 600, scale: 95, headings: true },
    };
    const text = encodeTrial(tuned);
    assert.equal(text, 'mincho~h:klee-one:400:-10:108:p~f:dm-sans:600:95:h');
    assert.match(text, /^[a-z0-9~:-]+$/);
    assert.deepEqual(decodeTrial(text), tuned);
    assert.equal(isPreset(tuned), false);
    const code = {
      ...current(),
      mono: { face: 'dm-mono', weight: 300, tracking: 0, scale: 100, palt: false },
    };
    assert.deepEqual(decodeTrial(encodeTrial(code)), code);
  });

  test('読めない部分は捨て、字間と大きさは決めた範囲に収め、プリセットの名前がなければ読まない', () => {
    assert.equal(decodeTrial('nope~h:klee-one:400:0:100'), undefined);
    assert.equal(decodeTrial(null), undefined);
    assert.deepEqual(
      decodeTrial('klee~h:inter:400:0:100~b:klee-one:500:0:100~c:klee-one:400:0:100~f:murecho:400:100:h~x:1'),
      preset('klee'),
    );
    const clamped = decodeTrial('current~h:yusei-magic:400:999:10~f:own:400:999:b')!;
    assert.equal(clamped.hand.tracking, TRACKING.max);
    assert.equal(clamped.hand.scale, SCALE.min);
    assert.equal(clamped.latin.scale, SCALE.max);
    assert.equal(clamped.latin.headings, false);
  });

  test('?font= で選んだ組を使い、次のページでも続け、off で忘れる。知らない名前は残した組かいまの組でパネルだけ開く', () => {
    assert.deepEqual(trialFrom(null, null), { state: current(), panel: false, forget: false });
    assert.equal(trialFrom('mincho', null).state.preset, 'mincho');
    assert.equal(trialFrom('mincho', null).panel, true);
    assert.equal(trialFrom(null, 'klee~b:murecho:300:0:100').state.round.face, 'murecho');
    assert.equal(trialFrom('mincho', 'klee').state.preset, 'mincho');
    assert.equal(trialFrom('nope', 'klee').state.preset, 'klee');
    assert.deepEqual(trialFrom('', null), { state: current(), panel: true, forget: false });
    assert.equal(trialFrom('off', 'klee').forget, true);
    assert.equal(trialFrom('off', 'klee').panel, false);
  });

  test('いまの組のままなら何も読み込まず、役の書体も変えない', () => {
    assert.deepEqual(planTrial(current()), { registrations: [], properties: {} });
    // Spacing alone loads nothing either.
    assert.deepEqual(planTrial({ ...current(), round: { ...current().round, tracking: 20, palt: true } }), {
      registrations: [],
      properties: {},
    });
  });

  test('選んだ書体と太さだけを登録し、役の太さで、大きさを size-adjust に乗せる', () => {
    const plan = planTrial({ ...current(), hand: { ...current().hand, scale: 110 } });
    assert.deepEqual(
      plan.registrations.map((r) => [r.family, r.face.id, r.weight, r.latin, r.sizeAdjust, r.as]),
      [['cp20 trial hand 0', 'yusei-magic', 400, false, 110, 400]],
    );
    assert.equal(plan.properties['--hand'], "'cp20 trial hand 0', var(--round)");
    assert.equal(plan.properties['--round'], undefined);
    const body = planTrial({ ...current(), round: { ...current().round, weight: 500 } });
    assert.deepEqual(
      body.registrations.map((r) => [r.face.id, r.weight, r.as]),
      [['zen-maru-gothic', 500, 700]],
    );
    const code = planTrial({
      ...current(),
      mono: { ...current().mono, face: 'jetbrains-mono', weight: 400 },
    });
    assert.deepEqual(
      code.registrations.map((r) => [r.family, r.face.id, r.weight, r.sizeAdjust, r.as]),
      [['cp20 trial mono 0', 'jetbrains-mono', 400, 96, 600]],
    );
    assert.match(code.properties['--mono'], /^'cp20 trial mono 0', 'cp20 Mono'/);
  });

  test('欧文の書体は文の前に置き、見出しにも使うときは見出しの太さに近いものを使う', () => {
    const mincho = planTrial(preset('mincho'));
    assert.deepEqual(
      mincho.registrations.filter((r) => r.latin).map((r) => [r.family, r.face.id, r.weight, r.sizeAdjust]),
      [
        // Inter in front of the sentences; the headings keep Zen Old Mincho's own, scaled to 95%.
        ['cp20 trial round 0', 'inter', 500, 94],
        ['cp20 trial hand 0', 'zen-old-mincho', 700, 95],
      ],
    );
    assert.match(mincho.properties['--round'], /^'cp20 trial round 0', 'cp20 trial round 1', /);
    assert.match(mincho.properties['--hand'], /^'cp20 trial hand 0', 'cp20 trial hand 1', var\(--round\)$/);
    const both = planTrial({
      ...preset('zenkaku'),
      latin: { face: 'dm-sans', weight: 500, scale: 110, headings: true },
    });
    assert.deepEqual(
      both.registrations.filter((r) => r.latin).map((r) => [r.family, r.weight, r.sizeAdjust]),
      [
        ['cp20 trial round 0', 500, 107.8],
        ['cp20 trial hand 0', 700, 107.8],
      ],
    );
    // The site's own face for the kana, with its Latin letters scaled in front of it.
    const own = planTrial({ ...current(), latin: { ...current().latin, scale: 90 } });
    assert.deepEqual(
      own.registrations.map((r) => [r.family, r.face.id, r.latin, r.sizeAdjust]),
      [
        ['cp20 trial round 0', 'zen-maru-gothic', true, 90],
        ['cp20 trial hand 0', 'yusei-magic', true, 90],
      ],
    );
    assert.match(own.properties['--round'], /^'cp20 trial round 0', 'Zen Maru Gothic', /);
  });

  test('書体は jsDelivr の決めた版から、役の名前と太さで登録し直し、WOFF2 だけを読む', () => {
    assert.equal(
      stylesheetUrl(findFace('inter')!, 500, true),
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@5.3.0/latin-500.css',
    );
    assert.ok(FACES.every((f) => /^\d+\.\d+\.\d+$/.test(f.version)));
    const faces = faceRules(sheet, 'cp20 trial round 0', 700, { sizeAdjust: 94, latin: true, base }).split(
      '\n',
    );
    assert.equal(faces.length, 2);
    for (const face of faces) {
      assert.match(face, /font-family:'cp20 trial round 0';font-weight:700;/);
      assert.equal(face.match(/font-family/g)?.length, 1);
      assert.equal(face.match(/font-weight/g)?.length, 1);
      assert.match(face, /size-adjust:94%;/);
      assert.match(
        face,
        new RegExp(
          `src: ?url\\(${base.replaceAll('.', '\\.')}/files/[ab]\\.woff2\\) format\\(['"]woff2['"]\\);`,
        ),
      );
      assert.doesNotMatch(face, /\.woff\)/);
      assert.ok(face.endsWith(`unicode-range:${LATIN_RANGE}}`), face);
    }
    const japanese = faceRules(sheet, 'cp20 trial hand 1', 400, { base }).split('\n')[0];
    assert.match(japanese, /;unicode-range: U\+3000-30ff}$/);
    assert.doesNotMatch(japanese, /size-adjust/);
  });

  test('字間と palt は役ごとに、その役の書体を決める規則と文の全体に付け、使わないときは何も足さない', () => {
    const selectors = { hand: ['h1', '.eyebrow'], round: ['.meta'], mono: ['code'] };
    assert.equal(roleRules(current(), selectors), '');
    const rules = roleRules(
      { ...current(), round: { ...current().round, tracking: 30 }, hand: { ...current().hand, palt: true } },
      selectors,
    ).split('\n');
    assert.deepEqual(rules, [
      'body,',
      '.meta{letter-spacing:0.03em;font-feature-settings:normal}',
      'h1,',
      ".eyebrow{letter-spacing:0em;font-feature-settings:'palt'}",
      'code{letter-spacing:0em;font-feature-settings:normal}',
    ]);
  });
});
