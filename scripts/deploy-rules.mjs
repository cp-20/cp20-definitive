// npm run firebase:rules: the manual counterpart of the "Firebase rules" workflow (prefer running
// that workflow with "Run workflow"). It applies the same checks before deploying:
// 1. database.rules.json matches the page list (rules.mjs --check);
// 2. the deployed files are the same as origin/main right now, so an old branch or an unsaved
//    edit never overwrites newer rules;
// 3. the rules pass the emulator integration test (needs Java);
// then deploys with the same pinned Firebase CLI as the workflow (never a global install).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const workflow = readFileSync(new URL('../.github/workflows/firebase-rules.yml', import.meta.url), 'utf8');
/** The workflow's pinned CLI (`FIREBASE_TOOLS: firebase-tools@x.y.z`). */
export const firebaseTools = workflow.match(/FIREBASE_TOOLS: (firebase-tools@\d+\.\d+\.\d+)/)?.[1];
export const deployedFiles = ['database.rules.json', 'firebase.json', '.firebaserc'];

/** @param {string} command @param {string[]} args @param {NodeJS.ProcessEnv} [env] */
const run = (command, args, env = process.env) =>
  execFileSync(command, args, { cwd: root, env, stdio: 'inherit' });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!firebaseTools) throw new Error('FIREBASE_TOOLS is not pinned in .github/workflows/firebase-rules.yml');
  run(process.execPath, ['scripts/rules.mjs', '--check']);
  run('git', ['fetch', '--quiet', 'origin', 'main']);
  try {
    // Compares the working tree (including uncommitted edits) with the fetched main.
    run('git', ['diff', '--quiet', 'FETCH_HEAD', '--', ...deployedFiles]);
  } catch {
    console.error(
      `Not deploying: ${deployedFiles.join(', ')} differ from origin/main. Deploy from an up-to-date main.`,
    );
    process.exit(1);
  }
  // The emulator port comes from firebase.json, as in the workflow.
  run(
    'npx',
    [
      '--yes',
      firebaseTools,
      'emulators:exec',
      '--project',
      'cp20-platform',
      '--only',
      'database',
      'node scripts/stamps-rules.mjs',
    ],
    { ...process.env, STAMPS_RULES_EMULATOR: '127.0.0.1:9000' },
  );
  run('npx', [
    '--yes',
    firebaseTools,
    'deploy',
    '--only',
    'database:portfolio-stamps',
    '--project',
    'cp20-platform',
  ]);
}
