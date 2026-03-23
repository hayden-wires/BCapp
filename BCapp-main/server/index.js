import crypto from 'crypto';
import express from 'express';
import { Pool } from 'pg';
import { pathToFileURL } from 'url';

const PORT = Number(process.env.PORT || 8787);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function deriveInvoiceAmounts(row) {
  const subtotal = parseNumber(row?.calculated_subtotal ?? row?.subtotal, 0);
  const tax = parseNumber(row?.calculated_tax, 0);
  const derivedTotal = subtotal + tax;
  const total = parseNumber(row?.calculated_total, derivedTotal);
  const shippingRaw = Math.round((total - subtotal - tax) * 100) / 100;
  return {
    subtotal,
    tax,
    total,
    shipping: shippingRaw > 0 ? shippingRaw : 0,
  };
}

function ok(data) { return { ok: true, data }; }
function bad(error, errorId = null) {
  const body = { ok: false, error: String(error) };
  if (errorId) body.errorId = errorId;
  return body;
}
function requestId() { return crypto.randomUUID(); }
function nowMs() { return Number(process.hrtime.bigint() / BigInt(1000000)); }
function describeDatabaseTarget(connectionString) {
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    return {
      protocol: parsed.protocol.replace(':', ''),
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : null,
    };
  } catch {
    return null;
  }
}
function truthyParam(value) {
  const s = String(value ?? '').toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}
function withJsonFallback(req, _res, next) {
  if (typeof req.body === 'string' && req.body.trim()) {
    try { req.body = JSON.parse(req.body); } catch { req.body = {}; }
  }
  if (!req.body || typeof req.body !== 'object') req.body = {};
  next();
}
function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return {}; }
}
function isDeletedValue(value) {
  if (value === true) return true;
  const s = String(value ?? '').toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'deleted';
}

function normalizeCustomerRow(row) {
  return {
    custId: row.cust_id ? String(row.cust_id) : '',
    custName: row.cust_name ?? '', custContact: row.cust_contact ?? '', custEmail: row.cust_email ?? '',
    custPhone: row.cust_phone ?? '', custAddress: row.cust_address ?? '',
    shipLine1: row.ship_line1 ?? '', shipLine2: row.ship_line2 ?? '', shipCity: row.ship_city ?? '',
    shipState: row.ship_state ?? '', shipZip: row.ship_zip ?? '',
    billLine1: row.bill_line1 ?? '', billLine2: row.bill_line2 ?? '', billCity: row.bill_city ?? '',
    billState: row.bill_state ?? '', billZip: row.bill_zip ?? '',
    createdAt: row.created_at ?? '', updatedAt: row.updated_at ?? '', json: row.payload_json ?? '',
  };
}

function normalizeJobRow(row) {
  const job = parseJsonObject(row.payload_json);
  job.ticketNo = row.ticket_no;
  job.isInvoiced = row.is_invoiced;
  job.orderDate = row.order_date;
  if (row.calculated_subtotal != null) job.subtotal = Number(row.calculated_subtotal);
  if (row.calculated_tax != null) job.tax = Number(row.calculated_tax);
  if (row.calculated_total != null) job.grandTotal = Number(row.calculated_total);
  if (job.orderedBy === undefined) job.orderedBy = row.ordered_by ?? '';
  job.isDeleted = isDeletedValue(row.is_deleted) || isDeletedValue(job.isDeleted);
  const companyName = row.client_name || row.cust_name || '';
  job.custId = row.cust_id ? String(row.cust_id) : '';
  if (companyName) job.custName = companyName;
  if (row.cust_contact) job.custContact = row.cust_contact;
  if (!job.customer) job.customer = {};
  job.customer.custId = job.custId;
  job.customer.custName = job.custName;
  job.customer.custContact = job.custContact;
  return job;
}

async function inTx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}

