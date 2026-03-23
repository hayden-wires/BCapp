-- 002_ticket_series_sync.sql
-- Keep ticket_series in sync when jobs are inserted/updated with explicit ticket numbers.

BEGIN;

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
