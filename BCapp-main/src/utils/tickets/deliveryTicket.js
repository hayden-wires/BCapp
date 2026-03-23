// src/utils/tickets/deliveryTicket.js
import { normalizeCustomer } from "./shared";

function normalizeBool(v) {
  if (v === true || v === false) return v;
  if (v == null) return false;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}

function safeTicketLabel(job) {
  const raw = job?.jobId || job?.ticketNo || "—";
  const isDeleted = normalizeBool(job?.isDeleted);
  return isDeleted ? `${raw} (Deleted)` : String(raw);
}

function drawDeletedBanner(doc, pageWidth) {
  const margin = 48;
  const x = margin;
  const y = 64;
  const w = pageWidth - margin * 2;
  const h = 24;

  doc.setDrawColor(200, 0, 0);
  doc.setFillColor(255, 235, 235);
  doc.rect(x, y, w, h, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(150, 0, 0);
  doc.text("DELETED JOB — FOR REFERENCE ONLY (DO NOT DELIVER)", x + 10, y + 16);

  doc.setTextColor(0, 0, 0);
}

function drawDeliverySlip(doc, job, startY) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightMargin = pageWidth - margin;
  let y = startY + 36;

  const isDeleted = normalizeBool(job?.isDeleted);

  if (isDeleted) {
    drawDeletedBanner(doc, pageWidth);
    y += 34;
  }

  const today = new Date().toLocaleDateString();
  const ticketNo = safeTicketLabel(job);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text("DELIVERY SLIP", margin, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(`Order #: ${ticketNo}`, rightMargin, y, { align: "right" });

  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  doc.text(`Delivery Date: ${today}`, margin, y);
  y += 18;

  doc.text("Customer PO: _________________________", margin, y);
  doc.text("Salesperson: _________________________", pageWidth / 2 + 20, y);

  y += 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Ship To:", margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  const shipping = job.shipping || {};
  const addr = shipping.address || {};
  const customer = normalizeCustomer(job.customer);

  const shipName = String(addr.name || customer?.displayName || "—");
  const shipLine1 = String(addr.line1 || customer?.addrLines?.[0] || "");
  const shipLine2 = String(addr.line2 || customer?.addrLines?.[1] || "");
  const shipCity = String(addr.city || "");
  const shipState = String(addr.region || "");
  const shipZip = String(addr.zip || "");

  doc.text(shipName, margin, y);
  y += 12;

  if (shipLine1) {
    doc.text(shipLine1, margin, y);
    y += 12;
  }
  if (shipLine2) {
    doc.text(shipLine2, margin, y);
    y += 12;
  }

  if (shipCity || shipState || shipZip) {
    const cityStateZip = [shipCity, shipState].filter(Boolean).join(", ");
    const tail = shipZip ? ` ${shipZip}` : "";
    doc.text(`${cityStateZip}${tail}`.trim(), margin, y);
    y += 12;
  } else if (!shipLine1 && !shipLine2) {
    if (customer?.addrLines?.length > 0) {
      customer.addrLines.forEach((l) => {
        const sLine = String(l);
        if (sLine !== shipLine1) {
          doc.text(sLine, margin, y);
          y += 12;
        }
      });
    }
  }

  y += 28;

  doc.setFont("helvetica", "bold");
  doc.text("Order:", margin, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  const product = job.productName || "Business Cards";
  const versions = Array.isArray(job.versions) ? job.versions : [];
  const versionCount = job.versionCount || versions.length;

  doc.text(product, margin, y);
  y += 12;
  doc.text(`Qty: ${job.totalQty}`, margin, y);
  y += 12;
  doc.text(`Versions: ${versionCount}`, margin, y);

  y += 40;

  const sectionBottom = startY + 396;
  const footerY = Math.max(y, sectionBottom - 80);

  doc.text("Received By: __________________________", margin, footerY);
  doc.text("Date Received: ________________________", margin, footerY + 24);
}

export function renderDeliveryTicket(doc, job) {
  const pageHeight = doc.internal.pageSize.getHeight();
  const midpoint = pageHeight / 2;

  drawDeliverySlip(doc, job, 0);

  doc.setLineDash([5, 5], 0);
  doc.setDrawColor(200, 200, 200);
  doc.line(20, midpoint, doc.internal.pageSize.getWidth() - 20, midpoint);
  doc.setLineDash([]);
  doc.setDrawColor(0, 0, 0);

  drawDeliverySlip(doc, job, midpoint);
}
