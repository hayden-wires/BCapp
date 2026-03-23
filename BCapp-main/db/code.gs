/** === CONFIG === */
const CFG = {
  SHEET_SERIES: "series",
  SHEET_JOBS: "jobs",
  SHEET_CUSTOMERS: "customers",
  SHEET_FEEDBACK: "feedback",

  JOBS_HEADERS: [
    "ticketNo", "jobId", "orderDate", "shipmentDate", "clientName",
    "productType", "sides", "versions", "qtyPerVersion", "totalQty", "site",
    "subtotal", "printedAt", "printedBy",
    "custId", "custName", "custContact", "custEmail", "custPhone", "custAddress",
    "json", "calculatedSubtotal", "calculatedTax", "calculatedTotal", "overrideSubtotal", "isInvoiced",
    "orderedBy",
    "isDeleted",
  ],
  CUSTOMERS_HEADERS: [
    "custId", "custName", "custContact", "custEmail", "custPhone", "custAddress",
    "shipLine1", "shipLine2", "shipCity", "shipState", "shipZip",
    "billLine1", "billLine2", "billCity", "billState", "billZip",
    "createdAt", "updatedAt", "json",
  ],

  FEEDBACK_HEADERS: ["feedbackId", "submittedAt", "feedbackText"],
};

/** === ENTRYPOINTS === */
function doPost(e) {
  try {
    const body = JSON.parse(e && e.postData ? e.postData.contents : "{}");
    const rawAction = body.action || "";
    const action = String(rawAction).toLowerCase();
    const payload = body.payload || {};

    if (action === "allocateticket") return json(ok(allocateTicket(payload.prefix || "BC")));

    // NOTE: Front-end sends { job, isNew } for upsertJob
    if (action === "upsertjob" || action === "jobs" || action === "savejob") {
      const jobObj = payload.job || payload;
      const isNew = !!payload.isNew;
      return json(ok(upsertJob(jobObj, isNew)));
    }

    if (action === "toggleinvoiced") return json(ok(handleToggleInvoiced(payload)));

    // Soft delete
    if (action === "markdeleted" || action === "softdelete" || action === "deletejob") {
      return json(ok(markDeleted(payload)));
    }

    if (action === "upsertcustomer" || action === "customers/upsert") {
      return json(ok(upsertCustomer(payload.customer || payload)));
    }
    if (action === "customers/bulk" || action === "bulk/customers") {
      return json(ok(bulkUpsertCustomers(payload.customers || [])));
    }

    // Feedback submission
    if (action === "submitfeedback") {
      return json(ok(submitFeedback(payload)));
    }

    return json(bad("Unknown action: " + rawAction));
  } catch (err) {
    return json(fail(err));
  }
}

function doGet(e) {
  try {
    const action = (e.parameter.action || "").toLowerCase();

    if (action === "job") return json(ok(getJob(e.parameter.ticketNo)));

    if (action === "search") {
      const includeDeleted = truthyParam(e.parameter.includeDeleted);
      return json(ok(searchJobs(e.parameter.q, { includeDeleted: includeDeleted })));
    }

    if (action === "jobs" || action === "getjobs") {
      const limit = Math.max(1, Math.min(500, parseInt(e.parameter.limit || "50", 10)));
      const includeDeleted = truthyParam(e.parameter.includeDeleted);
      return json(ok(listJobs(limit, { includeDeleted: includeDeleted })));
    }

    if (action === "invoices" || action === "getinvoices") {
      // IMPORTANT: invoices must exclude soft-deleted rows by default
      const includeDeleted = truthyParam(e.parameter.includeDeleted);
      return json(ok(getInvoices(e.parameter.start, e.parameter.end, { includeDeleted })));
    }

    if (action === "peeknext") return json(ok(peekNext(e.parameter.prefix || "BC")));
    if (action === "customers" || action === "getcustomers") return json(ok(listCustomers()));

    return json(bad("Unknown action/path"));
  } catch (err) {
    return json(fail(err));
  }
}

/** === CORE HELPERS === */

// 1) DYNAMIC HEADER FINDER (case-insensitive, strips non-alphanumerics)
function getHeaderMap(sheet) {
  if (!sheet) return { map: {}, raw: [] };
  const lastCol = sheet.getLastColumn();
  const headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
    map[key] = i;
  });
  return { map, raw: headers };
}