async function allocateTicket(prefix = 'BC') {
  return inTx(async (client) => {
    const p = String(prefix || 'BC').trim().toUpperCase();
    let row = (await client.query('SELECT prefix, last_number, width FROM ticket_series WHERE prefix = $1 FOR UPDATE', [p])).rows[0];
    if (!row) row = (await client.query('INSERT INTO ticket_series(prefix, last_number, width) VALUES ($1, 1, 4) RETURNING prefix, last_number, width', [p])).rows[0];
    else row = (await client.query('UPDATE ticket_series SET last_number = last_number + 1 WHERE prefix = $1 RETURNING prefix, last_number, width', [p])).rows[0];
    return { ticketNo: String(row.last_number).padStart(Number(row.width) || 4, '0') + row.prefix };
  });
}

async function allocateTicketInTx(client, prefix = 'BC') {
  const p = String(prefix || 'BC').trim().toUpperCase();
  let row = (await client.query('SELECT prefix, last_number, width FROM ticket_series WHERE prefix = $1 FOR UPDATE', [p])).rows[0];
  if (!row) row = (await client.query('INSERT INTO ticket_series(prefix, last_number, width) VALUES ($1, 1, 4) RETURNING prefix, last_number, width', [p])).rows[0];
  else row = (await client.query('UPDATE ticket_series SET last_number = last_number + 1 WHERE prefix = $1 RETURNING prefix, last_number, width', [p])).rows[0];
  return String(row.last_number).padStart(Number(row.width) || 4, '0') + row.prefix;
}

async function peekNext(prefix = 'BC') {
  const p = String(prefix || 'BC').trim().toUpperCase();
  const row = (await pool.query('SELECT prefix, last_number, width FROM ticket_series WHERE prefix = $1', [p])).rows[0];
  if (!row) return { suggestion: `0001${p}`, prefix: p, next: 1 };
  const next = Number(row.last_number) + 1;
  return { suggestion: String(next).padStart(Number(row.width) || 4, '0') + row.prefix, prefix: row.prefix, next };
}

