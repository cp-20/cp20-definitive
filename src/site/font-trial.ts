// A temporary trial of other typefaces, so the owner can choose by looking at the real pages and
// tune what he chooses: `?font=<preset>` (or the panel it opens, font-trial-panel.ts) sets the
// faces of the site's text roles, each on its own: headings, sentences, figures and Latin
// letters, and code, each with its face, weight, letter-spacing and size. The choice is written
// back into the URL (to share) and kept in localStorage across pages; `?font=off` ends the trial.
// Nothing here is loaded unless a trial is on: the faces are @fontsource stylesheets fetched from
// jsDelivr for the face and weight chosen only, so the site's build carries none of them. To be
// removed once the faces are chosen (and those made the site's own, subset like the faces of
// fonts.ts), with jsDelivr in public/_headers.
//
// The site sets text in three roles (app.css): --hand (headings, names, labels, buttons and
// figures, in weight 400), --round (sentences, in --round-weight, 700) and --mono (code, in 600).
// Each face the trial uses is registered under a family of its own (`cp20 trial <role> <n>`) at
// the weight the role's rules ask for, so a face is shown in the weight chosen for it whatever the
// rules say, and its size-adjust carries the role's size. A Latin face (or a Japanese face's own
// Latin letters, to scale them) covers only the Latin letters, figures and their punctuation, in
// front of the Japanese face, which then sets the rest.

/** A face the trial offers: an @fontsource package on jsDelivr. */
export type TrialFace = {
  /** The @fontsource package, which is also the face's name in a trial's URL. */
  id: string;
  name: string;
  /** ja: headings and sentences; latin: figures and Latin letters; mono: code. */
  kind: 'ja' | 'latin' | 'mono';
  weights: readonly number[];
  version: string;
  /**
   * size-adjust, in %: a Latin face's capitals scaled to about 0.82 of the height of the kana
   * beside them (the share Zen Kaku Gothic New's and Klee One's own Latin letters have), a little
   * less for a face with a tall x-height (Inter); a Japanese face's own Latin letters scaled the
   * same way where they are larger (Kiwi Maru, Zen Old Mincho, LINE Seed JP); a code face to the
   * cap height of the site's monospace. Measured from the faces' outlines (H, x, あ).
   */
  adjust?: number;
  /** The site's own face: its family, and the role and weight it is the site's face in. */
  site?: { family: string; role: 'hand' | 'round' | 'mono'; weight: number };
  /** What the panel adds after its name. */
  note?: string;
};

const all = [100, 200, 300, 400, 500, 600, 700, 800, 900];
export const FACES: readonly TrialFace[] = [
  {
    id: 'yusei-magic',
    name: 'Yusei Magic',
    kind: 'ja',
    weights: [400],
    version: '5.3.0',
    site: { family: 'Yusei Magic', role: 'hand', weight: 400 },
    note: 'いまの見出し',
  },
  {
    id: 'zen-maru-gothic',
    name: 'Zen Maru Gothic',
    kind: 'ja',
    weights: [300, 400, 500, 700, 900],
    version: '5.3.0',
    site: { family: 'Zen Maru Gothic', role: 'round', weight: 700 },
    note: 'いまの文',
  },
  {
    id: 'zen-kaku-gothic-new',
    name: 'Zen Kaku Gothic New',
    kind: 'ja',
    weights: [300, 400, 500, 700, 900],
    version: '5.3.1',
  },
  { id: 'klee-one', name: 'Klee One', kind: 'ja', weights: [400, 600], version: '5.3.1' },
  { id: 'kiwi-maru', name: 'Kiwi Maru', kind: 'ja', weights: [300, 400, 500], version: '5.3.1', adjust: 90 },
  {
    id: 'm-plus-rounded-1c',
    name: 'M PLUS Rounded 1c',
    kind: 'ja',
    weights: [100, 300, 400, 500, 700, 800, 900],
    version: '5.3.0',
  },
  {
    id: 'zen-old-mincho',
    name: 'Zen Old Mincho',
    kind: 'ja',
    weights: [400, 500, 600, 700, 900],
    version: '5.3.1',
    adjust: 95,
  },
  {
    id: 'line-seed-jp',
    name: 'LINE Seed JP',
    kind: 'ja',
    weights: [100, 400, 700, 800],
    version: '5.3.2',
    adjust: 94,
  },
  { id: 'murecho', name: 'Murecho', kind: 'ja', weights: all, version: '5.3.1' },
  { id: 'biz-udpgothic', name: 'BIZ UDPGothic', kind: 'ja', weights: [400, 700], version: '5.3.0' },
  { id: 'inter', name: 'Inter', kind: 'latin', weights: all, version: '5.3.0', adjust: 94 },
  { id: 'dm-sans', name: 'DM Sans', kind: 'latin', weights: all, version: '5.3.0', adjust: 98 },
  {
    id: 'ibm-plex-mono',
    name: 'IBM Plex Mono',
    kind: 'mono',
    weights: [100, 200, 300, 400, 500, 600, 700],
    version: '5.3.0',
    site: { family: 'cp20 Mono', role: 'mono', weight: 600 },
    note: 'いまのコード、cp20 Mono',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    kind: 'mono',
    weights: all.slice(0, 8),
    version: '5.3.0',
    adjust: 96,
  },
  { id: 'dm-mono', name: 'DM Mono', kind: 'mono', weights: [300, 400, 500], version: '5.3.0' },
  {
    id: 'm-plus-1-code',
    name: 'M PLUS 1 Code',
    kind: 'mono',
    weights: all.slice(0, 7),
    version: '5.3.1',
    adjust: 96,
  },
];
export const findFace = (id: string) => FACES.find((f) => f.id === id);

