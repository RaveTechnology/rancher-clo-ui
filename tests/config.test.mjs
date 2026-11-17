import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, validateConfig, imageOptions, addressOptions } from '../pkg/clo-ui/utils/config.mjs';

const projectId = '11111111-1111-4111-8111-111111111111';
const imageId = '22222222-2222-4222-8222-222222222222';
const publicIpId = '33333333-3333-4333-8333-333333333333';
const base = { projectId, imageId, vcpus: 2, ramGb: 4, bootGb: 20, timeoutSeconds: 900, sshAddress: 'private', publicIpId: '' };
const pool = (config, quantity = 1) => ({ config: { ...config }, pool: { quantity } });

test('defaults apply only to missing create fields and do not mutate loaded configuration', () => {
  assert.deepEqual(defaults({ projectId, imageId }, 'create'), { ...base, vcpus: '2', ramGb: '4', bootGb: '20', timeoutSeconds: '900' });
  const loaded = { ...base, vcpus: 0, bootGb: '', sshAddress: 'public', publicIpId };
  assert.deepEqual(defaults(loaded, 'edit'), loaded);
  assert.deepEqual(defaults(loaded, 'create'), loaded);
  assert.deepEqual(defaults({ imageId }, 'view'), { imageId });
  assert.deepEqual(loaded, { ...base, vcpus: 0, bootGb: '', sshAddress: 'public', publicIpId });
});

test('missing numeric machine flags default to strings required by the actual CloConfig CRD', () => {
  const value = defaults({}, 'create');
  for (const key of ['vcpus', 'ramGb', 'bootGb', 'timeoutSeconds']) {
    assert.equal(typeof value[key], 'string', `${key} would be rejected by the native string schema`);
  }
});

test('configuration validation enforces actual driver ranges without replacing invalid input', () => {
  assert.deepEqual(validateConfig(base, 0, [pool(base)]), {});
  const cases = [
    ['projectId', '../projects'], ['imageId', ''], ['vcpus', 0], ['vcpus', 9],
    ['vcpus', 1.5], ['ramGb', 33], ['ramGb', ''], ['bootGb', 9],
    ['bootGb', Number.MAX_SAFE_INTEGER + 1], ['timeoutSeconds', 0], ['timeoutSeconds', 3601], ['sshAddress', 'automatic'],
  ];
  for (const [field, value] of cases) {
    const c = { ...base, [field]: value };
    assert.ok(validateConfig(c, 0, [pool(c)])[field], `${ field }=${ value } escaped validation`);
    assert.equal(c[field], value);
  }
  assert.ok(validateConfig({ ...base, sshAddress: 'public' }, 0, [pool(base)]).sshAddress);
});

test('public pool supports scale to zero, rejects more than one VM and autoscaling', () => {
  const c = { ...base, publicIpId };
  for (const quantity of [0, 1, '0', '1']) {
    assert.deepEqual(validateConfig(c, 0, [pool(c, quantity)]), {});
  }
  assert.ok(validateConfig(c, 0, [pool(c, 2)]).quantity);
  const automatic = pool(c, 1);
  automatic.pool.autoscalingMaxSize = 2;
  assert.ok(validateConfig(c, 0, [automatic]).quantity);
  assert.deepEqual(validateConfig(base, 0, [pool(base, 8)]), {});
});

test('one reserved IP cannot back two active pools, but a removed or zero pool does not block replacement', () => {
  const c = { ...base, publicIpId };
  assert.ok(validateConfig(c, 0, [pool(c), pool(c)]).publicIpId);
  assert.deepEqual(validateConfig(c, 0, [pool(c), pool(c, 0)]), {});
  assert.deepEqual(validateConfig(c, 0, [pool(c), { ...pool(c), remove: true }]), {});
  assert.deepEqual(validateConfig(c, 0, [pool(c, 0), pool(c)]), {});
});

test('catalogue options preserve selected IDs while restricting new image and address choices', () => {
  const ubuntu = { id: imageId, name: 'Ubuntu 24.04', operation_system: { os_family: 'linux', version: '24.04', distribution: 'Ubuntu' } };
  const windows = { ...ubuntu, id: publicIpId, operation_system: { os_family: 'windows', version: '2025', distribution: 'Windows' } };
  assert.deepEqual(imageOptions([ubuntu, windows], '').map((o) => o.value), [imageId]);
  assert.equal(imageOptions([], imageId)[0].value, imageId);
  const busy = { id: publicIpId, address: '192.0.2.8', external: true, version: 4, attached_to: { entity: 'server', id: projectId } };
  const free = { ...busy, id: imageId, address: '192.0.2.9', attached_to: null };
  assert.deepEqual(addressOptions([busy, free], '').map((o) => o.value), [imageId]);
  assert.deepEqual(addressOptions([busy, free], publicIpId).map((o) => o.value).sort(), [imageId, publicIpId].sort());
  assert.equal(addressOptions([], publicIpId)[0].value, publicIpId);
});

test('actual CLO Ubuntu 24 major-version image is available to new pools without admitting other releases', () => {
  const image = (id, distribution, version) => ({ id, name: `${distribution} ${version}`, operation_system: { os_family: 'linux', distribution, version } });
  const actual = image(imageId, 'ubuntu', '24');
  assert.deepEqual(imageOptions([actual], ''), [{ value: imageId, label: 'ubuntu 24' }]);
  for (const version of ['24.04', '24.04.5']) {
    assert.equal(imageOptions([image(imageId, 'ubuntu', version)], '').length, 1);
  }
  for (const version of ['22', '26', '24.10', '2404', '24.04-test']) {
    assert.deepEqual(imageOptions([image(imageId, 'ubuntu', version)], ''), []);
  }
  assert.deepEqual(imageOptions([image(imageId, 'debian', '24')], ''), []);
});
