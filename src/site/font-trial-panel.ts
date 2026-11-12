// The typeface trial's panel and loader (font-trial.ts): loaded only when a visit asks for the trial
// (?font=) or kept one from an earlier page. Temporary, like the trial.
import {
  FACES,
  PRESETS,
  SCALE,
  STORAGE_KEY,
  TRACKING,
  encodeTrial,
  faceRules,
  findFace,
  findPreset,
  fromPreset,
  isPreset,
  nearest,
  packageUrl,
  planTrial,
  roleRules,
  stylesheetUrl,
  trialFrom,
  type RoleSetting,
  type TrialState,
} from './font-trial.ts';

// Each stylesheet once per visit; its fonts are fetched by the browser as text needs them.
const sheets = new Map<string, Promise<string>>();
const stylesheet = (url: string) => {
  let css = sheets.get(url);
  if (!css) {
    css = fetch(url)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => '');
    sheets.set(url, css);
  }
  return css;
};

type RoleKey = 'hand' | 'round' | 'mono';
// The rules that set each role's face (font-family: var(--hand) and so on), read once from the
// page's style sheets, for the role's letter-spacing and palt. A rule with its own letter-spacing
// (the vertical tabs) keeps it.
let selectors: Record<RoleKey, string[]> | undefined;
function roleSelectors() {
  if (selectors) return selectors;
  const found: Record<RoleKey, string[]> = { hand: [], round: [], mono: [] };
  const walk = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        const family = rule.style.getPropertyValue('font-family');
        if (rule.style.getPropertyValue('letter-spacing')) continue;
        for (const key of ['hand', 'round', 'mono'] as const)
          if (family.includes(`var(--${key})`)) found[key].push(rule.selectorText);
      } else if (rule instanceof CSSGroupingRule) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode instanceof Element && sheet.ownerNode.id.startsWith('font-trial')) continue;
    try {
      walk(sheet.cssRules);
    } catch {}
  }
  return (selectors = found);
}

const setStyle = (id: string, text: string) => {
  let style = document.getElementById(id);
  if (!text) return void style?.remove();
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.append(style);
  }
  if (style.textContent !== text) style.textContent = text;
};

let applied = 0;
/** Puts a trial's faces and spacing on the page (undefined: the site's own). The last one asked for wins. */
async function apply(state: TrialState | undefined) {
  const turn = ++applied;
  const plan = state ? planTrial(state) : { registrations: [], properties: {} };
  const faces = await Promise.all(
    plan.registrations.map(async (r) =>
      faceRules(await stylesheet(stylesheetUrl(r.face, r.weight, r.latin)), r.family, r.as, {
        sizeAdjust: r.sizeAdjust,
        latin: r.latin,
        base: packageUrl(r.face),
      }),
    ),
  );
  if (turn !== applied) return;
  const properties = Object.entries(plan.properties)
    .map(([name, value]) => `${name}:${value};`)
    .join('');
  const rules = state ? roleRules(state, roleSelectors()) : '';
  setStyle('font-trial-faces', faces.join('\n'));
  setStyle(
    'font-trial-roles',
    [properties && `:root[data-font-trial]{${properties}}`, rules].filter(Boolean).join('\n'),
  );
  const root = document.documentElement;
  if (state && (properties || rules)) root.dataset.fontTrial = state.preset;
  else delete root.dataset.fontTrial;
}
// Sliders ask many times a second: the page is updated once a frame.
let frame = 0,
  pending: TrialState | undefined;
const schedule = (state: TrialState | undefined) => {
  pending = state;
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    void apply(pending);
  });
};

const remember = (text: string | null) => {
  try {
    if (text === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, text);
  } catch {}
};
/** This page's address with the trial as its `font` (none: without it), the rest kept. */
function addressWith(text: string | null) {
  const url = new URL(location.href);
  url.searchParams.delete('font');
  const search = [url.searchParams.toString(), text === null ? '' : `font=${text}`].filter(Boolean).join('&');
  return url.pathname + (search ? `?${search}` : '') + url.hash;
}
let current: TrialState | undefined,
  saving = 0;