/** Headings (--hand), sentences (--round) or code (--mono). */
export type RoleSetting = {
  face: string;
  weight: number;
  /** letter-spacing, in thousandths of an em. */
  tracking: number;
  /** The face's size, in % of what the rules ask for. */
  scale: number;
  /** Proportional kana from the face's `palt` feature, where it has it. */
  palt: boolean;
};
/** Figures and Latin letters: a Latin face in front of the sentences' (and the headings') face. */
export type LatinSetting = {
  /** A Latin face, or `own` for each Japanese face's own. */
  face: string;
  /** In sentences; headings take the face's weight nearest to theirs. */
  weight: number;
  /** In % of the face's own measured size (adjust). */
  scale: number;
  /** Whether headings take it too, or keep their face's own Latin letters. */
  headings: boolean;
};
export type TrialState = {
  /** The preset it starts from. */
  preset: string;
  hand: RoleSetting;
  round: RoleSetting;
  latin: LatinSetting;
  mono: RoleSetting;
};
export type Preset = Omit<TrialState, 'preset'> & { id: string; name: string; direction: string };

const role = (face: string, weight: number, tracking = 0, palt = false): RoleSetting => ({
  face,
  weight,
  tracking,
  scale: 100,
  palt,
});
const own: LatinSetting = { face: 'own', weight: 400, scale: 100, headings: true };
const latin = (face: string, weight: number, headings: boolean): LatinSetting => ({
  face,
  weight,
  scale: 100,
  headings,
});
const plex = role('ibm-plex-mono', 600);
const jetbrains = role('jetbrains-mono', 500);

