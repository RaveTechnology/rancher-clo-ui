import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkCredential } from '../pkg/clo-ui/utils/credential.mjs';
import { Generation } from '../pkg/clo-ui/utils/catalog.mjs';

const good = { count: 0, result: [] };
const options = { intervalMs: 0 };

test('editing a hidden saved token verifies server reference and never overwrites it with blank input', async() => {
  const seen = [];
  let committed = false;
  const result = await checkCredential({ token: '', credentialId: 'cattle-global-data:cc-clo', proxy: { request: async(q) => { seen.push(q); return good; } }, options, commit: () => { committed = true; } });
  assert.equal(result, true);
  assert.equal(committed, false);
  assert.deepEqual(seen[0].authentication, { id: 'cattle-global-data:cc-clo', authSigner: 'bearer', passwordField: 'apiToken' });
});

test('new draft is committed once only after a successful fresh authentication check', async() => {
  let release;
  const committed = [];
  const pending = checkCredential({ token: ' Bearer candidate-token ', proxy: { request: (q) => {
    assert.equal(q.url.origin, 'https://api.clo.ru');
    assert.equal(q.url.href.includes('candidate-token'), false);
    assert.deepEqual(q.authentication, { token: 'candidate-token' });
    return new Promise((resolve) => { release = resolve; });
  } }, options, commit: (value) => committed.push(value) });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(committed, []);
  release(good);
  assert.equal(await pending, true);
  assert.deepEqual(committed, ['candidate-token']);
});

test('invalid, failed and superseded token checks return false and cannot commit a credential', async() => {
  let calls = 0;
  let committed = false;
  const errors = [];
  const common = { options, commit: () => { committed = true; }, onError: (code) => errors.push(code) };
  assert.equal(await checkCredential({ ...common, token: 'bad\nheader', proxy: { request: async() => { calls++; return good; } } }), false);
  assert.equal(calls, 0);
  assert.equal(await checkCredential({ ...common, token: 'candidate', proxy: { request: async() => { throw { status: 401, message: 'candidate' }; } } }), false);
  assert.equal(errors.includes('unauthorized'), true);
  assert.equal(errors.some((e) => e.includes('candidate')), false);
  const g = new Generation();
  const ticket = g.next();
  let finish;
  const stale = checkCredential({ ...common, token: 'candidate', isCurrent: () => g.isCurrent(ticket), proxy: { request: () => new Promise((resolve) => { finish = resolve; }) } });
  await new Promise((r) => setImmediate(r));
  g.invalidate();finish(good);
  assert.equal(await stale, false);
  assert.equal(committed, false);
});

test('credential verification does not enumerate the account projects', async() => {
  let calls = 0;
  let committed;
  const ok = await checkCredential({ token: 'candidate', options, commit: (value) => { committed = value; }, proxy: { request: async(q) => {
    calls++;
    assert.equal(q.url.search, '?limit=1&offset=0');

    return { count: 5000, result: [{ id: '11111111-1111-4111-8111-111111111111' }] };
  } } });
  assert.equal(ok, true);
  assert.equal(committed, 'candidate');
  assert.equal(calls, 1);
});
