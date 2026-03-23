# Data API Contract (Frontend `src/utils/api.js` ↔ Backend API variants)

This document captures the **current** contract between the frontend helper layer and backend implementations in this repo.

## Backend variants in scope

- **GAS (`db/code.gs`)**: legacy Google Apps Script deployment.
- **Compatibility API (`server/index.js`)**: Node/Express + Postgres implementation used in this repository.

The frontend (`src/utils/api.js`) talks to either backend through the same `{ action, payload }` contract, but feature parity is not perfect.

## Transport + envelope contract

- Frontend transport:
  - `POST` with body `{ action, payload }`.
  - `GET` with query params including `action`.
- Canonical response envelope from the backend compatibility API:
  - Success: `{ ok: true, data: <any> }`
  - Error: `{ ok: false, error: <string> }`
- Frontend parsing/error semantics:
  - Non-JSON response => throws `API response was not valid JSON`.
  - Parsed non-object => throws `API returned an unexpected response`.
  - `ok !== true` => throws `error` field (or fallback message).
  - On success, frontend returns `data` directly.

---

## 1) Action names and HTTP methods currently used by frontend

| Frontend function | HTTP | Action | GAS support (`db/code.gs`) | Compatibility API support (`server/index.js`) |
|---|---|---|---|---|
| `submitFeedback(feedbackText)` | POST | `submitFeedback` | ✅ implemented | ✅ implemented |
| `peekNextTicket(prefix)` | GET | `peekNext` | ✅ implemented | ✅ implemented |
| `allocateTicket(prefix)` | POST | `allocateTicket` | ✅ implemented | ✅ implemented |
| `saveJob(job, isNew)` | POST | `upsertJob` | ✅ implemented | ✅ implemented |
| `updateJob(job)` | POST | `upsertJob` | ✅ implemented | ✅ implemented |
| `createJob(job)` | POST | `upsertJob` | ✅ implemented | ✅ implemented |
| `toggleJobInvoiced(ticketNo, status)` | POST | `toggleInvoiced` | ✅ implemented | ✅ implemented |
| `softDeleteJob(ticketNo, meta)` | POST | `markDeleted` | ✅ implemented | ✅ implemented |
| `restoreJob(ticketNo, meta)` | POST | `restoreDeleted` | ⚠️ not implemented | ✅ implemented |
| `searchJobs(query, { includeDeleted })` | GET | `search` | ✅ implemented | ✅ implemented |
| `fetchJobs({ includeDeleted })` | GET | `search` | ✅ implemented | ✅ implemented |
| `fetchJobDetails(ticketNo)` | GET | `job` | ✅ implemented | ✅ implemented |
| `fetchInvoices(start, end)` | GET | `invoices` | ✅ implemented | ✅ implemented |
| `fetchCustomers()` | GET | `customers` | ✅ implemented | ✅ implemented |
| `upsertCustomer(customer)` | POST | `upsertCustomer` | ✅ implemented | ✅ implemented |
| `bulkUpsertCustomers(customers)` | POST | `customers/bulk` | ✅ implemented | ✅ implemented |

---

## 2) Request payload/query params expected by each action

### POST

#### `action=submitFeedback`
- Payload from frontend:
  - `feedbackId: string` (generated client-side)
  - `submittedAt: ISO datetime string`
  - `feedbackText: string` (required, trimmed)
- Backend validates all three fields as required.

#### `action=allocateTicket`
- Payload:
  - `prefix?: string` (frontend default: `"BC"`)

#### `action=upsertJob`
- Payload:
  - `{ job, isNew }`
  - `job.ticketNo || job.jobId` required by frontend normalization.
  - Frontend guarantees `job.ticketNo` and `job.jobId` are both present after normalization.
- Used by:
  - `saveJob(job, isNew)`
  - `updateJob(job)` (`isNew=false`)
  - `createJob(job)` (`isNew=true`)

#### `action=toggleInvoiced`
- Payload:
  - `ticketNo: string` (required)
  - `status: boolean`

#### `action=markDeleted`
- Payload:
  - `ticketNo: string`
  - `meta: { deletedAt, deletedBy, reason }` (frontend always sends this block)
- Backend currently keys on `payload.ticketNo` (or `jobId`) and ignores `meta` fields.

#### `action=restoreDeleted`
- Payload:
  - `ticketNo: string`
  - `meta: { restoredAt, restoredBy, reason }`
- Backend behavior by implementation:
  - GAS: action is not implemented (unknown action).
  - Compatibility API: implemented and clears `isDeleted`.

#### `action=upsertCustomer`
- Payload:
  - `{ customer }`
  - Frontend pre-validates `customer.custName`.

#### `action=customers/bulk`
- Payload:
  - `{ customers: Customer[] }`
  - Frontend enforces non-empty array.

### GET

#### `action=peekNext`
- Query:
  - `prefix?: string` (frontend default `"BC"`)

#### `action=search`
- Query:
  - `q: string` (may be `""` for list mode)
  - `includeDeleted: "1" | "0"` from frontend boolean normalization
- Used by:
  - `searchJobs(query, options)` (returns early with `[]` if query is blank)
  - `fetchJobs(options)` (`q=""`)

#### `action=job`
- Query:
  - `ticketNo: string` (required by frontend)

#### `action=invoices`
- Query:
  - `start: string` (optional)
  - `end: string` (optional)
  - Backend also supports optional `includeDeleted`, but frontend does not currently send it.