async function upsertJob(inputJob, isNew, client = null) {
  const job = inputJob || {};
  const ticketNo = String(job.ticketNo || job.jobId || '').trim();
  if (!ticketNo) throw new Error('Job is missing ticketNo/jobId');
  const runner = client ? async (fn) => fn(client) : inTx;
  return runner(async (tx) => {
    const existing = (await tx.query('SELECT * FROM jobs WHERE ticket_no = $1 FOR UPDATE', [ticketNo])).rows[0];
    if (isNew && existing) throw new Error('ERROR_DUPLICATE_TICKET');
    if (existing && existing.is_deleted && !job.allowUpdateDeleted) throw new Error('ERROR_JOB_DELETED');
    const companyName = job.clientName || job.custName || job.customer?.custName || '';
    const contactName = job.custContact || job.customer?.custContact || '';
    const incomingCustId = String(job.custId || job.customer?.custId || '').trim();
    let resolvedCustId = incomingCustId || null;

    if (incomingCustId) {
      const customerExists = (await tx.query('SELECT 1 FROM customers WHERE cust_id = $1 LIMIT 1', [incomingCustId])).rows[0];
      if (!customerExists) {
        const customerName = companyName || job.customer?.name || '';
        if (!customerName) throw new Error(`ERROR_UNKNOWN_CUSTOMER_ID:${incomingCustId}`);
        await upsertCustomer({
          custId: incomingCustId,
          custName: customerName,
          custContact: contactName,
          custEmail: job.custEmail || job.customer?.custEmail || null,
          custPhone: job.custPhone || job.customer?.custPhone || null,
          custAddress: job.custAddress || job.customer?.custAddress || null,
          shipLine1: job.shippingLine1 || job.customer?.shipLine1 || null,
          shipLine2: job.shippingLine2 || job.customer?.shipLine2 || null,
          shipCity: job.shippingCity || job.customer?.shipCity || null,
          shipState: job.shippingRegion || job.customer?.shipState || null,
          shipZip: job.shippingZip || job.customer?.shipZip || null,
          billLine1: job.billingLine1 || job.customer?.billLine1 || null,
          billLine2: job.billingLine2 || job.customer?.billLine2 || null,
          billCity: job.billingCity || job.customer?.billCity || null,
          billState: job.billingRegion || job.customer?.billState || null,
          billZip: job.billingZip || job.customer?.billZip || null,
        }, tx);
      }
    }

    const values = [ticketNo, ticketNo, job.orderDate || null, job.shipmentDate || null, companyName, companyName, job.productName || 'Business Cards', job.totalQty || 0, job.subtotal || job.priceTotal || 0, resolvedCustId, contactName, job.custEmail || null, JSON.stringify(job), Boolean(job.isInvoiced), job.calculatedSubtotal || null, job.calculatedTax || null, job.calculatedTotal || null, job.orderedBy || '', existing ? existing.is_deleted : Boolean(job.isDeleted)];

    const updated = await tx.query(`UPDATE jobs
      SET job_id = $2,
          order_date = COALESCE($3::timestamptz, now()),
          shipment_date = $4::timestamptz,
          client_name = $5,
          cust_name = $6,
          product_type = $7,
          total_qty = $8,
          subtotal = $9,
          cust_id = $10,
          cust_contact = $11,
          cust_email = $12,
          payload_json = $13::jsonb,
          is_invoiced = $14,
          calculated_subtotal = $15,
          calculated_tax = $16,
          calculated_total = $17,
          ordered_by = $18,
          is_deleted = $19
      WHERE ticket_no = $1`, values);

    if (updated.rowCount === 0) {
      await tx.query(`INSERT INTO jobs (ticket_no, job_id, order_date, shipment_date, client_name, cust_name, product_type, total_qty, subtotal, cust_id, cust_contact, cust_email, payload_json, is_invoiced, calculated_subtotal, calculated_tax, calculated_total, ordered_by, is_deleted)
        VALUES ($1,$2,COALESCE($3::timestamptz, now()),$4::timestamptz,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)`, values);
    }

    return existing ? { updated: true, ticketNo } : { created: true, ticketNo };
  });
}

async function createJobAtomic(inputJob) {
  const job = inputJob || {};
  return inTx(async (client) => {
    const ticketNo = await allocateTicketInTx(client, job.ticketPrefix || 'BC');
    const payload = { ...job, ticketNo, jobId: job.jobId || ticketNo };
    await upsertJob(payload, true, client);
    return { created: true, ticketNo };
  });
}

async function toggleInvoiced(payload) {
  const ticketNo = String(payload?.ticketNo || '').trim();
  if (!ticketNo) throw new Error('toggleInvoiced requires ticketNo');
  const result = await pool.query('UPDATE jobs SET is_invoiced = $2 WHERE ticket_no = $1', [ticketNo, Boolean(payload?.status)]);
  if (result.rowCount === 0) throw new Error('Job not found');
  return { ok: true };
}

async function markDeleted(payload) {
  const ticketNo = String(payload?.ticketNo || payload?.jobId || '').trim();
  if (!ticketNo) throw new Error('markDeleted requires ticketNo');
  return inTx(async (client) => {
    const row = (await client.query('SELECT payload_json FROM jobs WHERE ticket_no = $1 FOR UPDATE', [ticketNo])).rows[0];
    if (!row) throw new Error('Job not found');
    const json = parseJsonObject(row.payload_json);
    json.isDeleted = true;
    json.deletedAt = new Date().toISOString();
    if (payload?.source) json.deleteSource = String(payload.source);
    await client.query('UPDATE jobs SET is_deleted = TRUE, payload_json = $2::jsonb WHERE ticket_no = $1', [ticketNo, JSON.stringify(json)]);
    return { ok: true, ticketNo, isDeleted: true };
  });
}

