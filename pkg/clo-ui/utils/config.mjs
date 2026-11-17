import { isUUID } from './catalog.mjs';

export function defaults(config, mode) {
  const result = { ...config };

  if (mode === 'create') {
    const initial = { vcpus: '2', ramGb: '4', bootGb: '20', timeoutSeconds: '900', sshAddress: 'private', publicIpId: '' };

    for (const [key, value] of Object.entries(initial)) {
      if (result[key] === undefined || result[key] === null) {
        result[key] = value;
      }
    }
  }

  return result;
}

const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) &&
  Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

export function validateConfig(config, poolIndex, machinePools = []) {
  const errors = {};

  for (const key of ['projectId', 'imageId']) {
    if (!isUUID(config[key])) {
      errors[key] = 'uuid';
    }
  }
  for (const [key, min, max] of [['vcpus', 1, 8], ['ramGb', 1, 32], ['bootGb', 10], ['timeoutSeconds', 1, 3600]]) {
    if (!integer(config[key], min, max)) {
      errors[key] = key;
    }
  }
  if (!['private', 'public'].includes(config.sshAddress) || config.sshAddress === 'public' && !config.publicIpId) {
    errors.sshAddress = 'sshAddress';
  }
  if (config.publicIpId) {
    if (!isUUID(config.publicIpId)) {
      errors.publicIpId = 'uuid';
    }
    const row = machinePools[poolIndex];

    if (!row || !integer(row.pool?.quantity, 0, 1) || row.pool.autoscalingMinSize !== undefined || row.pool.autoscalingMaxSize !== undefined) {
      errors.quantity = 'quantity';
    }
    if (Number(row?.pool?.quantity) > 0 && machinePools.some((other, index) =>
      index !== poolIndex && !other.remove && Number(other.pool?.quantity) > 0 &&
      other.config?.projectId === config.projectId && other.config?.publicIpId === config.publicIpId)) {
      errors.publicIpId = 'duplicateIP';
    }
  }

  return errors;
}

function preserve(options, selected, all) {
  if (selected && !options.some((item) => item.value === selected)) {
    const known = all.find((item) => item.id === selected);

    options.push({ value: selected, label: known?.name || known?.address || selected, saved: true, inUse: !!known?.attached_to });
  }

  return options;
}

export function imageOptions(images, selected) {
  return preserve(images.filter((item) =>
    item.operation_system?.distribution?.toLowerCase() === 'ubuntu' && /^24(?:\.04(?:\.\d+)*)?$/.test(item.operation_system?.version)
  ).map((item) => ({ value: item.id, label: item.name || item.id })), selected, images);
}

export function addressOptions(addresses, selected) {
  return preserve(addresses.filter((item) => item.external === true && Number(item.version) === 4 && !item.attached_to)
    .map((item) => ({ value: item.id, label: item.address || item.id })), selected, addresses);
}
