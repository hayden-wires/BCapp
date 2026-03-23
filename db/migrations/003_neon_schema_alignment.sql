-- 003_neon_schema_alignment.sql
-- Align manually-created/legacy camelCase Neon schema to the repository migrations
-- so backend SQL queries can rely on snake_case names.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Legacy table compatibility: some environments created `series` manually.
-- Source-of-truth table is `ticket_series` from 001_init.sql.
DO $$
BEGIN
  IF to_regclass('public.ticket_series') IS NULL AND to_regclass('public.series') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.series RENAME TO ticket_series';
  END IF;
END
$$;

-- Ensure canonical ticket_series shape.
CREATE TABLE IF NOT EXISTS ticket_series (
  prefix TEXT PRIMARY KEY,
  width INTEGER NOT NULL DEFAULT 4 CHECK (width > 0),
  last_number BIGINT NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_series' AND column_name = 'next'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_series' AND column_name = 'last_number'
  ) THEN
    EXECUTE 'ALTER TABLE ticket_series RENAME COLUMN "next" TO last_number';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_series' AND column_name = 'lastAllocatedAt'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_series' AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'ALTER TABLE ticket_series RENAME COLUMN "lastAllocatedAt" TO updated_at';
  END IF;
END
$$;

ALTER TABLE ticket_series ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE ticket_series ADD COLUMN IF NOT EXISTS last_number BIGINT;
ALTER TABLE ticket_series ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE ticket_series ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE ticket_series SET width = COALESCE(width, 4);
UPDATE ticket_series SET last_number = COALESCE(last_number, 0);
UPDATE ticket_series SET created_at = COALESCE(created_at, now());
UPDATE ticket_series SET updated_at = COALESCE(updated_at, now());

ALTER TABLE ticket_series ALTER COLUMN width SET NOT NULL;
ALTER TABLE ticket_series ALTER COLUMN last_number SET NOT NULL;
ALTER TABLE ticket_series ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE ticket_series ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE ticket_series ALTER COLUMN width SET DEFAULT 4;
ALTER TABLE ticket_series ALTER COLUMN last_number SET DEFAULT 0;
ALTER TABLE ticket_series ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE ticket_series ALTER COLUMN updated_at SET DEFAULT now();

-- Ensure canonical customers shape.
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
  payload_json JSONB
);