// 2) Ensure a sheet exists and (optionally) has the expected headers.
function ensureSheetWithHeaders(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error("Sheet not found: " + sheetName);

  const lastCol = sh.getLastColumn();
  const firstRow = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const hasAnyHeader = firstRow.some((v) => String(v || "").trim() !== "");

  if (!hasAnyHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sh;
}

function truthyParam(v) {
  const s = String(v || "").toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function normalizeTicketStr(v) {
  return String(v == null ? "" : v).trim();
}

function isDeletedValue(v) {
  if (v === true) return true;
  const s = String(v == null ? "" : v).toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "deleted";
}

function findJobRowIndexByTicket(sheet, headerMap, ticketNo) {
  const idxTicket = headerMap["ticketno"];
  if (idxTicket === undefined) throw new Error("Ticket column not found");

  const needle = normalizeTicketStr(ticketNo);
  if (!needle) throw new Error("ticketNo required");

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeTicketStr(data[i][idxTicket]) === needle) return i; // 0-based row index in data array
  }
  return -1;
}

// 3) Load customer data for fuzzy ID inference
function getCustomerData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_CUSTOMERS);
  if (!sh) return null;

  const { map } = getHeaderMap(sh);

  const idxID = map["custid"];
  const idxName = map["custname"];
  const idxContact = map["custcontact"];

  if (idxID === undefined || idxName === undefined) return null;

  const data = sh.getDataRange().getValues();
  const rows = data.slice(1);
  return { rows, idxID, idxName, idxContact };
}

function findCustId(customerData, searchName) {
  if (!customerData || !searchName) return "";

  const cleanSearch = String(searchName).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleanSearch) return "";

  const { rows, idxID, idxName, idxContact } = customerData;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const nameRaw = String(row[idxName] || "");
    const cleanName = nameRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleanName && (cleanName.includes(cleanSearch) || cleanSearch.includes(cleanName))) {
      return String(row[idxID]);
    }

    if (idxContact !== undefined) {
      const contactRaw = String(row[idxContact] || "");
      const cleanContact = contactRaw.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanContact && (cleanContact.includes(cleanSearch) || cleanSearch.includes(cleanContact))) {
        return String(row[idxID]);
      }
    }
  }

  return "";
}

function parseJobRow(row, headerMap, customerData) {
  let job = {};

  const idxJson = headerMap["json"];
  if (idxJson !== undefined && row[idxJson]) {
    try {
      job = JSON.parse(row[idxJson]);
    } catch (e) {}
  }

  const idxTicket = headerMap["ticketno"];
  const idxCustId = headerMap["custid"];
  const idxClientName = headerMap["clientname"];
  const idxCustName = headerMap["custname"];
  const idxContact = headerMap["custcontact"];
  const idxInvoiced = headerMap["isinvoiced"];
  const idxDate = headerMap["orderdate"];
  const idxTotal = headerMap["calculatedtotal"];
  const idxSub = headerMap["calculatedsubtotal"];
  const idxTax = headerMap["calculatedtax"];
  const idxOrderedBy = headerMap["orderedby"];
  const idxIsDeleted = headerMap["isdeleted"];

  if (idxTicket !== undefined) job.ticketNo = row[idxTicket];
  if (idxInvoiced !== undefined) job.isInvoiced = row[idxInvoiced];
  if (idxDate !== undefined) job.orderDate = row[idxDate];

  if (idxSub !== undefined && row[idxSub] !== "") job.subtotal = Number(row[idxSub]);
  if (idxTax !== undefined && row[idxTax] !== "") job.tax = Number(row[idxTax]);
  if (idxTotal !== undefined && row[idxTotal] !== "") job.grandTotal = Number(row[idxTotal]);

  if (idxOrderedBy !== undefined && row[idxOrderedBy] !== "") {
    job.orderedBy = String(row[idxOrderedBy]);
  } else if (job.orderedBy === undefined) {
    job.orderedBy = "";
  }

  // Deleted status (sheet column wins; JSON fallback if present)
  if (idxIsDeleted !== undefined) {
    job.isDeleted = isDeletedValue(row[idxIsDeleted]);
  } else if (job.isDeleted === undefined) {
    job.isDeleted = false;
  }

  let companyName = "";
  if (idxClientName !== undefined) companyName = row[idxClientName];
  if (!companyName && idxCustName !== undefined) companyName = row[idxCustName];

  let finalId = "";
  if (idxCustId !== undefined) finalId = row[idxCustId];

  if ((!finalId || finalId === "") && companyName && customerData) {
    finalId = findCustId(customerData, companyName);
  }

  job.custId = finalId ? String(finalId) : "";
  if (companyName) job.custName = companyName;
  if (idxContact !== undefined && row[idxContact]) job.custContact = row[idxContact];

  if (!job.customer) job.customer = {};
  job.customer.custId = job.custId;
  job.customer.custName = job.custName;
  job.customer.custContact = job.custContact;

  return job;
}

