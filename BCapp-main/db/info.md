# Neon Postgres migration notes

Initial migration is in `db/migrations/001_init.sql`.

## Type decisions from Sheet-era ambiguous cells

- **TEXT** used for free-form columns that historically mixed strings and numbers (`client_name`, `site`, address/contact fields).
- **NUMERIC(12,2)** used for monetary values (`subtotal`, `calculated_*`, `override_subtotal`) to avoid float drift.
- **TIMESTAMPTZ** used for date/time fields imported from Sheets (`order_date`, `shipment_date`, `printed_at`, `submitted_at`) because source values may carry time/timezone.
- **BOOLEAN** with default `false` used for soft-delete/invoiced flags to preserve current includeDeleted default behavior.
- **JSONB payload_json** retained on `jobs` and `customers` to preserve legacy blob compatibility during normalization.

## Soft-delete behavior

`jobs.is_deleted` defaults to `false`. Query patterns should continue to exclude deleted jobs by default and only include them when explicitly requested (`includeDeleted = true`).

## Search behavior (explicit SQL)

`search_jobs(q, include_deleted, result_limit)` applies case-insensitive substring matching over:

- `ticket_no`
- `client_name`
- `cust_name`
- `cust_id`

Results are ordered by most recent `order_date` then `created_at`, max 500 rows.

## Ticket allocation race safety

`allocate_ticket(prefix)` uses a single-statement `INSERT ... ON CONFLICT ... DO UPDATE` increment on `ticket_series.last_number`, which is atomic under concurrent requests.


## Applying schema migrations to Neon

Use repository SQL migrations as source of truth (in order):

```bash
DATABASE_URL=postgres://... npm run migrate:schema
```

This applies:
1. `db/migrations/001_init.sql`
2. `db/migrations/002_ticket_series_sync.sql`
3. `db/migrations/003_neon_schema_alignment.sql`

`003_neon_schema_alignment.sql` is a compatibility migration that aligns manually-created legacy/camelCase Neon objects to the backend snake_case schema (including `jobs.ticket_no`, `customers.cust_id`, `feedback`, and `ticket_series.last_number`).
