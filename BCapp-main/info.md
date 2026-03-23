# BCapp Architecture Overview  
_Vite/React + Vercel + Google Sheets + Apps Script_

---

## 1. High-Level Architecture

BCapp uses a lightweight serverless architecture:

- **Frontend:** Vite + React (hosted on Vercel)
- **Backend API:** Google Apps Script (deployed as a Web App)
- **Database:** Google Sheets (used as structured data storage)

This setup allows rapid iteration without maintaining a traditional server or database.

---

## 2. System Responsibilities

### Frontend (Vite + React on Vercel)

The frontend:

- Renders all UI and manages state.
- Calls the Apps Script Web App URL via `fetch()`.
- Sends JSON payloads for create/update operations.
- Receives JSON responses.
- Updates UI based on returned data.

Typical flow:

1. User interacts with UI.
2. React calls Apps Script endpoint.
3. Apps Script processes request.
4. JSON response returned.
5. UI updates accordingly.

---

### Google Apps Script (API Layer)

Apps Script acts as the backend API.

It:

- Receives HTTP requests (`doGet(e)` / `doPost(e)`).
- Parses request parameters or JSON body.
- Routes logic based on an `action` parameter.
- Reads from or writes to specific Sheets.
- Returns structured JSON responses.

Deployed as a **Web App**, which exposes a public HTTPS endpoint used by the frontend.

Typical responsibilities:

- Routing (e.g., `fetchCustomers`, `createJob`, `updateInvoice`)
- Input validation
- Data normalization
- Row lookup by ID
- Updating specific columns
- Returning consistent JSON responses

---

### Google Sheets (Data Store)

Sheets functions as a structured data store.

Each tab represents a logical table, such as:

- `Customers`
- `Jobs`
- `Series`
- `Invoices`
- `Orders`

Each sheet follows a consistent structure:

- Row 1 = column headers (schema)
- Each row = one record
- Columns must remain stable and predictable

Sheets does **not** enforce:

- Unique constraints
- Data types
- Foreign key relationships
- Transaction safety

These responsibilities must be handled in Apps Script.

---

## 3. Record Structure & ID Strategy

Because Sheets does not generate IDs automatically:

- Each record must include a unique `id`.
- IDs should be deterministic or UUID-like.
- Relationships use reference IDs (e.g., `customerId` in Jobs).

Common metadata fields:

- `id`
- `createdAt`
- `updatedAt`
- `status`

Strict ID discipline is critical for data integrity.

---

## 4. Request / Response Pattern

Example frontend request:

```js
fetch(APPS_SCRIPT_URL, {
  method: "POST",
  body: JSON.stringify({
    action: "createJob",
    payload: { ... }
  })
});
