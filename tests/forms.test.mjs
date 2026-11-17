import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRenderer, nextTick, reactive, watch } from 'vue';
import { readFile } from 'node:fs/promises';
import { parse as parseSFC } from '@vue/compiler-sfc';
import { parse as parseJS } from '@babel/parser';
import CredentialForm from '../pkg/clo-ui/utils/credential-form.mjs';
import MachineForm from '../pkg/clo-ui/utils/machine-form.mjs';

// Real Vue props/lifecycle/watchers, with a non-DOM renderer. Native template
// controls and their actual parent hosts are exercised by the lab browser.
const renderer = createRenderer({
  patchProp() { /* No DOM attributes in this renderer. */ }, insert(node, parent) { node.parent = parent; }, remove() { /* No DOM node to remove. */ },
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText() { /* No DOM text. */ }, setElementText() { /* No DOM text. */ }, parentNode: (node) => node.parent, nextSibling: () => null,
});
function mount(component, props, proxy) {
  const events = [];
  const app = renderer.createApp({ ...component, render: () => null }, { ...props, onValidationChanged: (value) => events.push(value) });
  app.config.globalProperties.$shell = { proxy };
  app.config.globalProperties.t = (key) => key;
  const vm = app.mount({});

  return { vm, events, unmount: () => app.unmount() };
}
async function loaded(vm) {
  await nextTick();
  if (!vm.loading) {
    return;
  }
  await new Promise((resolve) => {
    const stop = watch(() => vm.loading, (value) => { if (!value) { stop(); resolve(); } });
  });
}
const p1 = '11111111-1111-4111-8111-111111111111';
const p2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const i1 = '22222222-2222-4222-8222-222222222222';
const i2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ip = '33333333-3333-4333-8333-333333333333';
const config = () => ({ projectId: p1, imageId: i1, vcpus: 2, ramGb: 4, bootGb: 20, timeoutSeconds: 900, sshAddress: 'private', publicIpId: '' });
const os = { os_family: 'linux', distribution: 'Ubuntu', version: '24.04' };
function machine(props, proxy) {
  const value = reactive(props.value || config());
  const machinePools = reactive([{ config: value, pool: { quantity: 1 } }]);

  return mount(MachineForm, { mode: 'edit', credentialId: 'cattle-global-data:cc-clo', ...props, value, machinePools }, proxy);
}

test('credential native adapter keeps hidden token, returns boolean and never reads decodedData on edit', async() => {
  let changed = false;
  const value = { id: 'cattle-global-data:cc-clo', setData() { changed = true; }, get decodedData() { throw new Error('private token must remain hidden'); } };
  const form = mount(CredentialForm, { value, mode: 'edit' }, { request: async() => ({ count: 0, result: [] }) });
  assert.equal(await form.vm.test(), true);
  assert.equal(changed, false);
  form.unmount();
});

test('native credential host receives validation readiness without exposing or eagerly saving the draft', async() => {
  let mutations = 0;
  let calls = 0;
  const value = { setData() { mutations++; } };
  const proxy = { request: async() => { calls++; return { count: 0, result: [] }; } };
  const form = mount(CredentialForm, { value, mode: 'create' }, proxy);
  assert.equal(form.events.at(-1), false);
  form.vm.draftToken = 'candidate';await nextTick();
  assert.equal(form.events.at(-1), true);
  assert.equal(mutations, 0);
  assert.equal(calls, 0);
  form.vm.draftToken = '';await nextTick();
  assert.equal(form.events.at(-1), false);
  form.unmount();
  const edit = mount(CredentialForm, { value: { id: 'cattle-global-data:cc-clo' }, mode: 'edit' }, proxy);
  assert.equal(edit.events.at(-1), true);
  edit.unmount();
});

test('credential native adapter cannot commit a response after token change or component unmount', async() => {
  const commits = [];
  let finish;
  const form = mount(CredentialForm, { value: { setData: (...args) => commits.push(args) }, mode: 'create' }, { request: () => new Promise((resolve) => { finish = resolve; }) });
  form.vm.draftToken = 'first';await nextTick();
  const pending = form.vm.test();
  await new Promise((resolve) => setImmediate(resolve));
  form.vm.draftToken = 'second';await nextTick();
  finish({ count: 0, result: [] });
  assert.equal(await pending, false);
  assert.deepEqual(commits, []);
  const last = form.vm.test();
  await new Promise((resolve) => setImmediate(resolve));
  form.unmount();finish({ count: 0, result: [] });
  assert.equal(await last, false);
  assert.deepEqual(commits, []);
});

