// Firebase REST streaming uses replacement (put) and relative multi-path updates (patch).
export function applyStreamEvent(current, type, event) {
  let root = current;
  const set = (path, value) => {
    const keys = path.split('/').filter(Boolean);
    if (keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key)))
      throw Error('Invalid path');
    if (!keys.length) {
      root = value || {};
      return;
    }
    let node = root;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    const key = keys.at(-1);
    if (value === null) delete node[key];
    else node[key] = value;
  };
  if (type === 'put') set(event.path, event.data);
  else for (const [key, value] of Object.entries(event.data || {})) set(`${event.path}/${key}`, value);
  return root;
}