/** === API READ FUNCTIONS === */

function getJob(ticketNo) {
  if (!ticketNo) throw new Error("ticketNo required");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  const { map } = getHeaderMap(sh);

  const idxTicket = map["ticketno"];
  if (idxTicket === undefined) throw new Error("Ticket column not found");

  const data = sh.getDataRange().getValues();
  const row = data.find((r) => normalizeTicketStr(r[idxTicket]) === normalizeTicketStr(ticketNo));
  if (!row) return null;

  const customerData = getCustomerData();
  return parseJobRow(row, map, customerData);
}

// By default, deleted rows are excluded unless { includeDeleted: true }
function searchJobs(query, opts) {
  opts = opts || {};
  const includeDeleted = !!opts.includeDeleted;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  if (!sh) return [];
  const { map } = getHeaderMap(sh);
  const data = sh.getDataRange().getValues();

  const idxTicket = map["ticketno"];
  const idxClient = map["clientname"];
  const idxCust = map["custname"];
  const idxIsDeleted = map["isdeleted"];

  const q = String(query || "").toLowerCase().trim();
  const customerData = getCustomerData();

  const matches = data.slice(1).filter((r) => {
    const rowDeleted = idxIsDeleted !== undefined ? isDeletedValue(r[idxIsDeleted]) : false;
    if (!includeDeleted && rowDeleted) return false;

    if (!q) return true;
    const ticket = idxTicket !== undefined ? String(r[idxTicket] || "").toLowerCase() : "";
    const client = idxClient !== undefined ? String(r[idxClient] || "").toLowerCase() : "";
    const cust = idxCust !== undefined ? String(r[idxCust] || "").toLowerCase() : "";
    return ticket.includes(q) || client.includes(q) || cust.includes(q);
  });

  return matches.reverse().slice(0, 50).map((r) => parseJobRow(r, map, customerData));
}

function listJobs(limit, opts) {
  opts = opts || {};
  const includeDeleted = !!opts.includeDeleted;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  const { map } = getHeaderMap(sh);
  const data = sh.getDataRange().getValues();
  const customerData = getCustomerData();

  const idxIsDeleted = map["isdeleted"];

  // Grab last N rows, then filter deleted if needed, then return in reverse order
  const rows = data.slice(1).slice(-limit * 3); // small cushion so filtering doesn't empty the list
  const filtered = rows.filter((r) => {
    const rowDeleted = idxIsDeleted !== undefined ? isDeletedValue(r[idxIsDeleted]) : false;
    return includeDeleted ? true : !rowDeleted;
  });

  return filtered.reverse().slice(0, limit).map((r) => parseJobRow(r, map, customerData));
}

/**
 * IMPORTANT FIX:
 * - Soft-deleted jobs (isDeleted = true) are excluded by default.
 * - Pass { includeDeleted: true } to include them.
 */
