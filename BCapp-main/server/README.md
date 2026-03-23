# Compatibility API (Neon Postgres)

This service exposes a backend-compatible action API at `POST /api` and `GET /api` that remains compatible with the legacy Google Apps Script contract.

## Run

```bash
DATABASE_URL=postgres://... npm run server
```

Default port: `8787`.

## Supported actions

### POST `/api`
- `allocateTicket`
- `upsertJob` (`jobs`, `saveJob` aliases)
- `toggleInvoiced`
- `markDeleted` (`softDelete`, `deleteJob` aliases)
- `upsertCustomer` (`customers/upsert` alias)
- `customers/bulk` (`bulk/customers` alias)
- `submitFeedback`

### GET `/api`
- `job`
- `search`
- `jobs`, `getJobs`
- `invoices`, `getInvoices`
- `customers`, `getCustomers`
- `peekNext`

All responses preserve the envelope:

```json
{ "ok": true, "data": ... }
```

Error shape:

```json
{ "ok": false, "error": "message" }
```

## Frontend API environment wiring

The frontend resolves its API base URL using:

- `VITE_API_BASE_URL` when set
- otherwise `/api`

### Local development

- Run frontend with `npm run dev`.
- Keep `VITE_API_BASE_URL` unset so the app uses `/api`.
- Vite proxies `/api` to `http://localhost:8787`, so run backend with `npm run server`.

### Production / deployed environments

- Set `VITE_API_BASE_URL` to your deployed compatibility API URL (for example, `https://bc-app-iota.vercel.app/api`).
- If this variable is missing in production and there is no `/api` route on the host serving the frontend, API calls fail and UI surfaces warning/empty states.

### Deployed backend verification checklist

Run these checks against your deployed backend URL:

```bash
# GET /api should return the standard envelope
curl -sS "https://bc-app-iota.vercel.app/api?action=peekNext&prefix=BC"

# POST /api should return the standard envelope
curl -sS -X POST "https://bc-app-iota.vercel.app/api" \
  -H "Content-Type: text/plain;charset=utf-8" \
  --data '{"action":"peekNext","payload":{"prefix":"BC"}}'
```

Expected response contract (for both requests):

- Success: `{ "ok": true, "data": ... }`
- Error: `{ "ok": false, "error": "message" }`


## Separate backend host (recommended quick path)

If your frontend is deployed separately and `/api` returns 404 on that host, deploy this Express API as its own service and point the frontend at it.

### Option A: Render (fastest)

This repo includes `render.yaml` for a web service.

1. Create a new Render **Web Service** from this repo.
2. Ensure these env vars are set on Render:
   - `DATABASE_URL` = your Neon connection string
   - `API_CORS_ALLOWLIST` = your frontend origin(s), comma-separated
   - Optional during bring-up: `API_AUTH_REQUIRED=false`
3. Deploy and verify:

```bash
curl -sS "https://<your-render-service>.onrender.com/healthz"
curl -sS "https://<your-render-service>.onrender.com/api?action=peekNext&prefix=BC"
```

4. In the frontend deployment environment (Vercel/Netlify), set:

```bash
VITE_API_BASE_URL=https://<your-render-service>.onrender.com/api
```

5. Redeploy frontend after changing env vars.

### Option B: Railway / Fly

Use the same runtime command and env vars:

- Start command: `npm run server`
- Required env: `DATABASE_URL`
- Recommended env: `API_CORS_ALLOWLIST`, `API_AUTH_REQUIRED`, `API_AUTH_KEY`, `API_RATE_LIMIT_ENABLED`

Then set `VITE_API_BASE_URL` in the frontend to `https://<your-api-host>/api` and redeploy.


## Deployed environment verification (createJob path)

Use these checks after deployment to verify runtime wiring:

1. **Server artifact has current createJob flow** (`createJobAtomic` + upsert update/insert logic):

```bash
curl -sS "https://<your-api-host>/healthz" | jq
```

Confirm `artifact.createJobFlow` is `createJobAtomic->upsertJob(update_or_insert)` and `artifact.postActions` includes `createjob`.

2. **Frontend points to compatibility API host**:

```bash
# In your frontend host env vars
VITE_API_BASE_URL=https://<your-api-host>/api
```

3. **Compatibility API host DATABASE_URL target**:

On startup, the server logs a structured `db_target` event with safe fields (`host`, `port`, `database`, `protocol`). Confirm those match the database you migrated.

4. **Trace POST /api createJob with request IDs**:

Make a create-job request from browser, then:

- In browser network panel, open the `POST /api` response and copy response header `x-request-id`.
- In deployment logs, search that request ID.
- Confirm matching entries:
  - `event=http_request` with `path` like `/api` and `action` `createJob`
  - `event=create_job` with same `reqId` and created `ticketNo`

