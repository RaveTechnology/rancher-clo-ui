import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalog, Generation } from '../pkg/clo-ui/utils/catalog.mjs';

const project = '11111111-1111-4111-8111-111111111111';
const image = '22222222-2222-4222-8222-222222222222';
const address = '33333333-3333-4333-8333-333333333333';
const credential = { id: 'cattle-global-data:cc-clo' };
const fast = { intervalMs: 0 };

test('catalog emits only fixed CLO GET requests with server-side credential reference', async() => {
  const sent = [];
  const proxy = { request: async(q) => {
    sent.push(q);
    return { count: 1, result: [{ id: q.url.pathname.endsWith('/images') ? image : address }] };
  } };
  const c = createCatalog(proxy, credential, fast);
  assert.deepEqual(await c.images(project), [{ id: image }]);
  assert.deepEqual(await c.addresses(project), [{ id: address }]);
  assert.deepEqual(sent.map((q) => [q.method, q.url.href, q.authentication]), [
    ['GET', 'https://api.clo.ru/v2/projects/11111111-1111-4111-8111-111111111111/images?limit=100&offset=0', { id: 'cattle-global-data:cc-clo', authSigner: 'bearer', passwordField: 'apiToken' }],
    ['GET', 'https://api.clo.ru/v2/projects/11111111-1111-4111-8111-111111111111/addresses?limit=100&offset=0', { id: 'cattle-global-data:cc-clo', authSigner: 'bearer', passwordField: 'apiToken' }],
  ]);
  for (const bad of ['../../volumes', 'https://evil.test', `${ project }?token=secret`, `${ project }\n`]) {
    await assert.rejects(c.images(bad), { code: 'invalidScope' });
  }
  assert.equal(sent.length, 2, 'invalid scope reached the external proxy');
});

test('catalog drains real count/result envelope using bounded limit/offset pages', async() => {
  const pages = [{ count: 3, result: [{ id: project }, { id: image }] }, { count: 3, result: [{ id: address }] }];
  const offsets = [];
  const c = createCatalog({ request: async(q) => { offsets.push(q.url.search); return pages.shift(); } }, credential, { ...fast, pageSize: 2 });
  assert.deepEqual((await c.projects()).map((x) => x.id), [project, image, address]);
  assert.deepEqual(offsets, ['?limit=2&offset=0', '?limit=2&offset=2']);
});

test('catalog refuses incomplete, repeated and malformed inventory instead of silently dropping values', async() => {
  const scenarios = [
    [{ count: 2, result: [] }],
    [{ count: 1, result: 'unexpected' }],
    [{ count: -1, result: [] }],
    [{ count: 2, result: [{ id: project }] }, { count: 2, result: [{ id: project }] }],
    [{ count: 2, result: [{ id: project }] }, { count: 3, result: [{ id: image }] }],
    [{ count: 1, result: [{}] }],
  ];
  for (const pages of scenarios) {
    const c = createCatalog({ request: async() => pages.shift() }, credential, { ...fast, pageSize: 1 });
    await assert.rejects(c.projects(), { code: 'invalidInventory' });
  }
  let calls = 0;
  const bounded = createCatalog({ request: async() => { calls++; return { count: 1000, result: [{ id: project }] }; } }, credential, { ...fast, pageSize: 1, maxPages: 2 });
  await assert.rejects(bounded.projects(), { code: 'invalidInventory' });
  assert.equal(calls, 1);
  assert.deepEqual(await createCatalog({ request: async() => ({ count: 0, result: null }) }, credential, fast).projects(), []);
});

test('catalog never reflects secret-bearing proxy errors and has a bounded timeout', async() => {
  const c = createCatalog({ request: async() => { throw { status: 401, message: 'secret-value' }; } }, credential, fast);
  await assert.rejects(c.projects(), (e) => e.code === 'unauthorized' && !String(e).includes('secret-value'));
  const slow = createCatalog({ request: async() => new Promise(() => { /* Simulate a transport that never responds. */ }) }, credential, { ...fast, timeoutMs: 5 });
  await assert.rejects(slow.projects(), { code: 'timeout' });
  const normalized = createCatalog({ request: async() => { throw { _status: 403, message: 'secret-value' }; } }, credential, fast);
  await assert.rejects(normalized.projects(), { code: 'forbidden' });
});

test('stale scope response is rejected and cannot request the next page', async() => {
  const generation = new Generation();
  const ticket = generation.next();
  let finish;
  let calls = 0;
  const c = createCatalog({ request: () => { calls++; return new Promise((resolve) => { finish = resolve; }); } }, credential, { ...fast, pageSize: 1, isCurrent: () => generation.isCurrent(ticket) });
  const pending = c.projects();
  await new Promise((r) => setImmediate(r));
  generation.invalidate();
  finish({ count: 2, result: [{ id: project }] });
  await assert.rejects(pending, { code: 'stale' });
  assert.equal(calls, 1);
  assert.equal(generation.isCurrent(ticket), false);
});
