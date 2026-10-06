// Explicit integration test against the dedicated live stamps database.
// Always: public reads are bounded, and visitors without a Google account cannot write
// (a temporary anonymous account is created and deleted, if anonymous sign-in is enabled).
// With STAMPS_GOOGLE_ID_TOKEN (an ID token of a Google sign-in, e.g. copied from a browser
// session), also checks validation with a real writer and removes the test stamp.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
if (process.env.STAMPS_LIVE_TEST !== '1')
  throw Error('Set STAMPS_LIVE_TEST=1 to test the dedicated live stamps database');
const config = JSON.parse(await fs.readFile(new URL('../src/data/firebase.json', import.meta.url), 'utf8'));
assert.equal(
  config.databaseURL,
  'https://cp20-platform-portfolio-stamps.asia-southeast1.firebasedatabase.app',
);
async function request(path, method = 'GET', body, token, params = {}) {
  const url = new URL(`${config.databaseURL}/${path}.json`);
  if (token) url.searchParams.set('auth', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const uidOf = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id;
const avatar = 'a'.repeat(64);
const stamp = { anchor: 'intro', x: 0.3, y: 0.7, kind: 0, angle: -4, createdAt: { '.sv': 'timestamp' } };
const record = (s, extra = {}) => ({ updatedAt: { '.sv': 'timestamp' }, stamps: { 0: s }, avatar, ...extra });
let checks = 0;
const expect = async (response, status, label) => {
  assert.equal((await response).status, status, label);
  checks++;
};

await expect(request('pages/home'), 401, 'unbounded public read denied');
await expect(
  request('pages/home', 'GET', undefined, null, { orderBy: '"updatedAt"', limitToLast: '100' }),
  200,
  'bounded public read allowed',
);
await expect(request('pages/home/someone', 'PUT', record(stamp)), 401, 'unauthenticated write denied');

const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ returnSecureToken: true }),
});
if (signUp.ok) {
  const { idToken, localId } = await signUp.json();
  try {
    await expect(
      request(`pages/home/${localId}`, 'PUT', record(stamp), idToken),
      401,
      'anonymous account write denied',
    );
  } finally {
    await request(`pages/home/${localId}`, 'DELETE', undefined, idToken);
    await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  }
} else console.log('Anonymous sign-in is disabled; skipped the anonymous write check');

const google = process.env.STAMPS_GOOGLE_ID_TOKEN;
if (google) {
  const uid = uidOf(google);
  const put = (body) => request(`pages/home/${uid}`, 'PUT', body, google);
  try {
    await expect(
      request('pages/home/someone-else', 'PUT', record(stamp), google),
      401,
      'other owner write denied',
    );
    await expect(put(record({ ...stamp, x: 2 })), 401, 'out-of-range position denied');
    await expect(put(record({ ...stamp, kind: 99 })), 401, 'unknown stamp denied');
    await expect(put(record({ ...stamp, html: '<script>' })), 401, 'extra stamp data denied');
    await expect(put(record(stamp, { avatar: 'https://example.com/a.png' })), 401, 'non-hash avatar denied');
    await expect(put(record(stamp, { email: 'a@example.com' })), 401, 'extra record data denied');
    await expect(
      put({ updatedAt: { '.sv': 'timestamp' }, stamps: { 5: stamp }, avatar }),
      401,
      'sixth slot denied',
    );
    await expect(
      request(`pages/fake-route/${uid}`, 'PUT', record(stamp), google),
      401,
      'unknown page denied',
    );
    await expect(put(record(stamp)), 200, 'valid own stamp accepted');
    await expect(put(record(stamp)), 401, 'rapid repeat denied');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(request(`pages/home/${uid}`, 'DELETE', undefined, google), 200, 'own stamp removable');
  } finally {
    await request(`pages/home/${uid}`, 'DELETE', undefined, google);
  }
} else console.log('Set STAMPS_GOOGLE_ID_TOKEN to also check validation with a Google account');
console.log(`Firebase rules: ${checks} checks passed`);