async function restoreDeleted(payload) {
  const ticketNo = String(payload?.ticketNo || payload?.jobId || '').trim();
  if (!ticketNo) throw new Error('restoreDeleted requires ticketNo');
  return inTx(async (client) => {
    const row = (await client.query('SELECT payload_json FROM jobs WHERE ticket_no = $1 FOR UPDATE', [ticketNo])).rows[0];
    if (!row) throw new Error('Job not found');
    const json = parseJsonObject(row.payload_json);
    json.isDeleted = false;
    json.restoredAt = new Date().toISOString();
    if (payload?.source) json.restoreSource = String(payload.source);
    if (payload?.restoredBy) json.restoredBy = String(payload.restoredBy);
    await client.query('UPDATE jobs SET is_deleted = FALSE, payload_json = $2::jsonb WHERE ticket_no = $1', [ticketNo, JSON.stringify(json)]);
    return { ok: true, ticketNo, isDeleted: false };
  });
}

async function getJob(ticketNo) {
  const ticket = String(ticketNo || '').trim();
  if (!ticket) throw new Error('ticketNo required');
  const row = (await pool.query('SELECT * FROM jobs WHERE ticket_no = $1 LIMIT 1', [ticket])).rows[0];
  return row ? normalizeJobRow(row) : null;
}

async function search(q, options = {}) {
  const includeDeleted = Boolean(options.includeDeleted);
  const query = String(q ?? '').trim();
  const rows = (await pool.query(`SELECT * FROM jobs WHERE ($1::boolean OR is_deleted = FALSE)
      AND ($2 = '' OR ticket_no ILIKE ('%' || $2 || '%') OR client_name ILIKE ('%' || $2 || '%') OR cust_name ILIKE ('%' || $2 || '%') OR COALESCE(payload_json::text, '') ILIKE ('%' || $2 || '%'))
      ORDER BY order_date DESC NULLS LAST, updated_at DESC LIMIT 50`, [includeDeleted, query])).rows;
  return rows.map(normalizeJobRow);
}

async function getInvoices(startStr, endStr, options = {}) {
  const includeDeleted = Boolean(options.includeDeleted);
  const start = startStr || `${new Date().getFullYear()}-01-01`;
  const end = endStr || new Date().toISOString();
  const rows = (await pool.query(`SELECT * FROM jobs WHERE order_date >= $1::timestamptz AND order_date <= $2::timestamptz AND ($3::boolean OR is_deleted = FALSE) ORDER BY order_date DESC`, [start, end, includeDeleted])).rows;
  return rows.map((row) => {
    const { subtotal, tax, total, shipping } = deriveInvoiceAmounts(row);
    return { date: row.order_date?.toISOString?.() || new Date(row.order_date).toISOString(), ticketNo: row.ticket_no || 'Unknown', customer: row.client_name || row.cust_name || 'Unknown', subtotal, tax, shipping, total, isInvoiced: row.is_invoiced, isDeleted: row.is_deleted };
  });
}

async function listCustomers() {
  const rows = (await pool.query('SELECT * FROM customers ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST')).rows;
  return rows.map(normalizeCustomerRow);
}

