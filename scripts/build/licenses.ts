// Third-party notices for what the built site ships: every npm package bundled into the client
// JavaScript or rendered into the prerendered HTML (the SSR build's external imports, such as the
// Lucide icons), plus the fonts and graphics that are copied in outside the bundler. Minified
// bundles drop the packages' @license comments, so the notices are collected at build time and
// written to /third-party-licenses.txt, which the credits section links to.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

export const licensesPath = 'third-party-licenses.txt';
const vendored = new URL('../../licenses/', import.meta.url);

type Notice = {
  name: string;
  version?: string;
  license: string;
  homepage?: string;
  copyright: string[];
  text: string;
};

/** The installed package directory a module id belongs to, or undefined outside node_modules. */
export function packageDirectory(id: string) {
  const path = id.replace(/^\0/, '').split('?')[0].replaceAll('\\', '/');
  const m = /^((?:.*\/)?node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(path);
  return m?.[1];
}

/** The package name of a bare import specifier (`lucide`, `@solidjs/web/storage`), else undefined. */
export function bareName(specifier: string) {
  if (/^(\.|\/|\0|[a-z]+:)/i.test(specifier)) return;
  const parts = specifier.split('/');
  return (specifier.startsWith('@') ? parts.slice(0, 2) : parts.slice(0, 1)).join('/');
}

// Copyright lines from the package's own sources, for packages that ship no LICENSE file
// (Firebase keeps its notices in `@license` comments, Solid only in package.json).
function copyrightLines(directory: string) {
  const lines = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.m?js$/.test(entry.name))
        for (const m of readFileSync(path, 'utf8').matchAll(/Copyright (?:\(c\) )?\d{4}[^\n*]{0,80}/g))
          lines.add(m[0].trim());
    }
  };
  walk(directory);
  return [...lines].sort();
}

/**
 * The license text of one installed package: its own LICENSE file, or for Apache-2.0 / MIT
 * packages without one, the vendored license text with the copyright notices found in its sources
 * (or its package.json author). Any other package without a LICENSE file fails the build.
 */
export function packageLicense(directory: string): Notice {
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const file = readdirSync(directory).find((name) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
  const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
  const info = { name: pkg.name, version: pkg.version, license: pkg.license, homepage: pkg.homepage };
  if (file) return { ...info, copyright: [], text: readFileSync(join(directory, file), 'utf8').trim() };
  if (pkg.license !== 'Apache-2.0' && pkg.license !== 'MIT')
    throw Error(`${pkg.name}: no LICENSE file for license ${pkg.license}`);
  const copyright = copyrightLines(directory);
  if (!copyright.length && author) copyright.push(`Copyright (c) ${author}`);
  if (!copyright.length) throw Error(`${pkg.name}: no LICENSE file and no copyright notice`);
  return { ...info, copyright, text: readFileSync(new URL(`${pkg.license}.txt`, vendored), 'utf8').trim() };
}

/** Notices for assets that do not come from an npm package bundled by Vite. */
export const extraNotices: Notice[] = [
  {
    name: 'Zen Maru Gothic (fonts/zen-maru-gothic, subset at build time)',
    license: 'OFL-1.1',
    homepage: 'https://github.com/googlefonts/zen-marugothic',
    copyright: [],
    text: readFileSync(new URL('../../fonts/zen-maru-gothic/OFL.txt', import.meta.url), 'utf8').trim(),
  },
  {
    name: 'Yusei Magic (fonts/yusei-magic, subset at build time)',
    license: 'OFL-1.1',
    homepage: 'https://github.com/tanukifont/YuseiMagic',
    copyright: [],
    text: readFileSync(new URL('../../fonts/yusei-magic/OFL.txt', import.meta.url), 'utf8').trim(),
  },
  {
    name: 'Twemoji graphics (the picture stickers in /stamps and the clover in the QR code)',
    license: 'CC-BY-4.0',
    homepage: 'https://github.com/jdecked/twemoji',
    copyright: [],
    text: [
      'Copyright 2019 Twitter, Inc and other contributors.',
      'Graphics licensed under CC-BY 4.0: https://creativecommons.org/licenses/by/4.0/',
      'Files and full license text: https://cp20.dev/stamps/LICENSE-GRAPHICS.txt',
    ].join('\n'),
  },
];

/**
 * The notices file. Packages that share an identical license text (the Firebase packages, which
 * carry only Apache-2.0 `@license` comments) are listed together, each with its own copyright
 * lines, followed by that text once.
 */
export function formatNotices(notices: Notice[]) {
  const groups = new Map<string, Notice[]>();
  for (const notice of [...notices].sort((a, b) => a.name.localeCompare(b.name))) {
    const group = groups.get(notice.text) ?? [];
    group.push(notice);
    groups.set(notice.text, group);
  }
  const rule = '='.repeat(72);
  return `${[
    'Third-party software, fonts and graphics included in cp20.dev',
    'The site bundles or embeds the following works. Each is used under the license below.',
    ...[...groups].map(([text, group]) =>
      [
        rule,
        ...group.map((n) =>
          [
            `${n.name}${n.version ? `@${n.version}` : ''} (${n.license})${n.homepage ? ` ${n.homepage}` : ''}`,
            ...n.copyright.map((line) => `  ${line}`),
          ].join('\n'),
        ),
        '-'.repeat(72),
        text,
      ].join('\n'),
    ),
  ].join('\n\n')}\n`;
}

/**
 * Vite plugin: records the packages of every environment's bundle (module ids under node_modules,
 * plus bare external imports of the SSR build) and writes the notices file into the client output
 * after each environment, so the last write covers all of them.
 */
// The client and SSR environments load the config, and so this plugin, separately: share the
// package directories of each environment through globalThis, keyed by environment name.
const key = Symbol.for('cp20.third-party-licenses');
const shared: Map<string, Set<string>> = ((globalThis as Record<symbol, unknown>)[key] ??= new Map()) as Map<
  string,
  Set<string>
>;
export function thirdPartyLicenses(): Plugin {
  let root = process.cwd();
  let clientOut = '';
  return {
    name: 'cp20-third-party-licenses',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      clientOut = join(root, config.environments?.client?.build?.outDir ?? 'dist/client');
    },
    generateBundle(_, bundle) {
      const directories = new Set<string>();
      shared.set(this.environment?.name ?? 'client', directories);
      for (const id of this.getModuleIds()) {
        const directory = packageDirectory(id);
        if (directory) directories.add(resolve(root, directory));
      }
      // Files copied as assets, such as the IBM Plex Mono WOFF2 referenced from app.css.
      for (const asset of Object.values(bundle))
        if (asset.type === 'asset')
          for (const name of asset.originalFileNames ?? []) {
            const directory = packageDirectory(name);
            if (directory) directories.add(resolve(root, directory));
          }
      for (const chunk of Object.values(bundle))
        if (chunk.type === 'chunk')
          for (const specifier of [...chunk.imports, ...chunk.dynamicImports]) {
            const name = bareName(specifier);
            if (name && existsSync(join(root, 'node_modules', name, 'package.json')))
              directories.add(join(root, 'node_modules', name));
          }
    },
    async writeBundle() {
      // Packages that only re-export another package (firebase/app → @firebase/app) are listed too.
      const directories = new Set([...shared.values()].flatMap((set) => [...set]));
      const notices = [...directories].map(packageLicense).concat(extraNotices);
      const out = join(clientOut, licensesPath);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, formatNotices(notices));
      this.info?.(`${relative(root, out)}: ${notices.length} notices`);
    },
  };
}
