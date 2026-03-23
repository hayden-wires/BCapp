import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp, deriveInvoiceAmounts } from './index.js';

async function startTestServer(options = {}) {
  const app = createApp(options);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test('POST /api routes action handlers and preserves response envelope semantics', async () => {
  const calls = [];
  const { baseUrl, close } = await startTestServer({
    env: { NODE_ENV: 'test' },
    postHandlers: {
      upsertjob: async ({ payload }) => {
        calls.push(payload);
        return { saved: true, ticketNo: payload.ticketNo };
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'upsertJob', payload: { ticketNo: '1001BC' } }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { ok: true, data: { saved: true, ticketNo: '1001BC' } });
    assert.deepEqual(calls, [{ ticketNo: '1001BC' }]);
  } finally {
    await close();
  }
});

test('GET /api returns error envelope on unknown action', async () => {
  const { baseUrl, close } = await startTestServer({ env: { NODE_ENV: 'test' } });

  try {
    const response = await fetch(`${baseUrl}/api?action=unknownAction`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Unknown action\/path/);
  } finally {
    await close();
  }
});

test('soft-delete + restore lifecycle keeps semantic state transitions', async () => {
  const state = { '1002BC': { ticketNo: '1002BC', isDeleted: false } };
  const postHandlers = {
    markdeleted: async ({ payload }) => {
      const ticketNo = payload.ticketNo;
      state[ticketNo] = { ...(state[ticketNo] || { ticketNo }), isDeleted: true, deletedAt: '2026-01-01T00:00:00.000Z' };
      return { ticketNo, isDeleted: state[ticketNo].isDeleted };
    },
    restoredeleted: async ({ payload }) => {
      const ticketNo = payload.ticketNo;
      state[ticketNo] = { ...(state[ticketNo] || { ticketNo }), isDeleted: false, restoredAt: '2026-01-02T00:00:00.000Z' };
      return { ticketNo, isDeleted: state[ticketNo].isDeleted };
    },
  };
  const getHandlers = {
    job: async ({ query }) => state[query.ticketNo] || null,
  };

  const { baseUrl, close } = await startTestServer({ env: { NODE_ENV: 'test' }, postHandlers, getHandlers });

  try {
    const markResponse = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'markDeleted', payload: { ticketNo: '1002BC' } }),
    });
    assert.equal(markResponse.status, 200);
    assert.deepEqual(await markResponse.json(), { ok: true, data: { ticketNo: '1002BC', isDeleted: true } });

    const deletedJob = await (await fetch(`${baseUrl}/api?action=job&ticketNo=1002BC`)).json();
    assert.equal(deletedJob.data.isDeleted, true);

    const restoreResponse = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'restoreDeleted', payload: { ticketNo: '1002BC' } }),
    });
    assert.equal(restoreResponse.status, 200);
    assert.deepEqual(await restoreResponse.json(), { ok: true, data: { ticketNo: '1002BC', isDeleted: false } });

    const restoredJob = await (await fetch(`${baseUrl}/api?action=job&ticketNo=1002BC`)).json();
    assert.equal(restoredJob.data.isDeleted, false);
  } finally {
    await close();
  }
});

test('baseline API protections: auth key, rate limiting, and CORS allowlist', async () => {
  const { baseUrl, close } = await startTestServer({
    env: {
      NODE_ENV: 'test',
      API_AUTH_REQUIRED: 'true',
      API_AUTH_KEY: 'secret-key',
      API_RATE_LIMIT_ENABLED: 'true',
      API_RATE_LIMIT_MAX: '2',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      API_CORS_ALLOWLIST: 'https://allowed.example.com',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const unauthorized = await fetch(`${baseUrl}/api?action=customers`);
    assert.equal(unauthorized.status, 401);

    const wrongOrigin = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        'x-api-key': 'secret-key',
        origin: 'https://not-allowed.example.com',
      },
    });
    assert.equal(wrongOrigin.status, 403);

    const allowedOne = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        'x-api-key': 'secret-key',
        origin: 'https://allowed.example.com',
      },
    });
    assert.equal(allowedOne.status, 200);

    const allowedTwo = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        'x-api-key': 'secret-key',
        origin: 'https://allowed.example.com',
      },
    });
    assert.equal(allowedTwo.status, 200);

    const limited = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        'x-api-key': 'secret-key',
        origin: 'https://allowed.example.com',
      },
    });
    assert.equal(limited.status, 429);
  } finally {
    await close();
  }
});