/**
 * Keeps the trial for the next pages and in the address bar, to share: at once, or `later` (a
 * slider being dragged), as browsers allow only so many history updates a second.
 */
function keep(state: TrialState | undefined, later = false) {
  current = state;
  clearTimeout(saving);
  const save = () => {
    const text = current ? encodeTrial(current) : null;
    remember(text);
    history.replaceState(history.state, '', addressWith(text));
  };
  if (later) saving = window.setTimeout(save, 300);
  else save();
}

const PANEL_STYLE = `
.font-trial{position:fixed;z-index:70;left:12px;bottom:12px;width:min(360px,calc(100vw - 24px));
  font:13px/1.5 system-ui,sans-serif;color:#2d2a33}
.font-trial,.font-trial *{letter-spacing:0!important;font-feature-settings:normal!important}
.font-trial :is(button,select,input,output){font:inherit;color:inherit}
.font-trial-toggle{display:flex;align-items:center;gap:6px;max-width:100%;min-height:36px;padding:0 14px;
  border:2px solid #2d2a33;border-radius:999px;background:#fffcf3;box-shadow:2px 2px 0 #2d2a33;font-weight:700!important;
  cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.font-trial-body{margin-bottom:8px;padding:10px 12px;border:2px solid #2d2a33;border-radius:14px;background:#fffcf3;
  box-shadow:3px 3px 0 #2d2a33;max-height:min(72vh,640px);overflow:auto;overscroll-behavior:contain}
.font-trial-body[hidden]{display:none}
.font-trial-body p{margin:0 0 6px;color:#6c6873;font-size:12px}
.font-trial-preset{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px;font-weight:700}
.font-trial-body select{min-width:0;height:30px;padding:0 4px;border:1.5px solid #b9b3bd;border-radius:6px;background:#fff}
.font-trial-body fieldset{margin:6px 0 0;padding:4px 8px 8px;border:1.5px solid #d8d2da;border-radius:10px}
.font-trial-body legend{padding:0 4px;font-weight:700}
.font-trial-row{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-top:4px}
.font-trial-row label{display:grid;gap:2px;min-width:0;font-size:12px;color:#57525c}
.font-trial-row label>span{display:flex;justify-content:space-between;gap:4px}
.font-trial-row output{color:#2d2a33;font-variant-numeric:tabular-nums}
.font-trial-row input[type=range]{width:100%;margin:0;accent-color:#3b8c4f}
.font-trial-row .font-trial-check{display:flex;align-items:center;align-self:end;gap:6px;min-height:22px;font-size:12px;color:#57525c}
.font-trial-check input{flex:none;margin:0}
.font-trial-row .font-trial-wide{grid-column:1/-1}
.font-trial-actions{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px}
.font-trial-actions button{padding:0;border:0;background:none;color:#3b64a8;text-decoration:underline;cursor:pointer}
.font-trial-actions [role=status]{color:#3b8c4f}
@media (max-width:760px){.font-trial{left:8px;bottom:calc(72px + env(safe-area-inset-bottom));width:calc(100vw - 16px)}
  .font-trial-body{max-height:min(46vh,440px)}}
`;

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
};
const em = (tracking: number) => `${tracking / 1000}em`;

type Props = Record<string, string | number | boolean>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: (Node | string)[]) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props))
    if (name === 'text') node.textContent = String(value);
    else if (typeof value === 'boolean') node.toggleAttribute(name, value);
    else node.setAttribute(name, String(value));
  node.append(...children);
  return node;
}
const options = (select: HTMLSelectElement, items: [string, string][], value: string) => {
  select.replaceChildren(...items.map(([v, label]) => h('option', { value: v, text: label })));
  select.value = value;
};

