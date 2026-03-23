#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

for file in db/migrations/001_init.sql db/migrations/002_ticket_series_sync.sql db/migrations/003_neon_schema_alignment.sql; do
  echo "Applying ${file}"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "${file}"
done

echo "Schema migrations applied successfully."