/** The eight sets of the first trial, to start from. */
export const PRESETS: readonly Preset[] = [
  {
    id: 'current',
    name: 'いまの組',
    direction: 'マーカーの手書きの見出しと、太い丸ゴシックの文（比べる基準）',
    hand: role('yusei-magic', 400),
    round: role('zen-maru-gothic', 700),
    latin: own,
    mono: plex,
  },
  {
    id: 'yusei-kaku',
    name: '手書き＋端正なゴシック',
    direction: '手書きの見出しはそのままに、文だけ細身で端正な角ゴシックへ',
    hand: role('yusei-magic', 400, 20),
    round: role('zen-kaku-gothic-new', 500, 20),
    latin: own,
    mono: { ...plex, tracking: 20 },
  },
  {
    id: 'klee',
    name: 'ペン字のノート',
    direction: '教科書体のように丁寧なペン字の見出しと、端正な角ゴシックの文',
    hand: role('klee-one', 600, 20, true),
    round: role('zen-kaku-gothic-new', 500, 20, true),
    latin: own,
    mono: { ...plex, tracking: 20 },
  },
  {
    id: 'kiwi',
    name: 'やわらかい丸',
    direction: '丸みのある明朝風の見出しと、細めで整った丸ゴシック。いまの丸さを上品に',
    hand: role('kiwi-maru', 500, 30),
    round: role('m-plus-rounded-1c', 500, 30),
    latin: own,
    mono: role('m-plus-1-code', 500, 30),
  },
  {
    id: 'mincho',
    name: '明朝の見出し',
    direction: '本や雑誌のように、明朝の見出しと端正なゴシックの文で落ち着いた紙面に',
    hand: role('zen-old-mincho', 700, 30),
    round: role('zen-kaku-gothic-new', 500, 30),
    latin: latin('inter', 500, false),
    mono: { ...jetbrains, tracking: 30 },
  },
  {
    id: 'zenkaku',
    name: '上品なゴシック',
    direction: '和文も欧文も端正なゴシックでそろえた、すっきりした組',
    hand: role('zen-kaku-gothic-new', 700, 30),
    round: role('zen-kaku-gothic-new', 500, 30),
    latin: latin('dm-sans', 500, true),
    mono: role('dm-mono', 500, 30),
  },
  {
    id: 'lineseed',
    name: 'くっきりモダン',
    direction: '太い見出しと軽い文の差がはっきりした、いまどきのゴシック',
    hand: role('line-seed-jp', 800, 20),
    round: role('line-seed-jp', 400, 20),
    latin: own,
    mono: { ...jetbrains, tracking: 20 },
  },
  {
    id: 'ud',
    name: '読みやすさ重視',
    direction: '少し個性のある見出しと、UD 書体の読みやすい文',
    hand: role('murecho', 700, 30),
    round: role('biz-udpgothic', 400, 30),
    latin: latin('inter', 400, false),
    mono: { ...jetbrains, tracking: 30 },
  },
];
export const findPreset = (id: string | null | undefined) => PRESETS.find((p) => p.id === id);
export const fromPreset = ({ id, hand, round, latin, mono }: Preset): TrialState => ({
  preset: id,
  hand: { ...hand },
  round: { ...round },
  latin: { ...latin },
  mono: { ...mono },
});

export const STORAGE_KEY = 'cp20:font-trial';
export const TRACKING = { min: -50, max: 150 } as const;
export const SCALE = { min: 80, max: 130 } as const;
const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));
/** The weight of `weights` nearest to `weight` (the lighter of two as near). */
export const nearest = (weights: readonly number[], weight: number) =>
  weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best));

// A trial as text, for the URL and localStorage: the preset, then each role that differs from it,
// `~`-separated. h: headings, b: sentences, c: code (face:weight:tracking:scale, then :p for palt);
// f: figures and Latin letters (face or own:weight:scale:h for headings too, b for sentences
// only). Only letters, digits and - ~ : go into it, so it stays readable in the address bar.
const LETTERS = { hand: 'h', round: 'b', mono: 'c' } as const;
const roleText = (r: RoleSetting) => `${r.face}:${r.weight}:${r.tracking}:${r.scale}${r.palt ? ':p' : ''}`;
const latinText = (l: LatinSetting) => `${l.face}:${l.weight}:${l.scale}:${l.headings ? 'h' : 'b'}`;

export function encodeTrial(state: TrialState) {
  const base = findPreset(state.preset) ?? PRESETS[0];
  const parts = [base.id];
  for (const key of ['hand', 'round', 'mono'] as const)
    if (roleText(state[key]) !== roleText(base[key])) parts.push(`${LETTERS[key]}:${roleText(state[key])}`);
  if (latinText(state.latin) !== latinText(base.latin)) parts.push(`f:${latinText(state.latin)}`);
  return parts.join('~');
}

