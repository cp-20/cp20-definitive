// The typeface trial's panel and loader (font-trial.ts): loaded only when a visit asks for the trial
// (?font=) or chose a set on an earlier page. Temporary, like the trial.
import {
  FONT_SETS,
  ROLE_WEIGHT,
  STORAGE_KEY,
  alias,
  faceRules,
  findSet,
  roleProperties,
  trialFrom,
  type FontSet,
  type TrialFace,
} from './font-trial.ts';

// Each face's @fontsource stylesheet, as text (its fonts are emitted as separate files), fetched
// only when a set that uses it is chosen.
const STYLESHEETS: Record<string, () => Promise<{ default: string }>> = {
  'zen-kaku-gothic-new/500': () => import('@fontsource/zen-kaku-gothic-new/500.css?inline'),
  'zen-kaku-gothic-new/700': () => import('@fontsource/zen-kaku-gothic-new/700.css?inline'),
  'klee-one/600': () => import('@fontsource/klee-one/600.css?inline'),
  'kiwi-maru/500': () => import('@fontsource/kiwi-maru/500.css?inline'),
  'kiwi-maru/latin-500': () => import('@fontsource/kiwi-maru/latin-500.css?inline'),
  'm-plus-rounded-1c/500': () => import('@fontsource/m-plus-rounded-1c/500.css?inline'),
  'm-plus-1-code/500': () => import('@fontsource/m-plus-1-code/500.css?inline'),
  'zen-old-mincho/700': () => import('@fontsource/zen-old-mincho/700.css?inline'),
  'zen-old-mincho/latin-700': () => import('@fontsource/zen-old-mincho/latin-700.css?inline'),
  'line-seed-jp/400': () => import('@fontsource/line-seed-jp/400.css?inline'),
  'line-seed-jp/latin-400': () => import('@fontsource/line-seed-jp/latin-400.css?inline'),
  'line-seed-jp/800': () => import('@fontsource/line-seed-jp/800.css?inline'),
  'line-seed-jp/latin-800': () => import('@fontsource/line-seed-jp/latin-800.css?inline'),
  'murecho/700': () => import('@fontsource/murecho/700.css?inline'),
  'biz-udpgothic/400': () => import('@fontsource/biz-udpgothic/400.css?inline'),
  'inter/latin-400': () => import('@fontsource/inter/latin-400.css?inline'),
  'inter/latin-500': () => import('@fontsource/inter/latin-500.css?inline'),
  'dm-sans/latin-500': () => import('@fontsource/dm-sans/latin-500.css?inline'),
  'dm-sans/latin-700': () => import('@fontsource/dm-sans/latin-700.css?inline'),
  // Code faces with Latin letters only: their Latin subset is all of them.
  'dm-mono/500': () => import('@fontsource/dm-mono/latin-500.css?inline'),
  'jetbrains-mono/500': () => import('@fontsource/jetbrains-mono/latin-500.css?inline'),
};
/** The stylesheet of a face: its Latin subset alone for a Latin face. */
export const stylesheetKey = (face: TrialFace) => `${face.font}/${face.latin ? 'latin-' : ''}${face.weight}`;
export const stylesheetKeys = Object.keys(STYLESHEETS);

const ROLES = ['hand', 'round', 'mono'] as const;
let applied = 0;
/** Puts a set's faces on the page (undefined: the site's own). The last one asked for wins. */
async function apply(set: FontSet | undefined) {
  const turn = ++applied;
  const faces = await Promise.all(
    ROLES.flatMap((role) =>
      (set?.[role] ?? []).map(async (face, n) =>
        faceRules(
          (await STYLESHEETS[stylesheetKey(face)]()).default,
          alias(role, n),
          ROLE_WEIGHT[role],
          face,
        ),
      ),
    ),
  );
  if (turn !== applied) return;
  document.getElementById('font-trial-faces')?.remove();
  const root = document.documentElement;
  if (!set) return void delete root.dataset.fontTrial;
  const style = document.createElement('style');
  style.id = 'font-trial-faces';
  const properties = Object.entries(roleProperties(set))
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  style.textContent = `${faces.join('\n')}
:root[data-font-trial]{${properties}}
:root[data-font-trial] body{letter-spacing:${set.tracking ?? 0}em;${set.palt ? "font-feature-settings:'palt';" : ''}}`;
  document.head.append(style);
  root.dataset.fontTrial = set.id;
}

