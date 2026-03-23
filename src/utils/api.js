// src/utils/api.js

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
let didLogBaseUrlFailureHint = false;

function logBaseUrlFailureHintOnce(error, action) {
  if (didLogBaseUrlFailureHint) return;
  didLogBaseUrlFailureHint = true;
  const actionHint = action ? ` while calling action "${action}"` : "";
  console.error(
    `[API] Compatibility API request failed${actionHint}. Resolved API base URL: "${API_BASE_URL}". ` +
      "If this is production, set VITE_API_BASE_URL to your deployed compatibility API URL. " +
      "For local development, keep VITE_API_BASE_URL unset so Vite can proxy /api to npm run server.",
    error
  );
}

async function withBaseUrlFailureHint(action, request) {
  try {
    return await request();
  } catch (error) {
    logBaseUrlFailureHintOnce(error, action);
    throw error;
  }
}

function makeId(prefix = "fb") {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // ignore
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function parseApiResponse(res) {
  const text = await res.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("API non-JSON response:", text);
    throw new Error("API response was not valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("API returned an unexpected response");
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || "API returned an error");
  }

  return parsed.data;
}

async function callApi(action, payload = {}) {
  if (!action) throw new Error("callApi requires an action");

  return withBaseUrlFailureHint(action, async () => {
    const res = await fetch(API_BASE_URL, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!res.ok) {
      throw new Error(`API request failed (${res.status})`);
    }

    return await parseApiResponse(res);
  });
}

async function fetchApi(params = {}) {
  return withBaseUrlFailureHint(params?.action, async () => {
    const url = new URL(API_BASE_URL, window.location.origin);
    Object.keys(params).forEach((key) => url.searchParams.set(key, params[key]));

    const res = await fetch(url.toString(), { method: "GET" });

    if (!res.ok) {
      throw new Error(`API request failed (${res.status})`);
    }

    return await parseApiResponse(res);
  });
}

export async function probeApiStatus(prefix = "BC") {
  try {
    await fetchApi({ action: "peekNext", prefix });
    return { ok: true, baseUrl: API_BASE_URL };
  } catch (error) {
    return {
      ok: false,
      baseUrl: API_BASE_URL,
      error: error?.message || "Unknown API connectivity error",
    };
  }
}

function getTicketNoFromJob(job) {
  return job?.ticketNo || job?.jobId || null;
}

function normalizeJobForSave(job) {
  const ticketNo = getTicketNoFromJob(job);
  if (!ticketNo) throw new Error("Job is missing ticketNo/jobId");

  return {
    ...job,
    ticketNo,
    jobId: job.jobId || ticketNo,
  };
}

function normalizeIncludeDeleted(includeDeleted) {
  return includeDeleted ? "1" : "0";
}

export async function submitFeedback(feedbackText) {
  const text = (feedbackText ?? "").toString().trim();
  if (!text) throw new Error("submitFeedback requires feedbackText");

  const payload = {
    feedbackId: makeId(),
    submittedAt: new Date().toISOString(),
    feedbackText: text,
  };

  return await callApi("submitFeedback", payload);
}

export async function peekNextTicket(prefix = "BC") {
  return await fetchApi({ action: "peekNext", prefix });
}

export async function allocateTicket(prefix = "BC") {
  const data = await callApi("allocateTicket", { prefix });

  const ticketNo = data?.ticketNo || data?.ticket || data?.ticketNumber || null;

  if (!ticketNo) {
    throw new Error("allocateTicket response did not contain a ticket number");
  }

  return { ...data, ticketNo };
}

export async function saveJob(job, isNew = false) {
  const normalizedJob = normalizeJobForSave(job);
  return await callApi("upsertJob", { job: normalizedJob, isNew: !!isNew });
}

export async function updateJob(job) {
  const normalizedJob = normalizeJobForSave(job);
  return await callApi("upsertJob", { job: normalizedJob, isNew: false });
}

export async function createJob(job) {
  return await callApi("createJob", { job: { ...(job || {}) } });
}

export async function toggleJobInvoiced(ticketNo, status) {
  if (!ticketNo) throw new Error("toggleJobInvoiced requires ticketNo");
  return await callApi("toggleInvoiced", { ticketNo, status: !!status });
}

/**
 * Soft delete: mark job as deleted in the sheet (explicit state transition).
 * Backend action expected: "markDeleted"
 *
 * meta fields are optional but allow audit trails.
 * - deletedAt: ISO timestamp (frontend can supply, backend can also override)
 * - deletedBy: string (if you have a user identity)
 * - reason: string
 */
export async function softDeleteJob(ticketNo, meta = {}) {
  if (!ticketNo) throw new Error("softDeleteJob requires ticketNo");

  const payload = {
    ticketNo: String(ticketNo),
    meta: {
      deletedAt: meta?.deletedAt || new Date().toISOString(),
      deletedBy: meta?.deletedBy || "",
      reason: meta?.reason || "",
    },
  };

  return await callApi("markDeleted", payload);
}

/**
 * Optional: restore a soft-deleted job later.
 * Backend action expected: "restoreDeleted"
 */
export async function restoreJob(ticketNo, meta = {}) {
  if (!ticketNo) throw new Error("restoreJob requires ticketNo");

  const payload = {
    ticketNo: String(ticketNo),
    meta: {
      restoredAt: meta?.restoredAt || new Date().toISOString(),
      restoredBy: meta?.restoredBy || "",
      reason: meta?.reason || "",
    },
  };

  return await callApi("restoreDeleted", payload);
}

/**
 * Search jobs.
 * includeDeleted:
 * - false (default): backend should exclude deleted
 * - true: backend includes deleted results
 *
 * IMPORTANT: This requires Apps Script to accept includeDeleted and apply filtering.
 */
export async function searchJobs(query, options = {}) {
  const q = (query ?? "").toString().trim();
  if (!q) return [];

  const includeDeleted = !!options.includeDeleted;

  const results = await fetchApi({
    action: "search",
    q,
    includeDeleted: normalizeIncludeDeleted(includeDeleted),
  });

  return Array.isArray(results) ? results : [];
}

/**
 * Fetch job list (same endpoint as search with empty query).
 * includeDeleted:
 * - false (default): backend should exclude deleted
 * - true: backend includes deleted rows
 */
export async function fetchJobs(options = {}) {
  const includeDeleted = !!options.includeDeleted;

  const list = await fetchApi({
    action: "search",
    q: "",
    includeDeleted: normalizeIncludeDeleted(includeDeleted),
  });

  return Array.isArray(list) ? list : [];
}

export async function fetchJobDetails(ticketNo) {
  if (!ticketNo) throw new Error("fetchJobDetails requires ticketNo");
  return await fetchApi({ action: "job", ticketNo });
}

export async function fetchInvoices(start = "", end = "") {
  const data = await fetchApi({ action: "invoices", start, end });
  return Array.isArray(data) ? data : [];
}

export async function fetchCustomers() {
  const list = await fetchApi({ action: "customers" });
  return Array.isArray(list) ? list : [];
}

export async function upsertCustomer(customer) {
  if (!customer || !customer.custName) {
    throw new Error("upsertCustomer requires at least custName");
  }
  return await callApi("upsertCustomer", { customer });
}

export async function bulkUpsertCustomers(customers) {
  if (!Array.isArray(customers) || customers.length === 0) {
    throw new Error("bulkUpsertCustomers requires an array of customers");
  }
  return await callApi("customers/bulk", { customers });
}