async function upsertCustomer(customer, client = null) {
  const c = customer || {};
  if (!c.custName && !c.name) throw new Error('upsertCustomer requires at least custName');

  const runner = client ? async (fn) => fn(client) : inTx;
  return runner(async (tx) => {
    let finalId = c.custId ? String(c.custId) : '';
    if (!finalId) {
      const existingByName = (await tx.query('SELECT cust_id FROM customers WHERE lower(cust_name) = lower($1) LIMIT 1', [c.custName || c.name])).rows[0];
      if (existingByName) finalId = String(existingByName.cust_id);
      else {
        const max = (await tx.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(cust_id, '[^0-9]', '', 'g'), '')::int), 0) AS max_id FROM customers")).rows[0];
        finalId = String(Number(max.max_id || 0) + 1);
      }
    }

    const result = (await tx.query(`INSERT INTO customers (cust_id,cust_name,cust_contact,cust_email,cust_phone,cust_address,ship_line1,ship_line2,ship_city,ship_state,ship_zip,bill_line1,bill_line2,bill_city,bill_state,bill_zip,created_at,updated_at,payload_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now(),$17::jsonb)
      ON CONFLICT (cust_id) DO UPDATE SET cust_name=EXCLUDED.cust_name,cust_contact=EXCLUDED.cust_contact,cust_email=EXCLUDED.cust_email,cust_phone=EXCLUDED.cust_phone,cust_address=EXCLUDED.cust_address,ship_line1=EXCLUDED.ship_line1,ship_line2=EXCLUDED.ship_line2,ship_city=EXCLUDED.ship_city,ship_state=EXCLUDED.ship_state,ship_zip=EXCLUDED.ship_zip,bill_line1=EXCLUDED.bill_line1,bill_line2=EXCLUDED.bill_line2,bill_city=EXCLUDED.bill_city,bill_state=EXCLUDED.bill_state,bill_zip=EXCLUDED.bill_zip,updated_at=now(),payload_json=EXCLUDED.payload_json RETURNING *`,
      [finalId, c.custName || c.name || '', c.custContact || null, c.custEmail || null, c.custPhone || null, c.custAddress || null, c.shipLine1 || null, c.shipLine2 || null, c.shipCity || null, c.shipState || null, c.shipZip || null, c.billLine1 || null, c.billLine2 || null, c.billCity || null, c.billState || null, c.billZip || null, JSON.stringify(c)])).rows[0];
    return { ok: true, customer: { ...normalizeCustomerRow(result), ...c, custId: finalId } };
  });
}

async function bulkUpsertCustomers(customers) {
  if (!Array.isArray(customers)) throw new Error('customers must be an array');
  await inTx(async (tx) => {
    for (const c of customers) {
      if (c) await upsertCustomer(c, tx);
    }
  });
  return { ok: true };
}

async function submitFeedback(payload) {
  const feedbackId = String(payload?.feedbackId || '').trim();
  const submittedAt = String(payload?.submittedAt || '').trim();
  const feedbackText = String(payload?.feedbackText || '').trim();
  if (!feedbackId) throw new Error('feedbackId required');
  if (!submittedAt) throw new Error('submittedAt required');
  if (!feedbackText) throw new Error('feedbackText required');
  await pool.query('INSERT INTO feedback (feedback_id, submitted_at, feedback_text, payload_json) VALUES ($1, $2::timestamptz, $3, $4::jsonb) ON CONFLICT (feedback_id) DO UPDATE SET submitted_at=EXCLUDED.submitted_at, feedback_text=EXCLUDED.feedback_text, payload_json=EXCLUDED.payload_json', [feedbackId, submittedAt, feedbackText, JSON.stringify(payload)]);
  return { created: true, feedbackId };
}

const postHandlers = {
  allocateticket: ({ payload }) => allocateTicket(payload?.prefix || 'BC'),
  createjob: ({ payload }) => createJobAtomic(payload?.job || payload || {}),
  upsertjob: ({ payload }) => upsertJob(payload?.job || payload || {}, Boolean(payload?.isNew)),
  jobs: ({ payload }) => upsertJob(payload?.job || payload || {}, Boolean(payload?.isNew)),
  savejob: ({ payload }) => upsertJob(payload?.job || payload || {}, Boolean(payload?.isNew)),
  toggleinvoiced: ({ payload }) => toggleInvoiced(payload || {}),
  markdeleted: ({ payload }) => markDeleted(payload || {}),
  restoredeleted: ({ payload }) => restoreDeleted(payload || {}),
  softdelete: ({ payload }) => markDeleted(payload || {}),
  deletejob: ({ payload }) => markDeleted(payload || {}),
  upsertcustomer: ({ payload }) => upsertCustomer(payload?.customer || payload || {}),
  'customers/upsert': ({ payload }) => upsertCustomer(payload?.customer || payload || {}),
  'customers/bulk': ({ payload }) => bulkUpsertCustomers(payload?.customers || []),
  'bulk/customers': ({ payload }) => bulkUpsertCustomers(payload?.customers || []),
  submitfeedback: ({ payload }) => submitFeedback(payload || {}),
};

