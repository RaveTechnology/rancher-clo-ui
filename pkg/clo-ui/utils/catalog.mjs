export class CatalogError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export class Generation {
  value = 0;
  next() { return ++this.value; }
  invalidate() { this.value++; }
  isCurrent(ticket) { return ticket === this.value; }
}

export const isUUID = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function normalizeToken(value) {
  const token = String(value ?? '').trim().replace(/^bearer\s+/i, '');

  if (token.length > 4096 || /\s/.test(token)) {
    throw new CatalogError('invalidToken');
  }

  return token;
}

export function safeError(error) {
  if (error instanceof CatalogError) {
    return error;
  }
  const code = Number(error?.status ?? error?._status ?? error?.statusCode ?? error?.response?.status);

  return new CatalogError(({ 401: 'unauthorized', 403: 'forbidden', 429: 'rateLimit' })[code] || 'unavailable');
}

function authentication(input) {
  if (input?.id && !input.token && /^[a-z0-9_.:-]{1,256}$/i.test(input.id)) {
    return { id: input.id, authSigner: 'bearer', passwordField: 'apiToken' };
  }
  if (input?.token && !input.id) {
    const token = normalizeToken(input.token);

    if (token) {
      return { token };
    }
  }
  throw new CatalogError('invalidToken');
}

/** Read-only CLO catalogue. Paths and proxy signer fields are never user-defined. */
export function createCatalog(proxy, input, options = {}) {
  const auth = authentication(input);
  const { pageSize = 100, maxPages = 50, intervalMs = 1000, timeoutMs = 30000, isCurrent = () => true } = options;
  let tail = Promise.resolve();
  let nextAt = 0;
  const current = () => {
    if (!isCurrent()) {
      throw new CatalogError('stale');
    }
  };
  const request = (url) => {
    const run = tail.catch(() => { /* A failed previous read must not poison a retry. */ }).then(async() => {
      current();
      const delay = nextAt - Date.now();

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      current();
      nextAt = Date.now() + intervalMs;
      let timer;

      try {
        const result = await Promise.race([
          Promise.resolve().then(() => proxy.request({ url, method: 'GET', authentication: auth })),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new CatalogError('timeout')), timeoutMs); }),
        ]);

        current();

        return result;
      } catch (error) {
        throw safeError(error);
      } finally {
        clearTimeout(timer);
      }
    });

    tail = run;

    return run;
  };

  async function list(path) {
    const collected = [];
    const ids = new Set();
    let count;

    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`https://api.clo.ru${ path }`);

      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(page * pageSize));
      const body = await request(url);
      const items = body?.result ?? (body?.count === 0 ? [] : undefined);

      if (!Number.isSafeInteger(body?.count) || body.count < 0 || body.count > maxPages * pageSize ||
        !Array.isArray(items) || items.length > pageSize || count !== undefined && count !== body.count) {
        throw new CatalogError('invalidInventory');
      }
      count = body.count;
      for (const item of items) {
        if (!isUUID(item?.id) || ids.has(item.id)) {
          throw new CatalogError('invalidInventory');
        }
        ids.add(item.id);
        collected.push(item);
      }
      if (collected.length === count) {
        return collected;
      }
      if (collected.length > count || items.length < pageSize) {
        throw new CatalogError('invalidInventory');
      }
    }
    throw new CatalogError('invalidInventory');
  }

  const scoped = async(projectId, kind) => {
    if (!isUUID(projectId)) {
      throw new CatalogError('invalidScope');
    }

    return list(`/v2/projects/${ projectId }/${ kind }`);
  };

  return {
    probe: async() => {
      const body = await request(new URL('https://api.clo.ru/v2/projects?limit=1&offset=0'));
      const items = body?.result ?? (body?.count === 0 ? [] : undefined);

      if (!Number.isSafeInteger(body?.count) || body.count < 0 || !Array.isArray(items) ||
        items.length !== (body.count > 0 ? 1 : 0) || items.some((item) => !isUUID(item?.id))) {
        throw new CatalogError('invalidInventory');
      }
    },
    projects: () => list('/v2/projects'),
    images: (projectId) => scoped(projectId, 'images'),
    addresses: (projectId) => scoped(projectId, 'addresses'),
  };
}
