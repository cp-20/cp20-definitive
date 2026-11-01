// Builds database.rules.json (the stamp database's security rules) from the page list and the
// sticker limits, so a new work's page can hold stickers as soon as its rules are deployed.
// npm run rules: rewrites the file. --check: exits 1 instead if the committed file differs (CI and
// npm run firebase:rules). Only imports node built-ins and dependency-free modules.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { mergeWorks, stampPageKeys } from '../../src/site/pages.ts';
import {
  ANCHOR_PATTERN,
  MAX_ANGLE,
  STAMPS_PER_PAGE,
  STICKER_KIND_COUNT,
  WRITE_INTERVAL_MS,
} from '../../src/stamps/limits.ts';

const KEY_PATTERN = /^[a-z0-9-]+$/;

// A write can attach a `.priority` to any node, and no type or $other check sees it, yet the
// public stream delivers it to every visitor. So every validated node under a visitor's own
// paths also requires that no priority is set.
type Rules = { [key: string]: string | boolean | string[] | Rules };
function withoutPriority(node: Rules): Rules {
  const out: Rules = {};
  for (const [key, value] of Object.entries(node))
    out[key] =
      key === '.validate' && typeof value === 'string'
        ? `newData.getPriority() == null && (${value})`
        : value && typeof value === 'object' && !Array.isArray(value)
          ? withoutPriority(value as Rules)
          : value;
  return out;
}

/** @param pageKeys every page that may hold stickers (see stampPageKeys) */
export function buildRules(pageKeys: readonly string[]) {
  if (!pageKeys.length) throw Error('No pages');
  for (const key of pageKeys)
    if (!KEY_PATTERN.test(key)) throw Error(`Page key ${JSON.stringify(key)} cannot go into the rules`);
  if (STAMPS_PER_PAGE < 1 || STAMPS_PER_PAGE > 10) throw Error('Slots must be single digits');
  // Written by the visitor alongside each record write; see src/stamps/write.ts.
  const throttled = `newData.parent().parent().parent().child('throttle').child(auth.uid).child('at').val() == now`;
  const signedInOwner = `auth != null && auth.uid == $uid && auth.token.firebase.sign_in_provider == 'google.com'`;
  const number = (min: number, max: number, extra = '') =>
    `newData.isNumber() && newData.val() >= ${min} && newData.val() <= ${max}${extra}`;
  return {
    rules: {
      '.read': false,
      '.write': false,
      pages: {
        $page: {
          // Only the site's own pages, so nobody can fill the database under made-up keys.
          '.validate': `$page.matches(/^(${pageKeys.join('|')})$/)`,
          '.indexOn': ['updatedAt'],
          // Public reads are bounded to the 100 most recently updated visitors.
          '.read':
            "query.orderByChild == 'updatedAt' && query.limitToLast != null && query.limitToLast <= 100",
          $uid: withoutPriority({
            '.read': 'auth != null && auth.uid == $uid',
            // Google accounts only, own record only, and only together with a throttle update.
            '.write': `${signedInOwner} && (!newData.exists() || ${throttled})`,
            '.validate':
              "newData.hasChildren(['updatedAt','stamps']) && newData.child('updatedAt').val() == now",
            updatedAt: {
              '.validate': 'newData.val() == now',
            },
            stamps: {
              '.validate': 'newData.hasChildren()',
              $slot: {
                '.validate': `$slot.matches(/^[0-${STAMPS_PER_PAGE - 1}]$/) && newData.hasChildren(['anchor','x','y','kind','angle','createdAt'])`,
                anchor: {
                  '.validate': `newData.isString() && newData.val().matches(/${ANCHOR_PATTERN}/)`,
                },
                // Positions are fractions of the anchor's box.
                x: { '.validate': number(0, 1) },
                y: { '.validate': number(0, 1) },
                kind: { '.validate': number(0, STICKER_KIND_COUNT - 1, ' && newData.val() % 1 == 0') },
                angle: { '.validate': number(-MAX_ANGLE, MAX_ANGLE) },
                // A moved sticker keeps its age.
                createdAt: {
                  '.validate':
                    'newData.isNumber() && (newData.val() == now || (data.exists() && newData.val() == data.val()))',
                },
                $other: { '.validate': false },
              },
            },
            // The Gravatar hash shown on the visitor's stickers.
            avatar: {
              '.validate': 'newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)',
            },
            $other: { '.validate': false },
          }),
        },
      },
      // The time of each account's last write. It outlives deleted records, and `prev` must be
      // the value read before writing (a compare-and-swap between tabs).
      throttle: {
        $uid: withoutPriority({
          '.read': 'auth != null && auth.uid == $uid',
          '.write': `${signedInOwner} && newData.exists() && (!data.exists() || now >= data.child('at').val() + ${WRITE_INTERVAL_MS})`,
          '.validate':
            "newData.hasChildren(['at','prev']) && newData.child('at').val() == now && ((!data.exists() && newData.child('prev').val() == 0) || (data.exists() && newData.child('prev').val() == data.child('at').val()))",
          at: { '.validate': 'newData.isNumber()' },
          prev: { '.validate': 'newData.isNumber()' },
          $other: { '.validate': false },
        }),
      },
    },
  };
}

/** The file's layout: two-space JSON with one-element arrays kept on one line. */
export const formatRules = (rules: unknown) =>
  JSON.stringify(rules, null, 2).replace(/\[\n\s+("[^"\n]*")\n\s+\]/g, '[$1]') + '\n';

/** What database.rules.json should contain for the current works.json and manual.json. */
export async function generatedRules() {
  const load = async (name: string) =>
    JSON.parse(await readFile(new URL(`../../src/data/${name}.json`, import.meta.url), 'utf8'));
  const [works, manual] = await Promise.all([load('works'), load('manual')]);
  return formatRules(buildRules(stampPageKeys(mergeWorks(works, manual))));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL('../../database.rules.json', import.meta.url);
  const next = await generatedRules();
  const current = await readFile(file, 'utf8').catch(() => null);
  if (process.argv.includes('--check')) {
    if (current !== next) {
      console.error('database.rules.json is out of date — run npm run rules');
      process.exit(1);
    }
    console.log('database.rules.json is up to date');
  } else if (current === next) console.log('database.rules.json is up to date');
  else {
    await writeFile(file, next);
    console.log('Wrote database.rules.json');
  }
}
