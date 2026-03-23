#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';

const ENTITIES = ['customers', 'jobs', 'feedback', 'series'];

function parseArgs(argv) {
  const args = {
    dataDir: null,
    dryRun: false,
    reportFile: null,
    since: null,
    windowHours: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--data-dir') args.dataDir = argv[i + 1], i += 1;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--report-file') args.reportFile = argv[i + 1], i += 1;
    else if (arg === '--since') args.since = argv[i + 1], i += 1;
    else if (arg === '--window-hours') args.windowHours = Number(argv[i + 1]), i += 1;
  }

  if (!args.dataDir) {
    throw new Error('Missing --data-dir. Example: node scripts/migrate/run.js --data-dir ./exports --dry-run');
  }

  if (args.since) {
    const parsed = Date.parse(args.since);
    if (Number.isNaN(parsed)) throw new Error(`Invalid --since timestamp: ${args.since}`);
    args.since = new Date(parsed);
  }

  if (args.windowHours != null) {
    if (!Number.isFinite(args.windowHours) || args.windowHours <= 0) {
      throw new Error('--window-hours must be a positive number');
    }
    args.since = new Date(Date.now() - args.windowHours * 60 * 60 * 1000);
  }

  return args;
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(content) {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] ?? '';
    });
    return record;
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readEntityRecords(dataDir, entity) {
  const jsonPath = path.join(dataDir, `${entity}.json`);
  const csvPath = path.join(dataDir, `${entity}.csv`);

  if (await fileExists(jsonPath)) {
    const raw = await fs.readFile(jsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`${entity}.json must contain an array`);
    return parsed;
  }

  if (await fileExists(csvPath)) {
    const raw = await fs.readFile(csvPath, 'utf8');
    return parseCsv(raw);
  }

  return [];
}

function toNull(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || /^null$/i.test(trimmed) || /^undefined$/i.test(trimmed)) return null;
    return trimmed;
  }
  return value;
}

function toNumeric(value) {
  const v = toNull(value);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = toNumeric(value);
  return n == null ? null : Math.trunc(n);
}

function toBool(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'deleted'].includes(s)) return true;
  if (['false', '0', 'no', 'n'].includes(s)) return false;
  return null;
}

function toDate(value) {
  const v = toNull(value);
  if (v == null) return null;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toJsonBlob(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string' && value.trim()) {
    try { return JSON.parse(value); } catch {}
  }
  return fallback;
}

function mostRecentDate(record, keys) {
  let winner = null;
  keys.forEach((key) => {
    const iso = toDate(record[key]);
    if (!iso) return;
    if (!winner || iso > winner) winner = iso;
  });
  return winner;
}

function buildReport() {
  const report = { entities: {} };
  ENTITIES.forEach((entity) => {
    report.entities[entity] = {
      inputRows: 0,
      processedRows: 0,
      upsertedRows: 0,
      skippedRows: 0,
      invalidRecords: [],
      duplicateStableKeys: [],
    };
  });
  return report;
}

function trackDuplicates(records, keyField) {
  const seen = new Set();
  const dupes = new Set();
  records.forEach((row) => {
    const key = String(toNull(row[keyField]) ?? '').trim();
    if (!key) return;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  });
  return Array.from(dupes).sort();
}

function withinWindow(record, entity, since) {
  if (!since) return true;
  const fieldCandidates = {
    jobs: ['updated_at', 'updatedAt', 'order_date', 'orderDate', 'created_at', 'createdAt'],
    customers: ['updated_at', 'updatedAt', 'created_at', 'createdAt'],
    feedback: ['submitted_at', 'submittedAt', 'created_at', 'createdAt'],
    series: ['updated_at', 'updatedAt', 'created_at', 'createdAt'],
  };
  const latest = mostRecentDate(record, fieldCandidates[entity] ?? []);
  if (!latest) return true;
  return new Date(latest) >= since;
}