test('CORS preflight is deterministic across allowlisted, wildcard, and denied origins', async () => {
  const allowedSetup = await startTestServer({
    env: {
      NODE_ENV: 'test',
      API_AUTH_REQUIRED: 'true',
      API_AUTH_KEY: 'secret-key',
      API_RATE_LIMIT_ENABLED: 'true',
      API_RATE_LIMIT_MAX: '1',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      API_CORS_ALLOWLIST: 'https://allowed.example.com',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const allowlistedPreflight = await fetch(`${allowedSetup.baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(allowlistedPreflight.status, 204);
    assert.equal(allowlistedPreflight.headers.get('access-control-allow-origin'), 'https://allowed.example.com');
    assert.match(allowlistedPreflight.headers.get('access-control-allow-methods') || '', /OPTIONS/);

    const deniedPreflight = await fetch(`${allowedSetup.baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://denied.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(deniedPreflight.status, 403);

    const firstAllowedGet = await fetch(`${allowedSetup.baseUrl}/api?action=customers`, {
      headers: {
        origin: 'https://allowed.example.com',
        'x-api-key': 'secret-key',
      },
    });
    assert.equal(firstAllowedGet.status, 200);

    const secondAllowedGet = await fetch(`${allowedSetup.baseUrl}/api?action=customers`, {
      headers: {
        origin: 'https://allowed.example.com',
        'x-api-key': 'secret-key',
      },
    });
    assert.equal(secondAllowedGet.status, 429);
  } finally {
    await allowedSetup.close();
  }

  const wildcardSetup = await startTestServer({
    env: {
      NODE_ENV: 'development',
      API_CORS_ALLOWLIST: '',
      API_RATE_LIMIT_ENABLED: 'true',
      API_RATE_LIMIT_MAX: '1',
      API_RATE_LIMIT_WINDOW_MS: '60000',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const wildcardPreflight = await fetch(`${wildcardSetup.baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://frontend.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(wildcardPreflight.status, 204);
    assert.equal(wildcardPreflight.headers.get('access-control-allow-origin'), '*');
    assert.match(wildcardPreflight.headers.get('access-control-allow-methods') || '', /OPTIONS/);

    const firstRequest = await fetch(`${wildcardSetup.baseUrl}/api?action=customers`, {
      headers: { origin: 'https://frontend.example.com' },
    });
    assert.equal(firstRequest.status, 200);

    const secondRequest = await fetch(`${wildcardSetup.baseUrl}/api?action=customers`, {
      headers: { origin: 'https://frontend.example.com' },
    });
    assert.equal(secondRequest.status, 429);
  } finally {
    await wildcardSetup.close();
  }

  const productionEmptyAllowlistSetup = await startTestServer({
    env: {
      NODE_ENV: 'production',
      API_CORS_ALLOWLIST: '',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const deniedProdPreflight = await fetch(`${productionEmptyAllowlistSetup.baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://frontend.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(deniedProdPreflight.status, 403);

    const deniedProdRequest = await fetch(`${productionEmptyAllowlistSetup.baseUrl}/api?action=customers`, {
      headers: { origin: 'https://frontend.example.com' },
    });
    assert.equal(deniedProdRequest.status, 403);
  } finally {
    await productionEmptyAllowlistSetup.close();
  }
});

test('CORS: production + empty allowlist rejects cross-origin requests with stable error envelope', async () => {
  const { baseUrl, close } = await startTestServer({
    env: {
      NODE_ENV: 'production',
      API_CORS_ALLOWLIST: '',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const deniedRequest = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        origin: 'https://frontend.example.com',
      },
    });
    assert.equal(deniedRequest.status, 403);
    assert.deepEqual(await deniedRequest.json(), {
      ok: false,
      error: 'CORS not configured: API_CORS_ALLOWLIST is empty',
    });

    const deniedPreflight = await fetch(`${baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://frontend.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(deniedPreflight.status, 403);
    assert.equal(deniedPreflight.headers.get('access-control-allow-origin'), null);
  } finally {
    await close();
  }
});

test('CORS: non-production + empty allowlist allows wildcard origin for request and preflight', async () => {
  const { baseUrl, close } = await startTestServer({
    env: {
      NODE_ENV: 'test',
      API_CORS_ALLOWLIST: '',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const allowedRequest = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        origin: 'https://frontend.example.com',
      },
    });
    assert.equal(allowedRequest.status, 200);
    assert.equal(allowedRequest.headers.get('access-control-allow-origin'), '*');

    const allowedPreflight = await fetch(`${baseUrl}/api`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://frontend.example.com',
        'access-control-request-method': 'POST',
      },
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), '*');
    assert.match(allowedPreflight.headers.get('access-control-allow-methods') || '', /OPTIONS/);
  } finally {
    await close();
  }
});


test('production defaults do not force API auth without API_AUTH_REQUIRED', async () => {
  const { baseUrl, close } = await startTestServer({
    env: {
      NODE_ENV: 'production',
      API_CORS_ALLOWLIST: 'https://allowed.example.com',
      API_RATE_LIMIT_ENABLED: 'false',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        origin: 'https://allowed.example.com',
      },
    });
    assert.equal(response.status, 200);
  } finally {
    await close();
  }
});

test('production with API_AUTH_REQUIRED=true still enforces API key auth', async () => {
  const { baseUrl, close } = await startTestServer({
    env: {
      NODE_ENV: 'production',
      API_AUTH_REQUIRED: 'true',
      API_AUTH_KEY: 'secret-key',
      API_RATE_LIMIT_ENABLED: 'false',
    },
    getHandlers: {
      customers: async () => [],
    },
  });

  try {
    const unauthorized = await fetch(`${baseUrl}/api?action=customers`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${baseUrl}/api?action=customers`, {
      headers: {
        'x-api-key': 'secret-key',
      },
    });
    assert.equal(authorized.status, 200);
  } finally {
    await close();
  }
});

test('deriveInvoiceAmounts handles invoice amount edge cases', () => {
  assert.deepEqual(
    deriveInvoiceAmounts({ calculated_subtotal: '100.25', calculated_tax: '8.25', calculated_total: '120.5' }),
    { subtotal: 100.25, tax: 8.25, total: 120.5, shipping: 12 },
  );

  assert.deepEqual(
    deriveInvoiceAmounts({ subtotal: '10', calculated_tax: undefined, calculated_total: undefined }),
    { subtotal: 10, tax: 0, total: 10, shipping: 0 },
  );

  assert.deepEqual(
    deriveInvoiceAmounts({ calculated_subtotal: '80', calculated_tax: '7.5', calculated_total: '82' }),
    { subtotal: 80, tax: 7.5, total: 82, shipping: 0 },
  );
});

test('maps FK customer constraint failures to actionable 400 response', async () => {
  const { baseUrl, close } = await startTestServer({
    env: { NODE_ENV: 'test' },
    postHandlers: {
      savejob: async () => {
        const err = new Error('insert or update on table "jobs" violates foreign key constraint "jobs_cust_id_fk"');
        err.code = '23503';
        err.constraint = 'jobs_cust_id_fk';
        throw err;
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'savejob', payload: { ticketNo: '1003BC', custId: '9999' } }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Invalid custId/);
  } finally {
    await close();
  }
});

test('maps missing-customer auto-upsert precondition errors to actionable 400 response', async () => {
  const { baseUrl, close } = await startTestServer({
    env: { NODE_ENV: 'test' },
    postHandlers: {
      savejob: async () => {
        throw new Error('ERROR_UNKNOWN_CUSTOMER_ID:9999');
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'savejob', payload: { ticketNo: '1004BC', custId: '9999' } }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /customer name is missing/);
  } finally {
    await close();
  }
});
