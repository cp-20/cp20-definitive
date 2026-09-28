// Explicit integration test: creates one temporary anonymous user, removes its data and account.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
if (process.env.STAMPS_LIVE_TEST !== '1')
  throw Error('Set STAMPS_LIVE_TEST=1 to test the dedicated live stamps database');
const config = JSON.parse(await fs.readFile(new URL('../src/data/firebase.json', import.meta.url), 'utf8'));
assert.equal(
  config.databaseURL,
  'https://cp20-platform-portfolio-stamps.asia-southeast1.firebasedatabase.app',
);
const authResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  },
);
assert.equal(authResponse.status, 200, 'anonymous signup');
const { idToken, localId: uid } = await authResponse.json();
async function request(path, method = 'GET', body, token = idToken, params = {}) {
  const url = new URL(`${config.databaseURL}/${path}.json`);
  if (token) url.searchParams.set('auth', token);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const stamp = { anchor: 'intro', x: 0.3, y: 0.7, kind: 0, angle: -4, createdAt: { '.sv': 'timestamp' } };
const record = (s) => ({ updatedAt: { '.sv': 'timestamp' }, stamps: { 0: s } });
try {
  assert.equal(
    (await request('pages/home', 'GET', undefined, null)).status,
    401,
    'unbounded public read denied',
  );
  assert.equal(
    (await request('pages/home', 'GET', undefined, null, { orderBy: '"updatedAt"', limitToLast: '100' }))
      .status,
    200,
    'bounded public read allowed',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', record(stamp), null)).status,
    401,
    'unauthenticated write denied',
  );
  assert.equal(
    (await request('pages/home/someone-else', 'PUT', record(stamp))).status,
    401,
    'other owner write denied',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', record({ ...stamp, x: 2 }))).status,
    401,
    'out-of-range position denied',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', record({ ...stamp, kind: 99 }))).status,
    401,
    'unknown stamp denied',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', record({ ...stamp, html: '<script>' }))).status,
    401,
    'extra data denied',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', { updatedAt: { '.sv': 'timestamp' }, stamps: { 5: stamp } }))
      .status,
    401,
    'sixth slot denied',
  );
  assert.equal(
    (await request(`pages/fake-route/${uid}`, 'PUT', record(stamp))).status,
    401,
    'unknown page denied',
  );
  assert.equal(
    (await request(`pages/home/${uid}`, 'PUT', record(stamp))).status,
    200,
    'valid own stamp accepted',
  );
  assert.equal((await request(`pages/home/${uid}`, 'PUT', record(stamp))).status, 401, 'rapid repeat denied');
  assert.equal((await request(`pages/home/${uid}`, 'DELETE')).status, 200, 'own stamp removable');
  console.log('Firebase rules: 12 checks passed; temporary stamp removed');
} finally {
  await request(`pages/home/${uid}`, 'DELETE');
  const removed = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${config.apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) },
  );
  assert.equal(removed.status, 200, 'temporary auth account cleanup');
}