function normalizeCustomer(record) {
  const normalized = {
    cust_id: toNull(record.cust_id ?? record.custId),
    cust_name: toNull(record.cust_name ?? record.custName),
    cust_contact: toNull(record.cust_contact ?? record.custContact),
    cust_email: toNull(record.cust_email ?? record.custEmail),
    cust_phone: toNull(record.cust_phone ?? record.custPhone),
    cust_address: toNull(record.cust_address ?? record.custAddress),
    ship_line1: toNull(record.ship_line1 ?? record.shipLine1),
    ship_line2: toNull(record.ship_line2 ?? record.shipLine2),
    ship_city: toNull(record.ship_city ?? record.shipCity),
    ship_state: toNull(record.ship_state ?? record.shipState),
    ship_zip: toNull(record.ship_zip ?? record.shipZip),
    bill_line1: toNull(record.bill_line1 ?? record.billLine1),
    bill_line2: toNull(record.bill_line2 ?? record.billLine2),
    bill_city: toNull(record.bill_city ?? record.billCity),
    bill_state: toNull(record.bill_state ?? record.billState),
    bill_zip: toNull(record.bill_zip ?? record.billZip),
    created_at: toDate(record.created_at ?? record.createdAt),
    updated_at: toDate(record.updated_at ?? record.updatedAt),
  };

  normalized.payload_json = toJsonBlob(record.payload_json ?? record.json, record);
  return normalized;
}

function normalizeJob(record) {
  const normalized = {
    ticket_no: toNull(record.ticket_no ?? record.ticketNo ?? record.jobId),
    job_id: toNull(record.job_id ?? record.jobId),
    order_date: toDate(record.order_date ?? record.orderDate),
    shipment_date: toDate(record.shipment_date ?? record.shipmentDate),
    client_name: toNull(record.client_name ?? record.clientName),
    cust_name: toNull(record.cust_name ?? record.custName),
    product_type: toNull(record.product_type ?? record.productType),
    total_qty: toInt(record.total_qty ?? record.totalQty),
    subtotal: toNumeric(record.subtotal),
    cust_id: toNull(record.cust_id ?? record.custId),
    cust_contact: toNull(record.cust_contact ?? record.custContact),
    cust_email: toNull(record.cust_email ?? record.custEmail),
    calculated_subtotal: toNumeric(record.calculated_subtotal ?? record.calculatedSubtotal),
    calculated_tax: toNumeric(record.calculated_tax ?? record.calculatedTax),
    calculated_total: toNumeric(record.calculated_total ?? record.calculatedTotal),
    ordered_by: toNull(record.ordered_by ?? record.orderedBy),
    is_invoiced: toBool(record.is_invoiced ?? record.isInvoiced) ?? false,
    is_deleted: toBool(record.is_deleted ?? record.isDeleted) ?? false,
  };

  normalized.payload_json = toJsonBlob(record.payload_json ?? record.json, record);
  return normalized;
}

function normalizeFeedback(record) {
  const normalized = {
    feedback_id: toNull(record.feedback_id ?? record.feedbackId),
    submitted_at: toDate(record.submitted_at ?? record.submittedAt),
    feedback_text: toNull(record.feedback_text ?? record.feedbackText ?? record.feedback),
  };
  normalized.payload_json = toJsonBlob(record.payload_json ?? record.json, record);
  return normalized;
}

function normalizeSeries(record) {
  const explicitLastNumber = toInt(record.last_number ?? record.lastNumber);
  const legacyNext = toInt(record.next);
  const lastNumberFromNext = legacyNext == null ? null : Math.max(legacyNext - 1, 0);

  return {
    prefix: String(toNull(record.prefix) ?? '').toUpperCase(),
    last_number: explicitLastNumber ?? lastNumberFromNext,
    width: toInt(record.width),
  };
}

