// src/utils/tickets/shared.js
import logoImg from "../../assets/logo-stacked.png?inline";
import { getStockLabel, normalizeStockKey } from "../stocks";

export function ensureJsPDF() {
  if (typeof window === "undefined") {
    throw new Error("jsPDF is only available in the browser.");
  }
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;

  throw new Error(
    "jsPDF global not found. Ensure jspdf.umd.min.js is loaded via a <script> tag."
  );
}

export function createDoc() {
  const JsPDF = ensureJsPDF();
  return new JsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
}

/** ---------- Deleted helpers (shared across tickets) ---------- */
export function normalizeBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return false;
  if (typeof v === "number") return v !== 0;

  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

export function jobIsDeleted(job) {
  return normalizeBool(job?.isDeleted);
}

export function ticketIdFromJob(job) {
  return String(job?.jobId || job?.ticketNo || "—");
}

export function ticketLabel(job) {
  const id = ticketIdFromJob(job);
  return jobIsDeleted(job) ? `${id} (Deleted)` : id;
}

export function drawDeletedBanner(doc, options = {}) {
  const {
    x = 48,
    y = 54,
    width = doc.internal.pageSize.getWidth() - 96,
    height = 24,
    text = "DELETED JOB — FOR REFERENCE ONLY",
  } = options;

  doc.setDrawColor(200, 0, 0);
  doc.setFillColor(255, 235, 235);
  doc.rect(x, y, width, height, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(150, 0, 0);
  doc.text(text, x + 10, y + 16);

  doc.setTextColor(0, 0, 0);
}

/** ---------- Stock label ---------- */
const STOCK_LABEL_MAP = {
  uncoated: "100# Uncoated Cover",
  cougar_natural: "130# Cougar Uncoated Cover",
  classic_crest: "130# Classic Crest Eggshell Cover",
  natural_cover_100: "100# Natural Cover",
  natural_cover: "100# Natural Cover",
};

function formatStockKey(key) {
  const parts = String(key)
    .trim()
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean);

  if (!parts.length) return "Unspecified stock";

  const numberToken = parts.find((token) => /^\d+$/.test(token));
  const words = parts
    .filter((token) => token !== numberToken)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1));

  if (numberToken && words.length) return `${numberToken}# ${words.join(" ")}`;
  return words.join(" ") || String(key);
}

export function stockLabelFromKey(key, overrideLabel) {
  if (overrideLabel) return overrideLabel;
  if (!key) return "Unspecified stock";
  const canonicalKey = normalizeStockKey(key);
  return getStockLabel(canonicalKey) || STOCK_LABEL_MAP[canonicalKey] || formatStockKey(canonicalKey);
}

/** ---------- PDF window helpers ---------- */
export function openPdfInNewWindow(doc) {
  try {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error("Failed to open PDF window:", err);
  }
}

export async function generateAsyncPdfInNewWindow(generatorFn, filename) {
  const newWindow = window.open("", "_blank");
  if (!newWindow) {
    alert("Popup blocked! Please allow popups for this site to view the ticket.");
    return;
  }

  newWindow.document.write(`
    <div style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh;">
      <div>Generating PDF... please wait.</div>
    </div>
  `);

  try {
    const doc = createDoc();
    await generatorFn(doc);

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);

    newWindow.location.href = url;
    newWindow.document.title = filename;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error("PDF Generation failed:", err);
    newWindow.close();
    alert("Unable to generate PDF. Check console for details.");
  }
}

/** ---------- Image loader (more resilient) ---------- */
export async function loadImage(src, doc) {
  if (!src) {
    console.error("[Tickets Debug] Source is null/undefined");
    return null;
  }

  // Already base64
  if (typeof src === "string" && src.startsWith("data:image")) {
    try {
      const props = doc.getImageProperties(src);
      return {
        data: src,
        width: props.width,
        height: props.height,
        format: props.fileType || "PNG",
      };
    } catch (e) {
      console.error("[Tickets Debug] jsPDF failed to parse Base64:", e);
      return null;
    }
  }

  // Fetch asset path/URL
  try {
    const response = await fetch(src, { cache: "no-store" });

    if (!response.ok) {
      console.warn("[Tickets Debug] Fetch failed:", response.status, response.statusText);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      console.error(
        "[Tickets Debug] CRITICAL: Server returned HTML instead of image. File path is wrong."
      );
      return null;
    }

    const blob = await response.blob();

    const base64data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

    try {
      const props = doc.getImageProperties(base64data);
      return {
        data: base64data,
        width: props.width,
        height: props.height,
        format: props.fileType || "PNG",
      };
    } catch (e) {
      console.error("[Tickets Debug] jsPDF crashed reading image properties:", e);
      return null;
    }
  } catch (err) {
    console.error("[Tickets Debug] Unexpected error in loadImage:", err);
    return null;
  }
}

