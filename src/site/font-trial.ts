// A temporary trial of other typefaces, so the owner can choose by looking at the real pages:
// `?font=<id>` (or the panel it opens, font-trial-panel.ts) sets the site's three faces from one
// of the sets below and keeps the choice in localStorage across pages; `?font=off` ends the
// trial. Nothing here is loaded unless a trial is on: the faces are @fontsource stylesheets,
// fetched only for the set chosen. To be removed, with the @fontsource packages it lists, once a
// set has been chosen (and that set made the site's own, subset like the faces of fonts.ts).
//
// The site sets text in three roles (app.css): --hand (headings, names, labels, buttons and
// figures, in weight 400), --round (sentences, in --round-weight, 700) and --mono (code, in 600).
// A set gives each role a stack of faces, each registered under a family of its own
// (`cp20 trial <role> <n>`) at the weight the role asks for, so a face is used in the weight
// chosen for it whatever the rules say. A face marked `latin` covers only the Latin letters,
// figures and their punctuation, in front of the Japanese face, which then sets the rest.

/** One @fontsource stylesheet: a package (`inter`) and the weight of the face in it. */
export type TrialFace = {
  font: string;
  weight: number;
  /** Only the Latin letters, figures and ASCII punctuation (U+0020-007E, U+00A0-00FF). */
  latin?: true;
  /**
   * size-adjust, in %: a Latin face's capitals scaled to about 0.82 of the height of the kana
   * beside them (the share Zen Kaku Gothic New's and Klee One's own Latin letters have), a little
   * less for a face with a tall x-height (Inter); a Japanese face's own Latin letters scaled the
   * same way where they are larger (Kiwi Maru, Zen Old Mincho, LINE Seed JP); a code face to the
   * cap height of the site's monospace. Measured from the faces' outlines (H, x, あ).
   */
  sizeAdjust?: number;
};
export type FontSet = {
  id: string;
  name: string;
  /** What the set is going for, in one line. */
  direction: string;
  /** The face of each role as the panel lists it: heading, sentences, figures and Latin, code. */
  roles: { hand: string; round: string; figures: string; code: string };
  /** The stacks; a role left out keeps the site's face (--hand still falls back to --round). */
  hand?: TrialFace[];
  round?: TrialFace[];
  mono?: TrialFace[];
  /** letter-spacing of the page, in em (the site's is 0). */
  tracking?: number;
  /** Proportional kana from the faces' `palt` feature, where they have it. */
  palt?: true;
};

export const LATIN_RANGE = 'U+0020-007E,U+00A0-00FF';
export const STORAGE_KEY = 'cp20:font-trial';

export const FONT_SETS: readonly FontSet[] = [
  {
    id: 'current',
    name: 'いまの組',
    direction: 'マーカーの手書きの見出しと、太い丸ゴシックの文（比べる基準）',
    roles: {
      hand: 'Yusei Magic',
      round: 'Zen Maru Gothic 700',
      figures: '見出しは Yusei Magic、文は Zen Maru Gothic',
      code: 'IBM Plex Mono SemiBold',
    },
  },
  {
    id: 'yusei-kaku',
    name: '手書き＋端正なゴシック',
    direction: '手書きの見出しはそのままに、文だけ細身で端正な角ゴシックへ',
    roles: {
      hand: 'Yusei Magic',
      round: 'Zen Kaku Gothic New 500',
      figures: '見出しは Yusei Magic、文は Zen Kaku Gothic New',
      code: 'IBM Plex Mono SemiBold',
    },
    round: [{ font: 'zen-kaku-gothic-new', weight: 500 }],
    tracking: 0.02,
  },
  {
    id: 'klee',
    name: 'ペン字のノート',
    direction: '教科書体のように丁寧なペン字の見出しと、端正な角ゴシックの文',
    roles: {
      hand: 'Klee One 600',
      round: 'Zen Kaku Gothic New 500',
      figures: '見出しは Klee One、文は Zen Kaku Gothic New',
      code: 'IBM Plex Mono SemiBold',
    },
    hand: [{ font: 'klee-one', weight: 600 }],
    round: [{ font: 'zen-kaku-gothic-new', weight: 500 }],
    tracking: 0.02,
    palt: true,
  },
  {
    id: 'kiwi',
    name: 'やわらかい丸',
    direction: '丸みのある明朝風の見出しと、細めで整った丸ゴシック。いまの丸さを上品に',
    roles: {
      hand: 'Kiwi Maru 500',
      round: 'M PLUS Rounded 1c 500',
      figures: 'それぞれの書体のもの',
      code: 'M PLUS 1 Code 500',
    },
    hand: [
      { font: 'kiwi-maru', weight: 500, latin: true, sizeAdjust: 90 },
      { font: 'kiwi-maru', weight: 500 },
    ],
    round: [{ font: 'm-plus-rounded-1c', weight: 500 }],
    mono: [{ font: 'm-plus-1-code', weight: 500, sizeAdjust: 96 }],
    tracking: 0.03,
  },
  {
    id: 'mincho',
    name: '明朝の見出し',
    direction: '本や雑誌のように、明朝の見出しと端正なゴシックの文で落ち着いた紙面に',
    roles: {
      hand: 'Zen Old Mincho 700',
      round: 'Zen Kaku Gothic New 500',
      figures: '見出しは Zen Old Mincho、文は Inter',
      code: 'JetBrains Mono 500',
    },
    hand: [
      { font: 'zen-old-mincho', weight: 700, latin: true, sizeAdjust: 95 },
      { font: 'zen-old-mincho', weight: 700 },
    ],
    round: [
      { font: 'inter', weight: 500, latin: true, sizeAdjust: 94 },
      { font: 'zen-kaku-gothic-new', weight: 500 },
    ],
    mono: [{ font: 'jetbrains-mono', weight: 500, sizeAdjust: 96 }],
    tracking: 0.03,
  },
  {
    id: 'zenkaku',
    name: '上品なゴシック',
    direction: '和文も欧文も端正なゴシックでそろえた、すっきりした組',
    roles: {
      hand: 'Zen Kaku Gothic New 700',
      round: 'Zen Kaku Gothic New 500',
      figures: 'DM Sans',
      code: 'DM Mono 500',
    },
    hand: [
      { font: 'dm-sans', weight: 700, latin: true, sizeAdjust: 100 },
      { font: 'zen-kaku-gothic-new', weight: 700 },
    ],
    round: [
      { font: 'dm-sans', weight: 500, latin: true, sizeAdjust: 98 },
      { font: 'zen-kaku-gothic-new', weight: 500 },
    ],
    mono: [{ font: 'dm-mono', weight: 500 }],
    tracking: 0.03,
  },
  {
    id: 'lineseed',
    name: 'くっきりモダン',
    direction: '太い見出しと軽い文の差がはっきりした、いまどきのゴシック',
    roles: {
      hand: 'LINE Seed JP 800',
      round: 'LINE Seed JP 400',
      figures: 'LINE Seed JP',
      code: 'JetBrains Mono 500',
    },
    hand: [
      { font: 'line-seed-jp', weight: 800, latin: true, sizeAdjust: 95 },
      { font: 'line-seed-jp', weight: 800 },
    ],
    round: [
      { font: 'line-seed-jp', weight: 400, latin: true, sizeAdjust: 94 },
      { font: 'line-seed-jp', weight: 400 },
    ],
    mono: [{ font: 'jetbrains-mono', weight: 500, sizeAdjust: 96 }],
    tracking: 0.02,
  },
  {
    id: 'ud',
    name: '読みやすさ重視',
    direction: '少し個性のある見出しと、UD 書体の読みやすい文',
    roles: {
      hand: 'Murecho 700',
      round: 'BIZ UDPGothic 400',
      figures: '見出しは Murecho、文は Inter',
      code: 'JetBrains Mono 500',
    },
    hand: [{ font: 'murecho', weight: 700 }],
    round: [
      { font: 'inter', weight: 400, latin: true, sizeAdjust: 94 },
      { font: 'biz-udpgothic', weight: 400 },
    ],
    mono: [{ font: 'jetbrains-mono', weight: 500, sizeAdjust: 96 }],
    tracking: 0.03,
  },
];