test('view adapters do not call external API or write configuration', async() => {
  let calls = 0;
  const proxy = { request: () => { calls++; throw new Error('view must not request'); } };
  const before = config();
  const a = machine({ value: before, mode: 'view' }, proxy);
  const b = mount(CredentialForm, { value: { id: 'hidden' }, mode: 'view' }, proxy);
  await nextTick();await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 0);
  assert.deepEqual(before, config());
  a.unmount();b.unmount();
});

test('machine adapter preserves edit on inventory failure and enables explicit manual fallback', async() => {
  const value = { ...config(), publicIpId: ip };
  const form = machine({ value }, { request: async() => { throw { status: 503, message: 'private-body' }; } });
  await loaded(form.vm);
  assert.equal(form.vm.errorCode, 'unavailable');
  assert.equal(form.vm.value.imageId, i1);
  assert.equal(form.vm.value.publicIpId, ip);
  form.vm.manual = true;await nextTick();
  assert.equal(await form.vm.test(), true);
  form.vm.machinePools[0].pool.quantity = 2;await nextTick();
  assert.ok((await form.vm.test()).errors.length > 0);
  assert.equal(form.events.at(-1), false);
  form.vm.machinePools[0].pool.quantity = 0;await nextTick();
  assert.equal(await form.vm.test(), true);
  form.unmount();
});

test('native host busy state does not invalidate an otherwise valid machine configuration', async() => {
  const form = machine({ busy: true }, { request: async() => ({ count: 0, result: [] }) });
  form.vm.manual = true;await nextTick();
  assert.equal(await form.vm.test(), true);
  form.unmount();
});

test('invalid machine configuration is rejected by the actual pinned Rancher MachinePool test adapter', async() => {
  // One characterization boundary: this host ignores plain false, unlike its
  // credential counterpart. Execute the actual pinned method, not a copied fake.
  const file = new URL('../node_modules/@rancher/shell/edit/provisioning.cattle.io.cluster/tabs/MachinePool.vue', import.meta.url);
  const script = parseSFC(await readFile(file, 'utf8')).descriptor.script.content;
  const ast = parseJS(script, { sourceType: 'module' });
  const component = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration').declaration;
  const methods = component.properties.find((node) => node.key?.name === 'methods').value;
  const testMethod = methods.properties.find((node) => node.key?.name === 'test');
  const nativeTest = Function(`return ({${script.slice(testMethod.start, testMethod.end)}}).test`)();
  const form = machine({ value: { ...config(), vcpus: 9 } }, { request: async() => ({ count: 0, result: [] }) });
  form.vm.manual = true;await nextTick();
  const errors = await nativeTest.call({ $refs: { configComponent: form.vm } });
  assert.ok(errors.length > 0, 'Rancher host would proceed despite invalid config');
  form.unmount();
});

test('machine adapter discards old project response while clearing only explicit project dependencies', { timeout: 12000 }, async() => {
  let oldResponse;
  const proxy = { request: async(q) => {
    if (q.url.pathname === '/v2/projects') {
      return { count: 2, result: [{ id: p1, name: 'first', status: 'ACTIVE' }, { id: p2, name: 'second', status: 'ACTIVE' }] };
    }
    if (q.url.pathname.includes(p1) && q.url.pathname.endsWith('/images')) {
      return new Promise((resolve) => { oldResponse = resolve; });
    }
    if (q.url.pathname.endsWith('/images')) {
      return { count: 1, result: [{ id: i2, name: 'Ubuntu 24.04', operation_system: os }] };
    }

    return { count: 0, result: [] };
  } };
  const form = machine({ value: { ...config(), vcpus: 6 } }, proxy);
  await new Promise((resolve) => {
    const timer = setInterval(() => { if (oldResponse) { clearInterval(timer); resolve(); } }, 10);
  });
  form.vm.selectProject(p2);
  await loaded(form.vm);
  oldResponse({ count: 1, result: [{ id: i1, name: 'stale', operation_system: os }] });
  await nextTick();await new Promise((resolve) => setImmediate(resolve));
  assert.equal(form.vm.value.projectId, p2);
  assert.equal(form.vm.value.imageId, '');
  assert.equal(form.vm.value.vcpus, 6);
  assert.deepEqual(form.vm.images.map((x) => x.id), [i2]);
  assert.equal(form.vm.errorCode, '');
  form.unmount();
});