Example log filter terms:

```
x-request-id: <req-id-from-browser>
"event":"http_request"
"event":"create_job"
```

## Baseline API protections

When deployed publicly, enable the built-in controls via env vars:

- `API_AUTH_REQUIRED=true` to require an API key.
  - **Important:** auth is now **opt-in** and no longer automatically enabled by `NODE_ENV=production`.
- `API_AUTH_KEY=<secret>` expected on `x-api-key` by default (override header name with `API_AUTH_HEADER`).
- `API_RATE_LIMIT_ENABLED=true` (or `NODE_ENV=production`) to enable IP-based in-memory rate limiting.
  - `API_RATE_LIMIT_MAX` (default `120`) requests
  - `API_RATE_LIMIT_WINDOW_MS` (default `60000`) time window
- `API_CORS_ALLOWLIST=https://app.example.com,https://admin.example.com` to allow only specific origins.

## CORS behavior matrix

CORS checks run before routing whenever an `Origin` header is present. If there is no `Origin` header (typical same-origin/server-to-server call), the request proceeds normally without CORS negotiation headers.

### 1) Same-origin/API calls without `Origin`

- Condition: request has no `Origin` header (for example, backend-to-backend calls or same-origin paths proxied to `/api`).
- Result: request is processed as normal.
- CORS headers: not required/omitted because this is not a cross-origin negotiation.

### 2) Cross-origin with `API_CORS_ALLOWLIST` match

- Condition: `Origin` is present and exactly matches one value in `API_CORS_ALLOWLIST`.
- Result: request allowed.
- Non-preflight (`GET`/`POST`) behavior:
  - Status: handler status (for example `200` on success).
  - Headers include:
    - `Access-Control-Allow-Origin: <request-origin>`
    - `Vary: Origin`
    - `Access-Control-Allow-Headers: <auth-header>, authorization, content-type`
    - `Access-Control-Allow-Methods: GET,POST,OPTIONS`
- Preflight (`OPTIONS /api`) behavior:
  - Status: `204`
  - Same CORS headers as above.

### 3) Cross-origin with empty allowlist (`API_CORS_ALLOWLIST` unset/empty)

#### Production default (`NODE_ENV=production`)

- Result: deny cross-origin requests to make missing CORS config explicit.
- Non-preflight (`GET`/`POST`) behavior:
  - Status: `403`
  - JSON error envelope:
    - `{ "ok": false, "error": "CORS not configured: API_CORS_ALLOWLIST is empty" }`
- Preflight (`OPTIONS /api`) behavior:
  - Status: `403`
  - Empty body.

#### Non-production fallback (`NODE_ENV=test` or `development`)

- Result: permissive wildcard fallback for local/test workflows.
- Non-preflight (`GET`/`POST`) behavior:
  - Status: handler status (for example `200` on success)
  - `Access-Control-Allow-Origin: *`
- Preflight (`OPTIONS /api`) behavior:
  - Status: `204`
  - Headers include:
    - `Access-Control-Allow-Origin: *`
    - `Access-Control-Allow-Headers: <auth-header>, authorization, content-type`
    - `Access-Control-Allow-Methods: GET,POST,OPTIONS`

### 4) Cross-origin with non-empty allowlist but origin not matched

- Result: denied.
- Non-preflight: `403` with `{ "ok": false, "error": "CORS origin denied" }`.
- Preflight: `403` with empty body.

### Concrete env examples

```bash
# Production: explicit allowlist (recommended)
NODE_ENV=production
API_CORS_ALLOWLIST=https://app.example.com,https://admin.example.com
# https://app.example.com -> allowed (origin echoed)
# https://evil.example.com -> 403

# Production: empty allowlist (fails closed)
NODE_ENV=production
API_CORS_ALLOWLIST=
# any cross-origin Origin header -> 403

# Development/test: empty allowlist (wildcard fallback)
NODE_ENV=development
API_CORS_ALLOWLIST=
# cross-origin requests -> allowed with Access-Control-Allow-Origin: *
```

The controls are applied to `/api` requests and preserve the existing JSON envelope format for non-preflight errors (`{ ok: false, error: ... }`).

## Production auth strategy for browser-facing deployments

This project uses **Pattern B**: direct browser → API calls with API key auth disabled unless explicitly configured.

- Set `API_AUTH_REQUIRED=false` for browser-facing deployments that call `/api` directly from the frontend.
- Keep `API_CORS_ALLOWLIST` strict to only trusted frontend origins.
- Keep rate limiting enabled (`API_RATE_LIMIT_ENABLED=true`) in production.
- Only turn on `API_AUTH_REQUIRED=true` if requests are routed through a same-origin server-side proxy that can safely inject `x-api-key`.

This avoids accidentally breaking the production app when `NODE_ENV=production` is set.