function getInvoices(startStr, endStr, opts) {
  opts = opts || {};
  const includeDeleted = !!opts.includeDeleted;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  if (!sh) return [];

  const { map } = getHeaderMap(sh);
  const data = sh.getDataRange().getValues();

  const idxDate = map["orderdate"];
  const idxTicket = map["ticketno"];

  let idxCust = map["clientname"];
  if (idxCust === undefined) idxCust = map["custname"];

  const idxSub = map["calculatedsubtotal"];
  const idxTax = map["calculatedtax"];
  const idxTotal = map["calculatedtotal"];
  const idxSubFallback = map["subtotal"];
  const idxInv = map["isinvoiced"];
  const idxIsDeleted = map["isdeleted"];

  const startDate = startStr ? new Date(startStr) : new Date(new Date().getFullYear(), 0, 1);
  const endDate = endStr ? new Date(endStr) : new Date();
  endDate.setHours(23, 59, 59, 999);

  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // Skip deleted rows unless explicitly requested
    const rowDeleted = idxIsDeleted !== undefined ? isDeletedValue(row[idxIsDeleted]) : false;
    if (!includeDeleted && rowDeleted) continue;

    const dateVal = idxDate !== undefined ? row[idxDate] : null;
    if (!dateVal) continue;

    const rowDate = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (!(rowDate instanceof Date) || isNaN(rowDate.getTime())) continue;

    if (rowDate >= startDate && rowDate <= endDate) {
      const sub = idxSub !== undefined ? Number(row[idxSub] || row[idxSubFallback] || 0) : 0;
      const tax = idxTax !== undefined ? Number(row[idxTax] || 0) : 0;
      const total = idxTotal !== undefined ? Number(row[idxTotal] || (sub + tax)) : (sub + tax);

      // Preserves your existing “shipping = remainder” behavior.
      // (If later you add a dedicated shipping column, you can switch to it here.)
      const shipping = Math.round((total - sub - tax) * 100) / 100;

      results.push({
        date: rowDate.toISOString(),
        ticketNo: idxTicket !== undefined ? String(row[idxTicket]) : "Unknown",
        customer: idxCust !== undefined ? String(row[idxCust] || "Unknown") : "Unknown",
        subtotal: sub,
        tax: tax,
        shipping: shipping > 0 ? shipping : 0,
        total: total,
        isInvoiced: idxInv !== undefined ? row[idxInv] : false,
        // Optional but useful for debugging/reporting; harmless to consumers that ignore it.
        isDeleted: rowDeleted,
      });
    }
  }

  return results.sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** === WRITE FUNCTIONS === */

function allocateTicket(prefix) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(CFG.SHEET_SERIES);
    const data = sh.getDataRange().getValues();
    const rowIdx = data.findIndex((r) => r[0] === prefix);
    if (rowIdx === -1) throw new Error("Prefix not found");
    const width = data[rowIdx][1];
    const next = data[rowIdx][2];
    sh.getRange(rowIdx + 1, 3).setValue(next + 1);
    sh.getRange(rowIdx + 1, 4).setValue(new Date());
    return { ticketNo: String(next).padStart(width, "0") + prefix };
  } finally {
    lock.releaseLock();
  }
}

function handleToggleInvoiced(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  const { map } = getHeaderMap(sh);
  const idxTicket = map["ticketno"];
  const idxInv = map["isinvoiced"];

  if (idxTicket === undefined) throw new Error("Ticket column not found");

  if (idxInv === undefined) {
    const lastCol = sh.getLastColumn();
    sh.getRange(1, lastCol + 1).setValue("isInvoiced");
    throw new Error("Column 'isInvoiced' missing. Please add it to Jobs sheet.");
  }

  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxTicket]) === String(payload.ticketNo)) {
      sh.getRange(i + 1, idxInv + 1).setValue(payload.status);
      return { ok: true };
    }
  }
  throw new Error("Job not found");
}

// Soft delete implementation
function markDeleted(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  if (!sh) throw new Error("Jobs sheet not found: " + CFG.SHEET_JOBS);

  const { map } = getHeaderMap(sh);

  const idxTicket = map["ticketno"];
  const idxIsDeleted = map["isdeleted"];
  const idxJson = map["json"];

  if (idxTicket === undefined) throw new Error("Ticket column not found");
  if (idxIsDeleted === undefined) {
    throw new Error("Column 'isDeleted' missing. Please add it to Jobs sheet.");
  }

  const ticketNo = payload && (payload.ticketNo || payload.jobId)
    ? String(payload.ticketNo || payload.jobId)
    : "";
  if (!ticketNo) throw new Error("markDeleted requires ticketNo");

  const rowIndex = findJobRowIndexByTicket(sh, map, ticketNo);
  if (rowIndex === -1) throw new Error("Job not found");

  const sheetRow = rowIndex + 1; // data row index -> sheet row number

  // Mark isDeleted = TRUE
  sh.getRange(sheetRow, idxIsDeleted + 1).setValue(true);

  // Also persist into the JSON blob (helps older clients)
  if (idxJson !== undefined) {
    const currentJson = sh.getRange(sheetRow, idxJson + 1).getValue();
    let obj = {};
    try {
      if (currentJson) obj = JSON.parse(String(currentJson));
    } catch (e) {
      obj = {};
    }
    obj.isDeleted = true;
    obj.deletedAt = new Date().toISOString();
    if (payload && payload.source) obj.deleteSource = String(payload.source);
    sh.getRange(sheetRow, idxJson + 1).setValue(JSON.stringify(obj));
  }

  // Optional: update the displayed ticketNo cell to indicate deletion (off by default)
  const renameTicket = truthyParam(payload && payload.renameTicket);
  if (renameTicket) {
    const existing = sh.getRange(sheetRow, idxTicket + 1).getValue();
    const existingStr = String(existing || "");
    const lower = existingStr.toLowerCase();
    if (existingStr && lower.indexOf("deleted") === -1) {
      sh.getRange(sheetRow, idxTicket + 1).setValue(existingStr + " (Deleted)");
    }
  }

  return { ok: true, ticketNo: ticketNo, isDeleted: true };
}

