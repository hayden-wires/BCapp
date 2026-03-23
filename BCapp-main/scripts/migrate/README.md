# Sheet export -> Neon migration scripts

Idempotent ETL loader for historical Google Sheets export files.

## Supported entities and stable keys

- `jobs` -> upsert on `ticket_no`
- `customers` -> upsert on `cust_id`
- `feedback` -> upsert on `feedback_id`
- `series` -> upsert on `prefix` (`ticket_series` table)

## Input format

Put files in a single export directory as either CSV or JSON arrays:

- `jobs.csv` or `jobs.json`
- `customers.csv` or `customers.json`
- `feedback.csv` or `feedback.json`
- `series.csv` or `series.json`

JSON should be an array of objects.

## Run

```bash
# dry run (no DB writes), prints reconciliation report
npm run migrate:sheet-export -- --data-dir ./tmp/export --dry-run --report-file ./tmp/reports/initial.json

# real load
DATABASE_URL=postgres://... npm run migrate:sheet-export -- --data-dir ./tmp/export --report-file ./tmp/reports/initial-live.json

# delta window for dual-run period (last 48h)
DATABASE_URL=postgres://... npm run migrate:sheet-export -- --data-dir ./tmp/export --window-hours 48 --report-file ./tmp/reports/delta-48h.json
```

## Reconciliation report

The script emits JSON with:

- row counts by entity (`inputRows`, `processedRows`, `upsertedRows`, `skippedRows`)
- `invalidRecords` with index + reason
- `duplicateStableKeys` (duplicate ticket/customer/etc IDs in source files)

## Data safety notes

- Normalizes strings, booleans, numerics, date/timestamps, and empty/null values.
- Preserves legacy JSON blobs in `payload_json` (`jobs/customers/feedback`) to avoid data loss during staged normalization.
- Idempotent behavior comes from stable-key upserts and non-destructive series updates (`GREATEST(last_number)`).
- Load order is `customers` -> `jobs` -> `feedback` -> `series` so `jobs.cust_id` foreign-key references resolve safely during full historical loads.
- For soft-delete compatibility, jobs default to `is_deleted = false` when field is absent.