async function upsertCustomers(client, rows, dryRun) {
  if (dryRun) return rows.length;
  let count = 0;
  for (const row of rows) {
    await client.query(
      `INSERT INTO customers (
        cust_id, cust_name, cust_contact, cust_email, cust_phone, cust_address,
        ship_line1, ship_line2, ship_city, ship_state, ship_zip,
        bill_line1, bill_line2, bill_city, bill_state, bill_zip,
        created_at, updated_at, payload_json
      ) VALUES (
        $1,$2,$3,$4,$5,$6,
        $7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,
        $17::timestamptz,$18::timestamptz,$19::jsonb
      )
      ON CONFLICT (cust_id) DO UPDATE SET
        cust_name = EXCLUDED.cust_name,
        cust_contact = EXCLUDED.cust_contact,
        cust_email = EXCLUDED.cust_email,
        cust_phone = EXCLUDED.cust_phone,
        cust_address = EXCLUDED.cust_address,
        ship_line1 = EXCLUDED.ship_line1,
        ship_line2 = EXCLUDED.ship_line2,
        ship_city = EXCLUDED.ship_city,
        ship_state = EXCLUDED.ship_state,
        ship_zip = EXCLUDED.ship_zip,
        bill_line1 = EXCLUDED.bill_line1,
        bill_line2 = EXCLUDED.bill_line2,
        bill_city = EXCLUDED.bill_city,
        bill_state = EXCLUDED.bill_state,
        bill_zip = EXCLUDED.bill_zip,
        created_at = COALESCE(customers.created_at, EXCLUDED.created_at),
        updated_at = COALESCE(EXCLUDED.updated_at, customers.updated_at, now()),
        payload_json = EXCLUDED.payload_json`,
      [
        row.cust_id, row.cust_name, row.cust_contact, row.cust_email, row.cust_phone, row.cust_address,
        row.ship_line1, row.ship_line2, row.ship_city, row.ship_state, row.ship_zip,
        row.bill_line1, row.bill_line2, row.bill_city, row.bill_state, row.bill_zip,
        row.created_at, row.updated_at, JSON.stringify(row.payload_json),
      ],
    );
    count += 1;
  }
  return count;
}

async function upsertJobs(client, rows, dryRun) {
  if (dryRun) return rows.length;
  let count = 0;
  for (const row of rows) {
    await client.query(
      `INSERT INTO jobs (
        ticket_no, job_id, order_date, shipment_date, client_name, cust_name,
        product_type, total_qty, subtotal, cust_id, cust_contact, cust_email,
        payload_json, is_invoiced, calculated_subtotal, calculated_tax, calculated_total, ordered_by, is_deleted
      ) VALUES (
        $1,$2,$3::timestamptz,$4::timestamptz,$5,$6,
        $7,$8,$9,$10,$11,$12,
        $13::jsonb,$14,$15,$16,$17,$18,$19
      )
      ON CONFLICT (ticket_no) DO UPDATE SET
        job_id = EXCLUDED.job_id,
        order_date = EXCLUDED.order_date,
        shipment_date = EXCLUDED.shipment_date,
        client_name = EXCLUDED.client_name,
        cust_name = EXCLUDED.cust_name,
        product_type = EXCLUDED.product_type,
        total_qty = EXCLUDED.total_qty,
        subtotal = EXCLUDED.subtotal,
        cust_id = EXCLUDED.cust_id,
        cust_contact = EXCLUDED.cust_contact,
        cust_email = EXCLUDED.cust_email,
        payload_json = EXCLUDED.payload_json,
        is_invoiced = EXCLUDED.is_invoiced,
        calculated_subtotal = EXCLUDED.calculated_subtotal,
        calculated_tax = EXCLUDED.calculated_tax,
        calculated_total = EXCLUDED.calculated_total,
        ordered_by = EXCLUDED.ordered_by,
        is_deleted = EXCLUDED.is_deleted`,
      [
        row.ticket_no, row.job_id, row.order_date, row.shipment_date, row.client_name, row.cust_name,
        row.product_type, row.total_qty, row.subtotal, row.cust_id, row.cust_contact, row.cust_email,
        JSON.stringify(row.payload_json), row.is_invoiced, row.calculated_subtotal, row.calculated_tax, row.calculated_total,
        row.ordered_by, row.is_deleted,
      ],
    );
    count += 1;
  }
  return count;
}