const getHandlers = {
  job: ({ query }) => getJob(query.ticketNo),
  search: ({ query }) => search(query.q, { includeDeleted: truthyParam(query.includeDeleted) }),
  jobs: ({ query }) => search(query.q, { includeDeleted: truthyParam(query.includeDeleted) }),
  getjobs: ({ query }) => search(query.q, { includeDeleted: truthyParam(query.includeDeleted) }),
  invoices: ({ query }) => getInvoices(query.start, query.end, { includeDeleted: truthyParam(query.includeDeleted) }),
  getinvoices: ({ query }) => getInvoices(query.start, query.end, { includeDeleted: truthyParam(query.includeDeleted) }),
  customers: () => listCustomers(),
  getcustomers: () => listCustomers(),
  peeknext: ({ query }) => peekNext(query.prefix || 'BC'),
};

function parseAllowlist(value) {
  if (!value) return [];
  return String(value).split(',').map((entry) => entry.trim()).filter(Boolean);
}

function mapApiError(err) {
  const message = String(err?.message || err || 'Unknown error');
  if (err?.code === '23503' && err?.constraint === 'jobs_cust_id_fk') {
    return { status: 400, body: bad('Invalid custId: no matching customer exists. Upsert the customer first or omit custId.') };
  }
  if (message.startsWith('ERROR_UNKNOWN_CUSTOMER_ID:')) {
    const custId = message.split(':')[1] || '';
    return { status: 400, body: bad(`Invalid custId '${custId}': no matching customer exists and customer name is missing for auto-upsert.`) };
  }
  return null;
}

