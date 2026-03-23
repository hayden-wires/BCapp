// src/utils/tickets/paperTicket.js
import { calculateImposition } from "../imposition";
import { drawHeader, drawCustomerSection, stockLabelFromKey } from "./shared";

export function renderPaperTicket(doc, job) {
  const margin = 48;
  const contentX = margin + 12;
  let y = drawHeader(doc, "PAPER TICKET", job);

  const size = job.size || { w: 3.5, h: 2 };
  const sides = job.sidesLabel || "4/0";
  const versions = job.versionCount || 0;
  const qtyPerVersion = job.qtyPerVersion || null;
  const totalQty = job.totalQty || 0;
  const stockLabel = stockLabelFromKey(job.stockKey, job.stockOverrideLabel);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(String(job.productName || "Business Cards"), margin, y);
  y += 24;

  const qtySummary =
    qtyPerVersion && versions
      ? `${versions} versions × ${qtyPerVersion} each = ${totalQty} cards`
      : `${totalQty} cards`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Quantity: ${qtySummary}`, contentX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  doc.text(`Size: ${size.w}" × ${size.h}"`, contentX, y);
  y += 16;
  doc.text(`Sides: ${sides}`, contentX, y);
  y += 16;
  doc.text(`Stock: ${stockLabel}`, contentX, y);
  y += 24;

  y = drawCustomerSection(doc, "Customer Details", job.customer, margin, y, 12);
  y += 8;

  const wastePct = job.wastePercent ?? 0.15;
  const imposition = calculateImposition(size.w, size.h, totalQty, wastePct);

  const netSheets = imposition.sheetsNet;
  const sheetsOrder = imposition.sheetsGross;
  const parentSize = imposition.parentSize || '12" × 18"';

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Paper requirements", margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`Stock: ${stockLabel}`, contentX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Parent sheet: ${parentSize}`, contentX, y);
  y += 16;
  doc.text(`Layout: ${imposition.layout}`, contentX, y);
  y += 16;
  doc.text(`Net sheets: ${netSheets}`, contentX, y);
  y += 16;
  doc.text(`Wastage: ${(wastePct * 100).toFixed(0)}%`, contentX, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`SHEETS TO ORDER: ${sheetsOrder}`, contentX, y);
  y += 32;

  if (job.vendor || job.itemCode || job.requiredArrivalDate) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Vendor / purchasing notes", margin, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    if (job.vendor) { doc.text(`Vendor: ${job.vendor}`, contentX, y); y += 16; }
    if (job.itemCode) { doc.text(`Item code: ${job.itemCode}`, contentX, y); y += 16; }
    if (job.requiredArrivalDate) { doc.text(`Required arrival: ${job.requiredArrivalDate}`, contentX, y); y += 16; }
    if (job.estimatedWeight) { doc.text(`Est. paper weight: ${job.estimatedWeight}`, contentX, y); y += 16; }
  }
}