async function upsertFeedback(client, rows, dryRun) {
  if (dryRun) return rows.length;
  let count = 0;
  for (const row of rows) {
    await client.query(
      `INSERT INTO feedback (feedback_id, submitted_at, feedback_text, payload_json)
      VALUES ($1, $2::timestamptz, $3, $4::jsonb)
      ON CONFLICT (feedback_id) DO UPDATE SET
        submitted_at = EXCLUDED.submitted_at,
        feedback_text = EXCLUDED.feedback_text,
        payload_json = EXCLUDED.payload_json`,
      [row.feedback_id, row.submitted_at, row.feedback_text, JSON.stringify(row.payload_json)],
    );
    count += 1;
  }
  return count;
}

async function upsertSeries(client, rows, dryRun) {
  if (dryRun) return rows.length;
  let count = 0;
  for (const row of rows) {
    await client.query(
      `INSERT INTO ticket_series (prefix, last_number, width)
       VALUES ($1, $2, COALESCE($3, 4))
       ON CONFLICT (prefix) DO UPDATE SET
        last_number = GREATEST(ticket_series.last_number, EXCLUDED.last_number),
        width = COALESCE(EXCLUDED.width, ticket_series.width)`,
      [row.prefix, row.last_number ?? 0, row.width],
    );
    count += 1;
  }
  return count;
}

function validateRequired(row, fields) {
  const missing = fields.filter((field) => row[field] == null || row[field] === '');
  return missing;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = buildReport();

  let pool = null;
  if (!args.dryRun) {
    const { Pool } = await import('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
  }

  const stableKeys = {
    jobs: 'ticket_no',
    customers: 'cust_id',
    feedback: 'feedback_id',
    series: 'prefix',
  };

  const normalizers = {
    jobs: normalizeJob,
    customers: normalizeCustomer,
    feedback: normalizeFeedback,
    series: normalizeSeries,
  };

  const required = {
    jobs: ['ticket_no'],
    customers: ['cust_id'],
    feedback: ['feedback_id', 'submitted_at', 'feedback_text'],
    series: ['prefix'],
  };

  const upserters = {
    jobs: upsertJobs,
    customers: upsertCustomers,
    feedback: upsertFeedback,
    series: upsertSeries,
  };

  let client = null;
  if (pool) {
    client = await pool.connect();
    await client.query('BEGIN');
  }

  try {
    for (const entity of ENTITIES) {
      const records = await readEntityRecords(args.dataDir, entity);
      const state = report.entities[entity];
      state.inputRows = records.length;
      state.duplicateStableKeys = trackDuplicates(records, stableKeys[entity]);

      const normalized = [];
      for (let idx = 0; idx < records.length; idx += 1) {
        const record = records[idx];
        if (!withinWindow(record, entity, args.since)) {
          state.skippedRows += 1;
          continue;
        }

        const row = normalizers[entity](record);
        const missing = validateRequired(row, required[entity]);
        if (missing.length) {
          state.invalidRecords.push({ index: idx, reason: `missing ${missing.join(', ')}`, stableKey: row[stableKeys[entity]] ?? null });
          state.skippedRows += 1;
          continue;
        }
        normalized.push(row);
      }

      state.processedRows = normalized.length;
      state.upsertedRows = await upserters[entity](client, normalized, args.dryRun);
    }

    if (client) await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    throw error;
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dryRun: args.dryRun,
    since: args.since ? args.since.toISOString() : null,
    entities: report.entities,
  };

  if (args.reportFile) {
    await fs.writeFile(args.reportFile, JSON.stringify(summary, null, 2));
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('[migrate] failed:', error);
  process.exitCode = 1;
});