function upsertJob(job, isNew) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_JOBS);
  const { map } = getHeaderMap(sh);

  const idxTicket = map["ticketno"];
  if (idxTicket === undefined) throw new Error("Ticket column missing");

  const idxIsDeleted = map["isdeleted"];

  const ticketNo = job.ticketNo || job.jobId;
  const data = sh.getDataRange().getValues();

  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idxTicket]) === String(ticketNo)) {
      rowIndex = i;
      break;
    }
  }

  if (isNew && rowIndex !== -1) throw new Error("ERROR_DUPLICATE_TICKET");

  const sheetWidth = sh.getLastColumn();
  const newRowData = rowIndex !== -1 ? [...data[rowIndex]] : new Array(sheetWidth).fill("");

  const setVal = (key, val) => {
    const idx = map[String(key).toLowerCase()];
    if (idx !== undefined) newRowData[idx] = val;
  };

  // If a job is already deleted in the sheet, refuse to upsert unless the caller explicitly allows it.
  // This prevents accidental resurrection from old clients.
  if (rowIndex !== -1 && idxIsDeleted !== undefined) {
    const existingDeleted = isDeletedValue(data[rowIndex][idxIsDeleted]);
    if (existingDeleted) {
      const allow = !!job.allowUpdateDeleted;
      if (!allow) throw new Error("ERROR_JOB_DELETED");
    }
  }

  const companyName =
    job.clientName || job.custName || (job.customer && job.customer.custName) || "";
  const contactName =
    job.custContact || (job.customer && job.customer.custContact) || "";

  setVal("ticketno", ticketNo);
  setVal("jobid", ticketNo);
  setVal("orderdate", job.orderDate || new Date());
  setVal("shipmentdate", job.shipmentDate || "");
  setVal("clientname", companyName);
  setVal("custname", companyName);
  setVal("producttype", job.productName || "Business Cards");
  setVal("totalqty", job.totalQty || 0);
  setVal("subtotal", job.subtotal || job.priceTotal || 0);
  setVal("custid", job.custId || (job.customer && job.customer.custId) || "");
  setVal("custcontact", contactName);
  setVal("custemail", job.custEmail || "");
  setVal("json", JSON.stringify(job));
  setVal("isinvoiced", job.isInvoiced || false);
  setVal("calculatedsubtotal", job.calculatedSubtotal || "");
  setVal("calculatedtax", job.calculatedTax || "");
  setVal("calculatedtotal", job.calculatedTotal || "");
  setVal("orderedby", job.orderedBy || "");

  // Default isDeleted to false for new rows only; do not overwrite existing deleted status on updates.
  if (rowIndex === -1 && map["isdeleted"] !== undefined) {
    setVal("isdeleted", !!job.isDeleted);
  }

  if (rowIndex !== -1) {
    sh.getRange(rowIndex + 1, 1, 1, newRowData.length).setValues([newRowData]);
    return { updated: true, ticketNo: ticketNo };
  } else {
    sh.appendRow(newRowData);
    return { created: true, ticketNo: ticketNo };
  }
}

function submitFeedback(payload) {
  const sh = ensureSheetWithHeaders(CFG.SHEET_FEEDBACK, CFG.FEEDBACK_HEADERS);
  const { map } = getHeaderMap(sh);

  const feedbackId = payload && payload.feedbackId ? String(payload.feedbackId) : "";
  const submittedAt = payload && payload.submittedAt ? String(payload.submittedAt) : "";
  const feedbackText = payload && payload.feedbackText ? String(payload.feedbackText) : "";

  if (!feedbackId) throw new Error("feedbackId required");
  if (!submittedAt) throw new Error("submittedAt required");
  if (!feedbackText) throw new Error("feedbackText required");

  const width = Math.max(sh.getLastColumn(), CFG.FEEDBACK_HEADERS.length);
  const row = new Array(width).fill("");

  const setVal = (key, val) => {
    const idx = map[String(key).toLowerCase()];
    if (idx !== undefined) row[idx] = val;
  };

  setVal("feedbackid", feedbackId);
  setVal("submittedat", submittedAt);
  setVal("feedbacktext", feedbackText);

  sh.appendRow(row);

  return { created: true, feedbackId: feedbackId };
}