/** A trial from its text, or undefined if it names no preset. Parts that make no sense are left out. */
export function decodeTrial(text: string | null | undefined): TrialState | undefined {
  const [id, ...parts] = (text ?? '').split('~');
  const preset = findPreset(id);
  if (!preset) return undefined;
  const state = fromPreset(preset);
  for (const part of parts) {
    const [letter, face, weightText, ...rest] = part.split(':');
    const found = findFace(face);
    const weight = Number(weightText);
    const key = (Object.keys(LETTERS) as (keyof typeof LETTERS)[]).find((k) => LETTERS[k] === letter);
    if (key) {
      const [tracking, scale, palt] = rest;
      if (!found || found.kind !== (key === 'mono' ? 'mono' : 'ja') || !found.weights.includes(weight))
        continue;
      if (!/^-?\d+$/.test(tracking ?? '') || !/^\d+$/.test(scale ?? '')) continue;
      state[key] = {
        face,
        weight,
        tracking: clamp(Number(tracking), TRACKING),
        scale: clamp(Number(scale), SCALE),
        palt: palt === 'p',
      };
    } else if (letter === 'f') {
      const [scale, where] = rest;
      if (face !== 'own' && (!found || found.kind !== 'latin' || !found.weights.includes(weight))) continue;
      if (!/^\d+$/.test(scale ?? '') || (where !== 'h' && where !== 'b')) continue;
      state.latin = {
        face,
        weight: face === 'own' ? 400 : weight,
        scale: clamp(Number(scale), SCALE),
        headings: where === 'h',
      };
    }
  }
  return state;
}

/**
 * What a visit does with the trial, from its `?font=` value (null when there is none) and the
 * trial kept from an earlier page: the trial to show (the `current` preset when neither names
 * one), whether the panel shows (and the trial is kept for the next pages), or whether the kept
 * trial is forgotten (`off`).
 */
export function trialFrom(param: string | null, stored: string | null) {
  if (param === 'off') return { state: fromPreset(PRESETS[0]), panel: false, forget: true };
  return {
    state: decodeTrial(param) ?? decodeTrial(stored) ?? fromPreset(PRESETS[0]),
    panel: param !== null || stored !== null,
    forget: false,
  };
}

/** Whether a trial is a preset as it is, untouched. */
export const isPreset = (state: TrialState) => encodeTrial(state) === state.preset;

/** The family a role's nth face is registered under. */
export const alias = (role: 'hand' | 'round' | 'mono', n: number) => `cp20 trial ${role} ${n}`;
/** The weight each role's rules ask for (app.css). */
export const ROLE_WEIGHT = { hand: 400, round: 700, mono: 600 } as const;

/** One face to fetch and register: an @fontsource stylesheet under a family of the trial's. */
export type Registration = {
  family: string;
  face: TrialFace;
  /** The weight of the stylesheet. */
  weight: number;
  /** Its Latin subset only, for Latin letters, figures and ASCII punctuation alone. */
  latin: boolean;
  sizeAdjust: number;
  /** The weight it is registered at (the role's). */
  as: number;
};
const percent = (n: number) => Math.round(n * 100) / 100;

/**
 * The faces a trial registers, and the role stacks (custom properties) that use them. A role that
 * keeps the site's own face as it is (in its own role, at its weight and size) registers nothing
 * for it and uses the site's family, so the site's own trial, `current`, loads nothing.
 */