/** ---------- Common header ---------- */
export function drawHeader(doc, ticketTitle, job, startY = 42) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = startY;

  // If deleted, show a warning banner at top of the page
  if (jobIsDeleted(job)) {
    drawDeletedBanner(doc, {
      x: margin,
      y: y - 10,
      width: maxWidth,
      text: "DELETED JOB — FOR REFERENCE ONLY",
    });
    y += 22;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(String(ticketTitle).toUpperCase(), margin, y);

  y += 24;

  const clientName = job?.customer?.custName || job?.clientName || "Walk-in Customer";
  const heroText = `${clientName}  ·  ${ticketLabel(job)}`;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  // sizing logic (fixes: check larger thresholds first)
  doc.setFontSize(22);
  if (doc.getTextWidth(heroText) > maxWidth + 50) doc.setFontSize(14);
  else if (doc.getTextWidth(heroText) > maxWidth) doc.setFontSize(16);

  doc.text(heroText, margin, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);

  const site = job?.site || "NORTH";
  const date = job?.orderDate || new Date().toISOString().slice(0, 10);
  doc.text(`Site: ${site}   ·   Ordered: ${date}`, margin, y);

  return y + 36;
}

/** ---------- Customer helpers ---------- */
export function normalizeCustomer(rawCustomer) {
  if (!rawCustomer) return null;

  const displayName = String(rawCustomer.custName || rawCustomer.name || "");
  const id = String(rawCustomer.custId || rawCustomer.id || "");
  const contact = String(rawCustomer.custContact || rawCustomer.contact || "");
  const email = String(rawCustomer.custEmail || rawCustomer.email || "");
  const phone = String(rawCustomer.custPhone || rawCustomer.phone || "");

  const addrLines = [];

  if (rawCustomer.custAddress) {
    addrLines.push(String(rawCustomer.custAddress));
  } else if (rawCustomer.shipLine1) {
    addrLines.push(String(rawCustomer.shipLine1));
    if (rawCustomer.shipLine2) addrLines.push(String(rawCustomer.shipLine2));

    const parts = [rawCustomer.shipCity, rawCustomer.shipState, rawCustomer.shipZip]
      .filter(Boolean)
      .map(String);

    if (parts.length) addrLines.push(parts.join(", "));
  } else {
    if (rawCustomer.line1) addrLines.push(String(rawCustomer.line1));
    if (rawCustomer.line2) addrLines.push(String(rawCustomer.line2));

    const parts = [rawCustomer.city, rawCustomer.region, rawCustomer.zip]
      .filter(Boolean)
      .map(String);

    if (parts.length) addrLines.push(parts.join(", "));
  }

  const hasAny = displayName || id || contact || email || phone || addrLines.length > 0;
  if (!hasAny) return null;

  return { displayName, id, contact, email, phone, addrLines };
}

export function drawCustomerSection(doc, title, rawCustomer, x, startY, indent = 0) {
  const customer = normalizeCustomer(rawCustomer);
  const contentX = x + indent;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(title, x, startY);

  let y = startY + 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  if (!customer) {
    doc.text("—", contentX, y);
    return y + 14;
  }

  if (customer.contact) {
    doc.text(`Contact: ${customer.contact}`, contentX, y);
    y += 14;
  }
  if (customer.email) {
    doc.text(`Email: ${customer.email}`, contentX, y);
    y += 14;
  }
  if (customer.phone) {
    doc.text(`Phone: ${customer.phone}`, contentX, y);
    y += 14;
  }
  if (customer.addrLines.length) {
    customer.addrLines.forEach((line) => {
      doc.text(String(line), contentX, y);
      y += 14;
    });
  }

  if (customer.id) {
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text(`(ID: ${customer.id})`, contentX, y);
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    y += 14;
  }

  return y + 8;
}

export const ASSETS = { logoImg };