export const findSet = (id: string | null | undefined) => FONT_SETS.find((s) => s.id === id);

/**
 * What a visit does with the trial, from its `?font=` value (null when there is none) and the set
 * kept from an earlier page: the set chosen (`id`, `current` for the site's own faces) and the
 * faces to load (`set`, none for the site's own), whether the panel shows (and the choice is kept
 * for the next pages), or whether the kept choice is forgotten (`off`). A value that names no set
 * opens the panel on the kept set.
 */
export function trialFrom(param: string | null, stored: string | null) {
  if (param === 'off') return { id: 'current', set: undefined, panel: false, forget: true };
  const chosen = findSet(param) ?? findSet(stored) ?? FONT_SETS[0];
  return {
    id: chosen.id,
    set: chosen.id === 'current' ? undefined : chosen,
    panel: param !== null || stored !== null,
    forget: false,
  };
}

/** The family a role's nth face is registered under. */
export const alias = (role: 'hand' | 'round' | 'mono', n: number) => `cp20 trial ${role} ${n}`;
/** The weight each role's rules ask for (app.css). */
export const ROLE_WEIGHT = { hand: 400, round: 700, mono: 600 } as const;

/**
 * An @fontsource stylesheet's @font-face rules registered under `family` at `weight` (the weight
 * the role's rules ask for), with `size-adjust` and, for a Latin face, only the Latin range.
 */
export function faceRules(
  css: string,
  family: string,
  weight: number,
  { sizeAdjust, latin }: Pick<TrialFace, 'sizeAdjust' | 'latin'> = {},
) {
  const dropped = new Set(['font-family', 'font-weight', 'size-adjust', ...(latin ? ['unicode-range'] : [])]);
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map(([, body]) => {
      const kept = body
        .split(';')
        .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
        .filter((declaration) => declaration && !dropped.has(declaration.split(':')[0].trim()));
      return `@font-face{${[
        `font-family:'${family}'`,
        `font-weight:${weight}`,
        ...kept,
        ...(sizeAdjust ? [`size-adjust:${sizeAdjust}%`] : []),
        ...(latin ? [`unicode-range:${LATIN_RANGE}`] : []),
      ].join(';')}}`;
    })
    .join('\n');
}

/**
 * The custom properties of a set: each role's stack of its own families, the site's face where the
 * set keeps it, then the system's.
 */
export function roleProperties(set: FontSet) {
  const stack = (role: 'hand' | 'round' | 'mono', faces: TrialFace[]) =>
    faces.map((_, n) => `'${alias(role, n)}'`).join(', ');
  const round = set.round
    ? `${stack('round', set.round)}, 'Hiragino Sans', sans-serif`
    : "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif";
  const hand = set.hand ? `${stack('hand', set.hand)}, ${round}` : `'Yusei Magic', ${round}`;
  const mono = set.mono ? `${stack('mono', set.mono)}, 'cp20 Mono', ui-monospace, monospace` : undefined;
  return { '--round': round, '--hand': hand, ...(mono ? { '--mono': mono } : {}) };
}