export function planTrial(state: TrialState) {
  const registrations: Registration[] = [];
  const properties: Record<string, string> = {};
  for (const key of ['round', 'hand'] as const) {
    const setting = state[key];
    const face = findFace(setting.face)!;
    const size = setting.scale / 100;
    const latinHere = key === 'round' || state.latin.headings;
    const stack: string[] = [];
    const register = (from: TrialFace, weight: number, latin: boolean, sizeAdjust: number) => {
      const family = alias(key, stack.length);
      stack.push(`'${family}'`);
      registrations.push({
        family,
        face: from,
        weight,
        latin,
        sizeAdjust: percent(sizeAdjust),
        as: ROLE_WEIGHT[key],
      });
    };
    const latinFace = latinHere && state.latin.face !== 'own' ? findFace(state.latin.face) : undefined;
    if (latinFace)
      register(
        latinFace,
        key === 'round' ? state.latin.weight : nearest(latinFace.weights, setting.weight),
        true,
        (latinFace.adjust ?? 100) * (state.latin.scale / 100) * size,
      );
    else {
      const ownLatin = (face.adjust ?? 100) * (latinHere ? state.latin.scale / 100 : 1);
      if (ownLatin !== 100) register(face, setting.weight, true, ownLatin * size);
    }
    const siteAsIs = face.site?.role === key && face.site.weight === setting.weight && size === 1;
    if (siteAsIs) stack.push(`'${face.site!.family}'`);
    else register(face, setting.weight, false, 100 * size);
    if (stack.length === 1 && siteAsIs) continue;
    properties[`--${key}`] =
      key === 'round'
        ? `${stack.join(', ')}, 'Hiragino Sans', 'Noto Sans JP', sans-serif`
        : `${stack.join(', ')}, var(--round)`;
  }
  const mono = state.mono;
  const monoFace = findFace(mono.face)!;
  if (!(monoFace.site?.role === 'mono' && monoFace.site.weight === mono.weight && mono.scale === 100)) {
    const family = alias('mono', 0);
    registrations.push({
      family,
      face: monoFace,
      weight: mono.weight,
      latin: false,
      sizeAdjust: percent((monoFace.adjust ?? 100) * (mono.scale / 100)),
      as: ROLE_WEIGHT.mono,
    });
    properties['--mono'] = `'${family}', 'cp20 Mono', ui-monospace, monospace`;
  }
  return { registrations, properties };
}

const CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';
/** Where a face's files are: its package on jsDelivr, at the version pinned here. */
export const packageUrl = (face: TrialFace) => `${CDN}/${face.id}@${face.version}`;
/** The stylesheet of a face at a weight, or of its Latin subset alone. */
export const stylesheetUrl = (face: TrialFace, weight: number, latin: boolean) =>
  `${packageUrl(face)}/${latin ? 'latin-' : ''}${weight}.css`;

export const LATIN_RANGE = 'U+0020-007E,U+00A0-00FF';
/**
 * An @fontsource stylesheet's @font-face rules registered under `family` at `weight` (the weight
 * the role's rules ask for), with `size-adjust` and, for a Latin face, only the Latin range. Its
 * files are fetched from `base` (the package's address), in WOFF2 only.
 */
export function faceRules(
  css: string,
  family: string,
  weight: number,
  { sizeAdjust = 100, latin = false, base }: { sizeAdjust?: number; latin?: boolean; base: string },
) {
  const dropped = new Set(['font-family', 'font-weight', 'size-adjust', ...(latin ? ['unicode-range'] : [])]);
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)]
    .map(([, body]) => {
      const kept = body
        .split(';')
        .map((declaration) => declaration.trim().replace(/\s+/g, ' '))
        .filter((declaration) => declaration && !dropped.has(declaration.split(':')[0].trim()))
        .map((declaration) =>
          declaration.startsWith('src:')
            ? declaration
                .replace(/,\s*url\([^)]*\)\s*format\(['"]?woff['"]?\)/g, '')
                .replace(/url\((['"]?)\.\//g, `url($1${base}/`)
            : declaration,
        );
      return `@font-face{${[
        `font-family:'${family}'`,
        `font-weight:${weight}`,
        ...kept,
        ...(sizeAdjust !== 100 ? [`size-adjust:${sizeAdjust}%`] : []),
        ...(latin ? [`unicode-range:${LATIN_RANGE}`] : []),
      ].join(';')}}`;
    })
    .join('\n');
}

/**
 * Letter-spacing and proportional kana by role, for the rules that set each role's face
 * (`selectors`, read from the page's style sheets) and the page itself (sentences). None when the
 * trial spaces nothing and uses no palt, as the site does.
 */
export function roleRules(state: TrialState, selectors: Record<'hand' | 'round' | 'mono', string[]>) {
  const keys = ['round', 'hand', 'mono'] as const;
  if (keys.every((key) => state[key].tracking === 0 && !state[key].palt)) return '';
  return keys
    .map((key) => {
      const list = key === 'round' ? ['body', ...selectors.round] : selectors[key];
      if (!list.length) return '';
      const { tracking, palt } = state[key];
      return `${list.join(',\n')}{letter-spacing:${tracking / 1000}em;font-feature-settings:${palt ? "'palt'" : 'normal'}}`;
    })
    .filter(Boolean)
    .join('\n');
}