const remember = (id: string | null) => {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {}
};

const PANEL_STYLE = `
.font-trial{position:fixed;z-index:70;left:12px;bottom:12px;max-width:min(360px,calc(100vw - 24px));
  font:13px/1.5 system-ui,sans-serif;letter-spacing:0;color:#2d2a33}
.font-trial-toggle{display:flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:2px solid #2d2a33;
  border-radius:999px;background:#fffcf3;box-shadow:2px 2px 0 #2d2a33;font:inherit;font-weight:700;cursor:pointer}
.font-trial-list{margin-bottom:8px;padding:10px;border:2px solid #2d2a33;border-radius:14px;background:#fffcf3;
  box-shadow:3px 3px 0 #2d2a33;max-height:min(70vh,560px);overflow:auto}
.font-trial-list[hidden]{display:none}
.font-trial-list p{margin:0 4px 6px;color:#6c6873}
.font-trial-list label{display:grid;grid-template-columns:auto 1fr;gap:0 8px;padding:6px 8px;border-radius:8px;cursor:pointer}
.font-trial-list label:has(input:checked){background:#d3f2d9}
.font-trial-list input{grid-row:span 3;margin-top:4px}
.font-trial-list b{font-size:14px}
.font-trial-list small{color:#6c6873;font-size:12px}
.font-trial-end{margin:6px 4px 0;padding:0;border:0;background:none;color:#3b64a8;font:inherit;text-decoration:underline;cursor:pointer}
@media (max-width:760px){.font-trial{left:8px;bottom:calc(72px + env(safe-area-inset-bottom))}}
`;

/** The panel: the chosen set's name, which opens the list of sets to choose from. */
function showPanel(current: string) {
  document.querySelector('.font-trial')?.remove();
  const style = document.createElement('style');
  style.textContent = PANEL_STYLE;
  const panel = document.createElement('section');
  panel.className = 'font-trial';
  panel.setAttribute('aria-label', '書体のお試し');
  const list = document.createElement('div');
  list.className = 'font-trial-list';
  list.id = 'font-trial-list';
  list.hidden = true;
  const note = document.createElement('p');
  note.textContent = '書体の組み合わせを試す（一時的なもの。選んだ組はほかのページでも続きます）';
  list.append(note);
  const toggle = document.createElement('button');
  toggle.className = 'font-trial-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', list.id);
  const label = (id: string) => (toggle.textContent = `書体：${findSet(id)?.name ?? FONT_SETS[0].name}`);
  label(current);
  toggle.addEventListener('click', () => {
    list.hidden = !list.hidden;
    toggle.setAttribute('aria-expanded', String(!list.hidden));
  });
  for (const set of FONT_SETS) {
    const option = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'font-trial';
    input.value = set.id;
    input.checked = set.id === current;
    input.addEventListener('change', () => {
      remember(set.id);
      label(set.id);
      void apply(set.id === 'current' ? undefined : set);
    });
    const name = document.createElement('b');
    name.textContent = `${set.name}（?font=${set.id}）`;
    const direction = document.createElement('span');
    direction.textContent = set.direction;
    const roles = document.createElement('small');
    roles.textContent = `見出し ${set.roles.hand} ／ 文 ${set.roles.round} ／ 数字・欧文 ${set.roles.figures} ／ コード ${set.roles.code}`;
    option.append(input, name, direction, roles);
    list.append(option);
  }
  const end = document.createElement('button');
  end.className = 'font-trial-end';
  end.textContent = 'お試しをやめる（いまの組に戻して、このパネルを消す）';
  end.addEventListener('click', () => {
    remember(null);
    void apply(undefined);
    panel.remove();
    style.remove();
  });
  list.append(end);
  panel.append(list, toggle);
  document.head.append(style);
  document.body.append(panel);
}

/** Starts the trial from the page's `?font=` value (null if none), then drops it from the URL. */
export function startFontTrial(param: string | null) {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  const { id, set, panel, forget } = trialFrom(param, stored);
  if (param !== null) {
    const url = new URL(location.href);
    url.searchParams.delete('font');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  if (forget) return void remember(null);
  if (!panel) return;
  remember(id);
  void apply(set);
  showPanel(id);
}