DO $$
DECLARE
  renames TEXT[][] := ARRAY[
    ARRAY['custId','cust_id'], ARRAY['custName','cust_name'], ARRAY['custContact','cust_contact'], ARRAY['custEmail','cust_email'],
    ARRAY['custPhone','cust_phone'], ARRAY['custAddress','cust_address'], ARRAY['shipLine1','ship_line1'], ARRAY['shipLine2','ship_line2'],
    ARRAY['shipCity','ship_city'], ARRAY['shipState','ship_state'], ARRAY['shipZip','ship_zip'], ARRAY['billLine1','bill_line1'],
    ARRAY['billLine2','bill_line2'], ARRAY['billCity','bill_city'], ARRAY['billState','bill_state'], ARRAY['billZip','bill_zip'],
    ARRAY['createdAt','created_at'], ARRAY['updatedAt','updated_at'], ARRAY['json','payload_json']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(renames, 1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='customers' AND column_name=renames[i][1]
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='customers' AND column_name=renames[i][2]
    ) THEN
      EXECUTE format('ALTER TABLE customers RENAME COLUMN %I TO %I', renames[i][1], renames[i][2]);
    END IF;
  END LOOP;
END
$$;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_contact TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS cust_address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_line1 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_line2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_state TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ship_zip TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_line1 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_line2 TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_city TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_state TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS bill_zip TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payload_json JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_pkey' AND conrelid = 'customers'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id)';
  END IF;
END
$$;

ALTER TABLE customers ALTER COLUMN cust_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_cust_id_unique' AND conrelid = 'customers'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE customers ADD CONSTRAINT customers_cust_id_unique UNIQUE (cust_id)';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_customers_cust_name ON customers (cust_name);
CREATE INDEX IF NOT EXISTS idx_customers_cust_name_lower ON customers ((lower(cust_name)));

-- Ensure canonical jobs shape.
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE
  renames TEXT[][] := ARRAY[
    ARRAY['ticketNo','ticket_no'], ARRAY['jobId','job_id'], ARRAY['orderDate','order_date'], ARRAY['shipmentDate','shipment_date'],
    ARRAY['clientName','client_name'], ARRAY['productType','product_type'], ARRAY['totalQty','total_qty'], ARRAY['custId','cust_id'],
    ARRAY['custName','cust_name'], ARRAY['custContact','cust_contact'], ARRAY['custEmail','cust_email'], ARRAY['custPhone','cust_phone'],
    ARRAY['custAddress','cust_address'], ARRAY['json','payload_json'], ARRAY['calculatedSubtotal','calculated_subtotal'],
    ARRAY['calculatedTax','calculated_tax'], ARRAY['calculatedTotal','calculated_total'], ARRAY['overrideSubtotal','override_subtotal'],
    ARRAY['isInvoiced','is_invoiced'], ARRAY['orderedBy','ordered_by'], ARRAY['isDeleted','is_deleted'], ARRAY['printedAt','printed_at'],
    ARRAY['printedBy','printed_by'], ARRAY['createdAt','created_at'], ARRAY['updatedAt','updated_at'], ARRAY['qtyPerVersion','qty_per_version']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(renames, 1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='jobs' AND column_name=renames[i][1]
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='jobs' AND column_name=renames[i][2]
    ) THEN
      EXECUTE format('ALTER TABLE jobs RENAME COLUMN %I TO %I', renames[i][1], renames[i][2]);
    END IF;
  END LOOP;
END
$$;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ticket_no TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS shipment_date TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS product_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sides INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS versions INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qty_per_version INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS total_qty INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS site TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS printed_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_contact TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_email TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_phone TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cust_address TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payload_json JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calculated_subtotal NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calculated_tax NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS calculated_total NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS override_subtotal NUMERIC(12,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_invoiced BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ordered_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE jobs SET is_invoiced = COALESCE(is_invoiced, FALSE);
UPDATE jobs SET is_deleted = COALESCE(is_deleted, FALSE);
UPDATE jobs SET created_at = COALESCE(created_at, now());
UPDATE jobs SET updated_at = COALESCE(updated_at, now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_pkey' AND conrelid = 'jobs'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id)';
  END IF;
END
$$;

ALTER TABLE jobs ALTER COLUMN ticket_no SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN is_invoiced SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN is_deleted SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE jobs ALTER COLUMN is_invoiced SET DEFAULT FALSE;
ALTER TABLE jobs ALTER COLUMN is_deleted SET DEFAULT FALSE;
ALTER TABLE jobs ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE jobs ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_ticket_no_unique' AND conrelid = 'jobs'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE jobs ADD CONSTRAINT jobs_ticket_no_unique UNIQUE (ticket_no)';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'jobs_cust_id_fk' AND conrelid = 'jobs'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE jobs DROP CONSTRAINT jobs_cust_id_fk';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='cust_id'
  ) THEN
    EXECUTE 'ALTER TABLE jobs ADD CONSTRAINT jobs_cust_id_fk FOREIGN KEY (cust_id) REFERENCES customers(cust_id) ON UPDATE CASCADE ON DELETE SET NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_jobs_ticket_no ON jobs (ticket_no);
CREATE INDEX IF NOT EXISTS idx_jobs_order_date ON jobs (order_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_client_name ON jobs (client_name);
CREATE INDEX IF NOT EXISTS idx_jobs_is_deleted ON jobs (is_deleted);
CREATE INDEX IF NOT EXISTS idx_jobs_is_invoiced ON jobs (is_invoiced);
CREATE INDEX IF NOT EXISTS idx_jobs_deleted_invoiced_orderdate ON jobs (is_deleted, is_invoiced, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_search_trgm
  ON jobs USING gin ((coalesce(ticket_no, '') || ' ' || coalesce(client_name, '') || ' ' || coalesce(cust_name, '') || ' ' || coalesce(cust_id, '')) gin_trgm_ops);

-- Ensure feedback table required by submitFeedback.
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  feedback_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB
);

DO $$
DECLARE
  renames TEXT[][] := ARRAY[
    ARRAY['feedbackId','feedback_id'], ARRAY['submittedAt','submitted_at'], ARRAY['feedbackText','feedback_text'],
    ARRAY['createdAt','created_at'], ARRAY['json','payload_json']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(renames, 1) LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='feedback' AND column_name=renames[i][1]
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='feedback' AND column_name=renames[i][2]
    ) THEN
      EXECUTE format('ALTER TABLE feedback RENAME COLUMN %I TO %I', renames[i][1], renames[i][2]);
    END IF;
  END LOOP;
END
$$;

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS feedback_id TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS feedback_text TEXT;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS payload_json JSONB;

UPDATE feedback SET created_at = COALESCE(created_at, now());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_pkey' AND conrelid = 'feedback'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE feedback ADD CONSTRAINT feedback_pkey PRIMARY KEY (id)';
  END IF;
END
$$;

ALTER TABLE feedback ALTER COLUMN feedback_id SET NOT NULL;
ALTER TABLE feedback ALTER COLUMN submitted_at SET NOT NULL;
ALTER TABLE feedback ALTER COLUMN feedback_text SET NOT NULL;
ALTER TABLE feedback ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE feedback ALTER COLUMN created_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'feedback_feedback_id_unique' AND conrelid = 'feedback'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE feedback ADD CONSTRAINT feedback_feedback_id_unique UNIQUE (feedback_id)';
  END IF;
END
$$;

-- Recreate functions/triggers from source-of-truth migrations.
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

CREATE OR REPLACE FUNCTION sync_ticket_series_from_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parsed_prefix TEXT;
  parsed_number BIGINT;
BEGIN
  IF NEW.ticket_no IS NULL OR btrim(NEW.ticket_no) = '' THEN
    RETURN NEW;
  END IF;

  parsed_prefix := upper(substring(NEW.ticket_no FROM '[A-Za-z]+$'));

  IF parsed_prefix IS NULL OR parsed_prefix = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    parsed_number := NULLIF(substring(NEW.ticket_no FROM '^[0-9]+'), '')::BIGINT;
  EXCEPTION
    WHEN others THEN
      RETURN NEW;
  END;

  IF parsed_number IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO ticket_series(prefix, last_number)
  VALUES (parsed_prefix, parsed_number)
  ON CONFLICT (prefix)
  DO UPDATE SET last_number = GREATEST(ticket_series.last_number, EXCLUDED.last_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_sync_ticket_series ON jobs;
CREATE TRIGGER trg_jobs_sync_ticket_series
AFTER INSERT OR UPDATE OF ticket_no ON jobs
FOR EACH ROW
EXECUTE FUNCTION sync_ticket_series_from_job();

COMMIT;