#### `action=customers`
- Query:
  - No additional params

---

## 3) Response shape and error semantics (`{ ok, data, error }`)

## Backend envelope contract
- `ok(data)` returns `{ ok: true, data }`.
- `bad(msg)` returns `{ ok: false, error: String(msg) }`.
- `fail(err)` returns `{ ok: false, error: String(err.message || err) }`.

## Frontend consumption contract
- Frontend assumes **all successful actions** return envelope with `ok: true` and useful `data`.
- Any `ok: false` becomes a thrown JS error message from `error`.
- `fetch` HTTP status outside 2xx also throws before envelope parsing.

## Typical `data` payloads by action
- `submitFeedback` → `{ created: true, feedbackId }`
- `peekNext` → `{ suggestion, prefix, next }`
- `allocateTicket` → `{ ticketNo }` (frontend also accepts aliases `ticket` / `ticketNumber` but GAS returns `ticketNo`)
- `upsertJob` → `{ created: true, ticketNo }` or `{ updated: true, ticketNo }`
- `toggleInvoiced` → `{ ok: true }` (nested inside outer envelope)
- `markDeleted` → `{ ok: true, ticketNo, isDeleted: true }` (nested inside outer envelope)
- `search` / `job list` → `Job[]`
- `job` → `Job | null`
- `invoices` → `InvoiceRow[]`
- `customers` → `Customer[]`
- `upsertCustomer` → `{ ok: true, customer: { custId, ... } }` (nested `ok`)
- `customers/bulk` → `{ ok: true }` (stub)

## Important error strings currently relied on
- `ERROR_DUPLICATE_TICKET` (create with existing ticket)
- `ERROR_JOB_DELETED` (update blocked on soft-deleted row unless `allowUpdateDeleted`)
- Other domain errors include: `Job not found`, `Ticket column not found`, `Column 'isDeleted' missing...`, etc.

---

## 4) Business rules embedded in GAS

## Ticket generation rules (`allocateTicket`, `peekNext`)
- Source of truth: `series` sheet row matching `prefix` in column A.
- Uses configured width (column B) and next number (column C).
- Ticket format: `String(next).padStart(width, "0") + prefix` (numeric part first, then suffix prefix).
- `allocateTicket` increments/stores next value and writes timestamp in column D under script lock.
- `peekNext` returns suggestion without incrementing.

## Soft-delete behavior
- `markDeleted`:
  - Requires `ticketNo` (or `jobId`) and finds row by exact ticket match.
  - Sets `isDeleted = true` in sheet.
  - If JSON column exists, also writes `isDeleted=true`, `deletedAt=<now>` (plus optional `deleteSource` from `payload.source`).
  - Optional `renameTicket` query in payload can append `" (Deleted)"` to ticket display cell.
- Read paths default to excluding deleted unless explicitly included:
  - `searchJobs`: filters out deleted unless `includeDeleted=true`.
  - `listJobs`: same behavior.
  - `getInvoices`: same behavior.
- `upsertJob` protection:
  - If existing row is deleted, update is blocked unless `job.allowUpdateDeleted === true`.
  - New rows default `isDeleted` to provided value (typically false).
  - Existing rows keep existing deleted flag unless separately changed.

## Invoice filtering rules
- Date window:
  - Defaults `start` to Jan 1 of current year if missing.
  - Defaults `end` to now, then normalized to end-of-day.
- Row inclusion requirements:
  - Must have parseable order date in range.
  - Deleted rows excluded by default unless `includeDeleted=true`.
- Amount logic:
  - `subtotal` from `calculatedSubtotal` else fallback `subtotal`.
  - `tax` from `calculatedTax`.
  - `total` from `calculatedTotal` else `subtotal + tax`.
  - `shipping = max(round(total - subtotal - tax, 2), 0)`.
- Sorted descending by date.

## `includeDeleted` handling
- Accepted values interpreted as true: `1`, `true`, `yes`, `y` (case-insensitive).
- Frontend sends `"1"` or `"0"`.
- Supported on GET actions:
  - `search`
  - `jobs` / `getjobs`
  - `invoices` / `getinvoices`
- Frontend currently passes it only for `search` (including list mode via `fetchJobs`).

---

## Must remain backward compatible during phase 1

To keep frontend changes minimal, these contract points should remain stable:

1. **Envelope contract must not change**
   - Continue returning `{ ok, data, error }` with current semantics.

2. **Action names + methods must remain accepted**
   - Keep current lowercase/alias handling in GAS (`upsertJob`, `savejob`, etc.).
   - Keep `search` serving both search and list mode (`q` can be empty).

3. **`upsertJob` input contract must remain stable**
   - Accept `{ job, isNew }` and preserve duplicate/deleted guard errors.

4. **Ticket response compatibility**
   - Continue returning `data.ticketNo` for `allocateTicket`.
   - If future changes add names, keep `ticketNo` present.

5. **Soft-delete read defaults**
   - Default behavior should continue to exclude deleted rows unless `includeDeleted` is true.

6. **`includeDeleted` truthy parsing should remain tolerant**
   - Keep accepting `1/true/yes/y`.

7. **Known cross-backend parity gap**
   - `restoreDeleted` is implemented in the compatibility API, but not in GAS.
   - Frontend `restoreJob` works against compatibility API and fails against GAS until GAS adds parity.