// --- Customers ---
function upsertCustomer(c) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_CUSTOMERS);
  const { map } = getHeaderMap(sh);
  const idxID = map["custid"];
  const idxName = map["custname"];

  if (idxID === undefined) throw new Error("No custId column");

  const data = sh.getDataRange().getValues();
  let rowIndex = -1;
  const targetID = c.custId ? String(c.custId) : null;
  const targetName = (c.custName || "").toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const rowID = String(data[i][idxID]);
    if (targetID && rowID === targetID) {
      rowIndex = i;
      break;
    }
    if (!targetID && String(data[i][idxName]).toLowerCase().trim() === targetName) {
      rowIndex = i;
      break;
    }
  }

  let finalID = targetID;
  if (!finalID) {
    if (rowIndex !== -1) finalID = data[rowIndex][idxID];
    else {
      let max = 0;
      for (let i = 1; i < data.length; i++) max = Math.max(max, Number(data[i][idxID]) || 0);
      finalID = String(max + 1);
    }
  }

  const width = sh.getLastColumn();
  const rowData = rowIndex !== -1 ? [...data[rowIndex]] : new Array(width).fill("");

  const setVal = (k, v) => {
    const idx = map[String(k).toLowerCase()];
    if (idx !== undefined) rowData[idx] = v;
  };

  setVal("custid", finalID);
  setVal("custname", c.custName || c.name);
  setVal("custcontact", c.custContact);
  setVal("custemail", c.custEmail);
  setVal("custphone", c.custPhone);
  setVal("custaddress", c.custAddress);
  setVal("shipline1", c.shipLine1);
  setVal("shipline2", c.shipLine2);
  setVal("shipcity", c.shipCity);
  setVal("shipstate", c.shipState);
  setVal("shipzip", c.shipZip);
  setVal("billline1", c.billLine1);
  setVal("billline2", c.billLine2);
  setVal("billcity", c.billCity);
  setVal("billstate", c.billState);
  setVal("billzip", c.billZip);
  setVal("updatedat", new Date());
  if (rowIndex === -1) setVal("createdat", new Date());

  if (rowIndex !== -1) {
    sh.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]);
    return { ok: true, customer: { custId: finalID, ...c } };
  } else {
    sh.appendRow(rowData);
    return { ok: true, customer: { custId: finalID, ...c } };
  }
}

function bulkUpsertCustomers(list) {
  // Keeping your current stub behavior
  return { ok: true };
}

function peekNext(prefix) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_SERIES);
  if (!sh) throw new Error("Series sheet not found: " + CFG.SHEET_SERIES);

  const data = sh.getDataRange().getValues();
  const rowIdx = data.findIndex((r) => String(r[0]) === String(prefix));
  if (rowIdx === -1) throw new Error("Prefix not found in series sheet: " + prefix);

  const width = Number(data[rowIdx][1]) || 4; // column B
  const next = Number(data[rowIdx][2]) || 0;  // column C ("next")

  const ticketNo = String(next).padStart(width, "0") + String(prefix);

  return { suggestion: ticketNo, prefix: String(prefix), next };
}

/** === RESPONSE HELPERS === */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
function ok(data) {
  return { ok: true, data: data };
}
function bad(msg) {
  return { ok: false, error: String(msg) };
}
function fail(err) {
  return { ok: false, error: String(err && err.message ? err.message : err) };
}

/** === CUSTOMERS LIST === */
function listCustomers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CFG.SHEET_CUSTOMERS);
  if (!sh) return [];

  const { map } = getHeaderMap(sh);

  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  const rows = data.slice(1);

  return rows.map((r) => {
    const customerObj = {};

    CFG.CUSTOMERS_HEADERS.forEach((key) => {
      const colIdx = map[String(key).toLowerCase()];
      if (colIdx !== undefined) customerObj[key] = r[colIdx];
      else customerObj[key] = "";
    });

    if (customerObj.custId) customerObj.custId = String(customerObj.custId);
    return customerObj;
  });
}
