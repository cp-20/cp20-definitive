// Integration test of storage.rules on the Cloud Storage emulator:
//   STORAGE_RULES_EMULATOR=127.0.0.1:9199 node scripts/firebase/storage-check.ts
// (run inside `firebase emulators:exec --only storage`). Unsigned tokens stand in for sign-ins.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { avatarUpload } from '../../src/stamps/avatar.ts';
const emulator = process.env.STORAGE_RULES_EMULATOR;
if (!emulator) throw Error('Set STORAGE_RULES_EMULATOR=host:port');
const { storageBucket } = JSON.parse(
  await fs.readFile(new URL('../../src/data/firebase.json', import.meta.url), 'utf8'),
);
const base = `http://${emulator}/v0/b/${storageBucket}/o`;
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (uid: string, provider = 'google.com') => {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
    sub: uid,
    user_id: uid,
    iat: now,
    exp: now + 3600,
    firebase: { sign_in_provider: provider },
  })}.`;
};
const object = (name: string) => `${base}/${encodeURIComponent(name)}`;
const upload = (name: string, as: string | null, type = 'image/webp', bytes = 2000) =>
  fetch(`${base}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': type, ...(as ? { Authorization: `Firebase ${as}` } : {}) },
    body: new Uint8Array(bytes),
  });
let checks = 0;
const expect = async (response: Promise<Response>, ok: boolean, label: string) => {
  const r = await response;
  assert.equal(r.ok, ok, `${label}: HTTP ${r.status}`);
  checks++;
};
const alice = token('alice'),
  bob = token('bob');
{
  // The way the site uploads: multipart, with the picture's type, cache time and source as metadata.
  const { url, init } = avatarUpload(
    'alice',
    new Blob([new Uint8Array(3000)], { type: 'image/webp' }),
    alice,
    'google',
    `http://${emulator}`,
  );
  await expect(fetch(url, init), true, 'owner uploads a WebP the way the site does');
  const meta = await (await fetch(object('avatars/alice'))).json();
  assert.deepEqual(
    [meta.contentType, meta.cacheControl, Number(meta.size), meta.metadata?.source],
    ['image/webp', 'public, max-age=300', 3000, 'google'],
  );
  checks++;
}
await expect(upload('avatars/alice', alice), true, 'owner uploads a WebP');
await expect(upload('avatars/alice', alice, 'image/jpeg'), true, 'owner replaces it with a JPEG');
await expect(fetch(`${object('avatars/alice')}?alt=media`), true, 'anyone loads it');
await expect(upload('avatars/alice', bob), false, 'another account cannot overwrite it');
await expect(upload('avatars/alice', null), false, 'a visitor not signed in cannot upload');
await expect(
  upload('avatars/alice', token('alice', 'anonymous')),
  false,
  'an anonymous account cannot upload',
);
await expect(upload('avatars/alice', alice, 'image/svg+xml'), false, 'SVG denied');
await expect(upload('avatars/alice', alice, 'image/png'), false, 'PNG denied');
await expect(upload('avatars/alice', alice, 'image/webp', 64 * 1024 + 1), false, 'over 64KB denied');
await expect(upload('other/alice', alice), false, 'nothing outside avatars/');
await expect(fetch(`${base}?prefix=avatars/`), false, 'the pictures cannot be listed');
await expect(
  fetch(object('avatars/alice'), { method: 'DELETE', headers: { Authorization: `Firebase ${bob}` } }),
  false,
  'another account cannot delete it',
);
await expect(
  fetch(object('avatars/alice'), { method: 'DELETE', headers: { Authorization: `Firebase ${alice}` } }),
  true,
  'owner deletes it',
);
await expect(fetch(`${object('avatars/alice')}?alt=media`), false, 'gone once deleted');
console.log(`storage.rules: ${checks} checks passed`);