export function createApp(options = {}) {
  const appInstance = express();
  const postHandlerMap = options.postHandlers || postHandlers;
  const getHandlerMap = options.getHandlers || getHandlers;
  const env = options.env || process.env;

  const authRequired = truthyParam(env.API_AUTH_REQUIRED);
  const authKey = String(env.API_AUTH_KEY || '').trim();
  const authHeaderName = String(env.API_AUTH_HEADER || 'x-api-key').toLowerCase();
  const nodeEnv = String(env.NODE_ENV || '').toLowerCase().trim();
  const isProduction = nodeEnv === 'production';

  const rateLimitEnabled = truthyParam(env.API_RATE_LIMIT_ENABLED) || isProduction;
  const rateLimitWindowMs = parseNumber(env.API_RATE_LIMIT_WINDOW_MS, 60_000);
  const rateLimitMax = parseNumber(env.API_RATE_LIMIT_MAX, 120);
  const rateLimitStore = new Map();

  const corsAllowlist = parseAllowlist(env.API_CORS_ALLOWLIST);

  const dbTarget = describeDatabaseTarget(env.DATABASE_URL);
  if (dbTarget) {
    console.log(JSON.stringify({
      event: 'db_target',
      host: dbTarget.host,
      port: dbTarget.port,
      database: dbTarget.database,
      protocol: dbTarget.protocol,
    }));
  }

  appInstance.use(express.json());
  appInstance.use(express.text({ type: 'text/plain' }));

  appInstance.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin) return next();

    const isPreflight = req.method === 'OPTIONS';

    if (corsAllowlist.length === 0) {
      if (isProduction) {
        if (isPreflight) return res.status(403).end();
        return res.status(403).json(bad('CORS not configured: API_CORS_ALLOWLIST is empty'));
      }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', `${authHeaderName}, authorization, content-type`);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (isPreflight) return res.status(204).end();
      return next();
    }

    if (corsAllowlist.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', `${authHeaderName}, authorization, content-type`);
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (isPreflight) return res.status(204).end();
      return next();
    }

    if (isPreflight) return res.status(403).end();
    return res.status(403).json(bad('CORS origin denied'));
  });

  appInstance.use((req, res, next) => {
    const startedAtMs = nowMs();
    const reqId = requestId();
    req.reqId = reqId;
    res.setHeader('x-request-id', reqId);
    res.on('finish', () => {
      const durationMs = nowMs() - startedAtMs;
      const action = req.method === 'GET' ? req.query?.action : req.body?.action;
      console.log(JSON.stringify({
        event: 'http_request',
        reqId,
        method: req.method,
        path: req.originalUrl,
        action: action || null,
        status: res.statusCode,
        durationMs,
      }));
    });
    next();
  });

  appInstance.use((req, res, next) => {
    if (!rateLimitEnabled || req.path !== '/api') return next();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const existing = rateLimitStore.get(key);
    if (!existing || now >= existing.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
      return next();
    }
    if (existing.count >= rateLimitMax) {
      res.setHeader('Retry-After', String(Math.ceil((existing.resetAt - now) / 1000)));
      return res.status(429).json(bad('Rate limit exceeded'));
    }
    existing.count += 1;
    return next();
  });

  appInstance.use((req, res, next) => {
    if (!authRequired || req.path !== '/api') return next();
    if (!authKey) return res.status(500).json(bad('Server auth misconfigured'));
    const fromCustom = String(req.headers[authHeaderName] || '').trim();
    const authHeader = String(req.headers.authorization || '').trim();
    const fromBearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
    const provided = fromCustom || fromBearer;
    if (!provided) return res.status(401).json(bad('API key required'));
    const providedBuffer = Buffer.from(provided);
    const authBuffer = Buffer.from(authKey);
    const valid = providedBuffer.length == authBuffer.length && crypto.timingSafeEqual(providedBuffer, authBuffer);
    if (!valid) return res.status(403).json(bad('Invalid API key'));
    return next();
  });

  appInstance.post('/api', withJsonFallback, async (req, res) => {
    try {
      const actionRaw = req.body.action || '';
      const action = String(actionRaw).toLowerCase();
      const handler = postHandlerMap[action];
      if (!handler) return res.status(400).json(bad(`Unknown action: ${actionRaw}`));
      const data = await handler({ payload: req.body.payload || {} });
      if (action === 'createjob') {
        console.log(JSON.stringify({
          event: 'create_job',
          reqId: req.reqId || null,
          action: actionRaw,
          ticketNo: data?.ticketNo || null,
          created: Boolean(data?.created),
        }));
      }
      return res.json(ok(data));
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      const errorId = requestId();
      console.error(JSON.stringify({ event: 'api_error', reqId: req.reqId || null, errorId, route: '/api', method: 'POST', message: err?.message || String(err) }));
      return res.status(500).json(bad(err?.message || err, errorId));
    }
  });

  appInstance.get('/api', async (req, res) => {
    try {
      const action = String(req.query.action || '').toLowerCase();
      const handler = getHandlerMap[action];
      if (!handler) return res.status(400).json(bad('Unknown action/path'));
      return res.json(ok(await handler({ query: req.query })));
    } catch (err) {
      const mapped = mapApiError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      const errorId = requestId();
      console.error(JSON.stringify({ event: 'api_error', reqId: req.reqId || null, errorId, route: '/api', method: 'GET', message: err?.message || String(err) }));
      return res.status(500).json(bad(err?.message || err, errorId));
    }
  });

  appInstance.get('/healthz', (_req, res) => res.json({ ok: true, artifact: { createJobFlow: 'createJobAtomic->upsertJob(update_or_insert)', postActions: Object.keys(postHandlerMap) }, databaseTarget: dbTarget }));

  return appInstance;
}

const app = createApp();

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(PORT, () => {
    console.log(`Compatibility API listening on http://localhost:${PORT}`);
  });
}