/** The panel: the trial's name, which opens the controls for each role. */
function showPanel(state: TrialState) {
  document.querySelector('.font-trial')?.remove();
  let trial = state;
  const updates: (() => void)[] = [];
  const style = h('style', { id: 'font-trial-panel-style', text: PANEL_STYLE });
  const toggle = h('button', {
    class: 'font-trial-toggle',
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'font-trial-body',
  });
  const body = h('div', { class: 'font-trial-body', id: 'font-trial-body', hidden: true });
  toggle.addEventListener('click', () => {
    body.hidden = !body.hidden;
    toggle.setAttribute('aria-expanded', String(!body.hidden));
  });
  const status = h('span', { role: 'status' });
  // A change from a control: the page, the address and what is kept follow.
  const change = (next: TrialState, later = false) => {
    trial = next;
    keep(trial, later);
    schedule(trial);
    status.textContent = '';
    for (const update of updates) update();
  };

  const preset = h('select', { name: 'preset' });
  options(
    preset,
    PRESETS.map((p) => [p.id, `${p.name}（${p.id}）`]),
    trial.preset,
  );
  preset.addEventListener('change', () => change(fromPreset(findPreset(preset.value)!)));
  const direction = h('p');
  updates.push(() => {
    preset.value = trial.preset;
    direction.textContent = findPreset(trial.preset)!.direction;
    toggle.textContent = `書体：${findPreset(trial.preset)!.name}${isPreset(trial) ? '' : '（調整あり）'}`;
  });

  // A select, a range with its value, or a checkbox, each bound to one setting.
  const select = (label: string, cls = '') => {
    const control = h('select');
    return { control, label: h('label', { class: cls }, h('span', { text: label }), control) };
  };
  const range = (label: string, { min, max }: { min: number; max: number }, step: number) => {
    const control = h('input', { type: 'range', min, max, step });
    const value = h('output');
    return { control, value, label: h('label', {}, h('span', {}, label, value), control) };
  };
  const check = (label: string, cls = '') => {
    const control = h('input', { type: 'checkbox' });
    return { control, label: h('label', { class: `font-trial-check ${cls}`.trim() }, control, label) };
  };

  const roleSet = (key: RoleKey, legend: string, kind: 'ja' | 'mono') => {
    const faces = FACES.filter((f) => f.kind === kind);
    const face = select('書体', 'font-trial-wide');
    const weight = select('太さ');
    const size = range('大きさ', SCALE, 1);
    const tracking = range('字間', TRACKING, 5);
    const palt = check('仮名を詰める（palt）');
    const set = (patch: Partial<RoleSetting>, later = false) =>
      change({ ...trial, [key]: { ...trial[key], ...patch } }, later);
    options(
      face.control,
      faces.map((f) => [f.id, f.note ? `${f.name}（${f.note}）` : f.name]),
      trial[key].face,
    );
    face.control.addEventListener('change', () => {
      const chosen = findFace(face.control.value)!;
      const w = trial[key].weight;
      set({ face: chosen.id, weight: chosen.weights.includes(w) ? w : nearest(chosen.weights, w) });
    });
    weight.control.addEventListener('change', () => set({ weight: Number(weight.control.value) }));
    size.control.addEventListener('input', () => set({ scale: Number(size.control.value) }, true));
    tracking.control.addEventListener('input', () => set({ tracking: Number(tracking.control.value) }, true));
    palt.control.addEventListener('change', () => set({ palt: palt.control.checked }));
    updates.push(() => {
      const r = trial[key];
      face.control.value = r.face;
      options(
        weight.control,
        findFace(r.face)!.weights.map((w) => [String(w), `${w} ${WEIGHT_NAMES[w]}`]),
        String(r.weight),
      );
      size.control.value = String(r.scale);
      size.value.textContent = `${r.scale}%`;
      tracking.control.value = String(r.tracking);
      tracking.value.textContent = em(r.tracking);
      palt.control.checked = r.palt;
    });
    return h(
      'fieldset',
      { 'data-role': key },
      h('legend', { text: legend }),
      h(
        'div',
        { class: 'font-trial-row' },
        face.label,
        weight.label,
        tracking.label,
        size.label,
        ...(kind === 'ja' ? [palt.label] : []),
      ),
    );
  };

  const latinSet = () => {
    const face = select('書体', 'font-trial-wide');
    const weight = select('太さ（文）');
    const size = range('大きさ', SCALE, 1);
    const headings = check('見出しにも使う（太さは見出しの太さに近いもの）', 'font-trial-wide');
    const set = (patch: Partial<TrialState['latin']>, later = false) =>
      change({ ...trial, latin: { ...trial.latin, ...patch } }, later);
    options(
      face.control,
      [
        ['own', '和文の書体のまま'],
        ...FACES.filter((f) => f.kind === 'latin').map((f): [string, string] => [f.id, f.name]),
      ],
      trial.latin.face,
    );
    face.control.addEventListener('change', () => {
      const chosen = findFace(face.control.value);
      const w = trial.latin.weight;
      set({ face: face.control.value, weight: chosen ? nearest(chosen.weights, w) : 400 });
    });
    weight.control.addEventListener('change', () => set({ weight: Number(weight.control.value) }));
    size.control.addEventListener('input', () => set({ scale: Number(size.control.value) }, true));
    headings.control.addEventListener('change', () => set({ headings: headings.control.checked }));
    updates.push(() => {
      const l = trial.latin;
      const chosen = findFace(l.face);
      face.control.value = l.face;
      options(
        weight.control,
        chosen ? chosen.weights.map((w) => [String(w), `${w} ${WEIGHT_NAMES[w]}`]) : [['400', '和文の太さ']],
        String(l.weight),
      );
      weight.control.disabled = !chosen;
      size.control.value = String(l.scale);
      size.value.textContent = `${l.scale}%`;
      headings.control.checked = l.headings;
    });
    return h(
      'fieldset',
      { 'data-role': 'latin' },
      h('legend', { text: '数字・欧文' }),
      h('div', { class: 'font-trial-row' }, face.label, weight.label, size.label, headings.label),
    );
  };

  const copy = h('button', { type: 'button', text: 'URL をコピー' });
  copy.addEventListener('click', () => {
    const url = location.origin + addressWith(encodeTrial(trial));
    navigator.clipboard
      ?.writeText(url)
      .then(() => (status.textContent = 'コピーしました'))
      .catch(() => (status.textContent = 'アドレスバーの URL をコピーしてください'));
  });
  const reset = h('button', { type: 'button', text: 'プリセットに戻す' });
  reset.addEventListener('click', () => change(fromPreset(findPreset(trial.preset)!)));
  const end = h('button', { type: 'button', text: 'お試しをやめる' });
  end.addEventListener('click', () => {
    keep(undefined);
    void apply(undefined);
    panel.remove();
    style.remove();
  });

  body.append(
    h('p', {
      text: '役割ごとに書体・太さ・字間・大きさを試す（一時的なもの。設定は URL とこのブラウザに残り、ほかのページでも続きます）',
    }),
    h('label', { class: 'font-trial-preset' }, 'プリセット', preset),
    direction,
    roleSet('hand', '見出し', 'ja'),
    roleSet('round', '文', 'ja'),
    latinSet(),
    roleSet('mono', 'コード', 'mono'),
    h('div', { class: 'font-trial-actions' }, copy, reset, end, status),
  );
  const panel = h('section', { class: 'font-trial', 'aria-label': '書体のお試し' }, body, toggle);
  for (const update of updates) update();
  document.head.append(style);
  document.body.append(panel);
}

/** Starts the trial from the page's `?font=` value (null if none). */
export function startFontTrial(param: string | null) {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {}
  const { state, panel, forget } = trialFrom(param, stored);
  if (forget) return keep(undefined);
  if (!panel) return;
  keep(state);
  void apply(state);
  showPanel(state);
  // A page opened from a link carries no `font`: it is written back, so the address stays shareable.
  document.addEventListener('cp20:navigation', () => {
    if (current) history.replaceState(history.state, '', addressWith(encodeTrial(current)));
  });
}
