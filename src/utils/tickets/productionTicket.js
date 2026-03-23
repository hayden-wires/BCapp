// src/utils/tickets/productionTicket.js
import { calculateImposition } from "../imposition";
import { drawHeader, drawCustomerSection, stockLabelFromKey } from "./shared";

export function renderProductionTicket(doc, job) {
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const colGap = 20;
  const colWidth = (pageWidth - margin * 2 - colGap) / 2;
  const col2X = margin + colWidth + colGap;

  let y = drawHeader(doc, "PRODUCTION TICKET", job);
  const topSectionY = y;

  drawCustomerSection(doc, "Customer Details", job.customer, col2X, topSectionY, 0);

  const size = job.size || { w: 3.5, h: 2 };
  const totalQty = job.totalQty || 0;
  const sides = job.sidesLabel || "4/0";
  const stockLabel = stockLabelFromKey(job.stockKey, job.stockOverrideLabel);
  const versions = Array.isArray(job.versions) ? job.versions : [];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(String(job.productName || "Business Cards"), margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Quantity: ${totalQty} cards`, margin, y);
  y += 16;
  doc.text(`Size: ${size.w}" × ${size.h}"`, margin, y);
  y += 16;
  doc.text(`Sides: ${sides}`, margin, y);
  y += 16;
  doc.text(`Stock: ${stockLabel}`, margin, y);
  y += 24;

  const wastePct = job.wastePercent ?? 0.15;
  const imposition = calculateImposition(size.w, size.h, totalQty, wastePct);

  const cardsPerSheet = imposition.yield;
  const netSheets = imposition.sheetsNet;
  const parentSize = imposition.parentSize;

  let colorsLabel = job.colors || "C M Y K";
  if (sides.includes("4/4") || sides.toLowerCase().includes("double")) {
    colorsLabel = "CMYK / CMYK";
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Pressroom", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Press: ${job.pressName || "Digital Press"}`, margin, y);
  y += 16;
  doc.text(`Form: ${job.formDescription || `${cardsPerSheet}-up`}`, margin, y);
  y += 16;
  doc.text(`FRONT/BACK colors: ${colorsLabel}`, margin, y);
  y += 16;
  doc.text(`Net sheets: ${netSheets}`, margin, y);
  y += 16;
  if (job.grossImpressions) {
    doc.text(`Gross impressions: ${job.grossImpressions}`, margin, y);
    y += 16;
  }
  doc.text(`Sheet size: ${parentSize}`, margin, y);
  y += 30;

  if (versions.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Version breakdown", margin, y);
    y += 22;

    let currentX = margin;
    let versionStartY = y;
    let maxY = y;

    versions.forEach((v, idx) => {
      const qty = Number(v.quantity || 0);
      const vSides =
        v.sides === "double" ? "4/4 (Double-sided)" : "4/0 (Single-sided)";
      const name = v.name || `Version ${idx + 1}`;
      const hasFinish = v.finish === "round_corners";

      let linesCount = 2;
      if (v.other) linesCount++;
      if (hasFinish) linesCount++;

      const blockHeight = 14 + linesCount * 12 + 8;

      if (y + blockHeight > 710) {
        if (currentX === margin) {
          currentX = col2X;
          y = versionStartY;
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Version ${idx + 1}: ${name}`, currentX, y);
      y += 14;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const indent = currentX + 12;

      doc.text(`Quantity: ${qty}`, indent, y);
      y += 12;

      doc.text(`Sides: ${vSides}`, indent, y);
      y += 12;

      if (hasFinish) {
        doc.setFont("helvetica", "bold");
        doc.text("FINISH: Round Corners", indent, y);
        doc.setFont("helvetica", "normal");
        y += 12;
      }

      if (v.other) {
        doc.text(`Notes: ${v.other}`, indent, y);
        y += 12;
      }

      y += 8;
      if (y > maxY) maxY = y;
    });

    y = maxY + 14;
  }
}
