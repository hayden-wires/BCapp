-- 001_init.sql
-- Initial Neon Postgres schema for migration from Google Sheets/App Script.
--
-- Type decisions where Sheets values were ambiguous:
-- 1) Free-form cells that mixed text/number/date were modeled as TEXT unless the app
--    consistently parsed them as numeric/boolean/date in code.gs.
-- 2) Monetary fields use NUMERIC(12,2) to avoid floating-point drift.
-- 3) order_date / shipment_date / printed_at / submitted_at use TIMESTAMPTZ because
--    Sheets date cells may include time + timezone context at export/import time.
-- 4) Boolean state fields (is_deleted, is_invoiced) default FALSE to match includeDeleted=false behavior.
-- 5) payload_json preserves the full legacy JSON blob for backward compatibility.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Atomic ticket number allocator by prefix.
CREATE TABLE IF NOT EXISTS ticket_series (
  prefix TEXT PRIMARY KEY,
  width INTEGER NOT NULL DEFAULT 4 CHECK (width > 0),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cust_id TEXT NOT NULL,
  cust_name TEXT,
  cust_contact TEXT,
  cust_email TEXT,
  cust_phone TEXT,
  cust_address TEXT,
  ship_line1 TEXT,
  ship_line2 TEXT,
  ship_city TEXT,
  ship_state TEXT,
  ship_zip TEXT,
  bill_line1 TEXT,
  bill_line2 TEXT,
  bill_city TEXT,
  bill_state TEXT,
  bill_zip TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  payload_json JSONB,
  CONSTRAINT customers_cust_id_unique UNIQUE (cust_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_cust_name ON customers (cust_name);
CREATE INDEX IF NOT EXISTS idx_customers_cust_name_lower ON customers ((lower(cust_name)));

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- From CFG.JOBS_HEADERS
  ticket_no TEXT NOT NULL,
  job_id TEXT,
  order_date TIMESTAMPTZ,
  shipment_date TIMESTAMPTZ,
  client_name TEXT,
  product_type TEXT,
  sides INTEGER,
  versions INTEGER,
  qty_per_version INTEGER,
  total_qty INTEGER,
  site TEXT,
  subtotal NUMERIC(12,2),
  printed_at TIMESTAMPTZ,
  printed_by TEXT,
  cust_id TEXT,
  cust_name TEXT,
  cust_contact TEXT,
  cust_email TEXT,
  cust_phone TEXT,
  cust_address TEXT,
  payload_json JSONB,
  calculated_subtotal NUMERIC(12,2),
  calculated_tax NUMERIC(12,2),
  calculated_total NUMERIC(12,2),
  override_subtotal NUMERIC(12,2),
  is_invoiced BOOLEAN NOT NULL DEFAULT FALSE,
  ordered_by TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jobs_ticket_no_unique UNIQUE (ticket_no),
  CONSTRAINT jobs_cust_id_fk FOREIGN KEY (cust_id) REFERENCES customers(cust_id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  feedback_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB,
  CONSTRAINT feedback_feedback_id_unique UNIQUE (feedback_id)
);

-- Required/explicit read indexes from existing app behavior.
CREATE INDEX IF NOT EXISTS idx_jobs_ticket_no ON jobs (ticket_no);
CREATE INDEX IF NOT EXISTS idx_jobs_order_date ON jobs (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_client_name ON jobs (client_name);
CREATE INDEX IF NOT EXISTS idx_jobs_is_deleted ON jobs (is_deleted);
CREATE INDEX IF NOT EXISTS idx_jobs_is_invoiced ON jobs (is_invoiced);

-- Composite index tuned for default queries where deleted rows are filtered out.
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_invoiced_orderdate ON jobs (is_deleted, is_invoiced, order_date DESC);

-- Search index across sheet-era fuzzy lookup fields.
CREATE INDEX IF NOT EXISTS idx_jobs_search_trgm
  ON jobs USING gin (
    (coalesce(ticket_no, '') || ' ' || coalesce(client_name, '') || ' ' || coalesce(cust_name, '') || ' ' || coalesce(cust_id, '')) gin_trgm_ops
  );

-- Maintain updated_at automatically.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_series_updated_at ON ticket_series;
CREATE TRIGGER trg_ticket_series_updated_at
BEFORE UPDATE ON ticket_series
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Atomic ticket allocation: race-safe single statement upsert + increment.
CREATE OR REPLACE FUNCTION allocate_ticket(p_prefix TEXT DEFAULT 'BC')
RETURNS TEXT
LANGUAGE sql
AS $$
  WITH next_val AS (
    INSERT INTO ticket_series(prefix, last_number)
    VALUES (upper(trim(p_prefix)), 1)
    ON CONFLICT (prefix)
    DO UPDATE SET last_number = ticket_series.last_number + 1
    RETURNING prefix, last_number, width
  )
  SELECT lpad(last_number::text, width, '0') || prefix
  FROM next_val;
$$;

-- Explicit SQL search behavior to mirror sheet-style substring matching:
-- - include_deleted defaults FALSE
-- - case-insensitive partial matching over ticket/client/customer fields
-- - newest (order_date) first, fallback to created_at
CREATE OR REPLACE FUNCTION search_jobs(
  q TEXT DEFAULT NULL,
  include_deleted BOOLEAN DEFAULT FALSE,
  result_limit INTEGER DEFAULT 50
)
RETURNS SETOF jobs
LANGUAGE sql
AS $$
  SELECT j.*
  FROM jobs j
  WHERE (include_deleted OR j.is_deleted = FALSE)
    AND (
      coalesce(trim(q), '') = ''
      OR j.ticket_no ILIKE ('%' || q || '%')
      OR j.client_name ILIKE ('%' || q || '%')
      OR j.cust_name ILIKE ('%' || q || '%')
      OR j.cust_id ILIKE ('%' || q || '%')
    )
  ORDER BY j.order_date DESC NULLS LAST, j.created_at DESC
  LIMIT LEAST(GREATEST(result_limit, 1), 500);
$$;

COMMIT;
