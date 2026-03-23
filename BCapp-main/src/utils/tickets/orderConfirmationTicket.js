// src/utils/tickets/orderConfirmationTicket.js
import { normalizeCustomer, stockLabelFromKey } from "./shared";

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
  const x = 40;
  const y = 92;
  const w = pageWidth - 80;
  const h = 28;

  doc.setDrawColor(200, 0, 0);
  doc.setFillColor(255, 235, 235);
  doc.rect(x, y, w, h, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(150, 0, 0);
  doc.text("DELETED JOB — FOR REFERENCE ONLY (DO NOT PRODUCE)", x + 12, y + 18);

  doc.setTextColor(0, 0, 0);
}

export async function renderOrderConfirmation(doc, job, logoData) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const gutter = 40;
  const rightMargin = pageWidth - 40;

  const isDeleted = normalizeBool(job?.isDeleted);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(48);
  doc.setTextColor(180, 180, 180);
  doc.text("Order confirmation", 40, 700, { angle: 90 });

  doc.setFontSize(18);
  doc.text("(Not an invoice)", 40, 270, { angle: 90 });

  if (logoData && logoData.data) {
    const logoW = 110;
    const ratio = logoData.height / logoData.width;
    const logoH = logoW * ratio;

    const logoX = rightMargin - logoW;
    const logoY = 30;

    try {
      doc.addImage(logoData.data, logoData.format, logoX, logoY, logoW, logoH);
    } catch (e) {
      console.error("Error adding logo to PDF:", e);
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);

    let addrY = logoY + logoH + 15;
    ["3161 Mercer Avenue #104", "Bellingham, WA 98225", "360.684.3783"].forEach(
      (line) => {
        doc.text(line, rightMargin, addrY, { align: "right" });
        addrY += 12;
      }
    );
  }

  const contentX = gutter + 60;
  let y = 130;

  if (isDeleted) {
    drawDeletedBanner(doc, pageWidth);
    y += 34; 
  }

  const drawRow = (label, value) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, contentX, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, contentX + 160, y);
    y += 14;
  };

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  const orderDateStr = job.orderDate || new Date().toISOString();
  const orderDateObj = new Date(orderDateStr);
  const formattedOrderDate = orderDateObj.toLocaleDateString();

  const ticketNoLabel = safeTicketLabel(job);

  const deliveryDateObj = new Date(orderDateStr);
  deliveryDateObj.setDate(deliveryDateObj.getDate() + 5);
  const projDate = deliveryDateObj.toLocaleDateString() + "*";

  drawRow("Date:", formattedOrderDate);
  drawRow("Customer PO#:", "_________________");
  drawRow("Job#:", ticketNoLabel);
  drawRow("Projected delivery date:", projDate);

  y += 30;

  doc.text(
    "Thank you for your business. Below are details for your order.",
    contentX,
    y
  );
  y += 30;

  const customer = normalizeCustomer(job.customer);
  const totalQty = job.totalQty || 0;

  const size = job.size ? `${job.size.w}" × ${job.size.h}"` : '3.5" × 2"';
  const sides = job.sidesLabel || "Two sided CMYK";
  const stock = stockLabelFromKey(job.stockKey, job.stockOverrideLabel);

  doc.setFont("helvetica", "normal");
  doc.text(`Qty: ${totalQty} pcs.`, contentX, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.text("Description:", contentX, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    String(job.orderTitle || customer?.displayName || "Business Cards"),
    contentX + 160,
    y
  );
  y += 24;

  [
    { k: "Size:", v: `Finished: ${size}` },
    { k: "Print:", v: sides },
    { k: "Paper:", v: stock },
    { k: "Finishing:", v: "Trim" },
    { k: "Proof:", v: "PDF" },
    { k: "Packaging:", v: "Carton Pack" },
    { k: "Shipping:", v: "1 Local Delivery Included" },
  ].forEach((spec) => drawRow(spec.k, spec.v));

  y += 30;

  const price = job.amounts?.subtotal || job.totals?.subtotal || 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);

  doc.text("Qty:", contentX, y);
  doc.text("Price:", pageWidth - 100, y, { align: "right" });
  y += 16;

  doc.text(`${totalQty} pcs.`, contentX, y);
  doc.text(`$ ${Number(price).toFixed(2)}`, pageWidth - 100, y, {
    align: "right",
  });

  y += 60;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Yours sincerely,", contentX, y);
  y += 20;

  doc.text("Hayden Wires (hayden@ccp-north.com)", contentX, y);
  y += 12;
  doc.text("Project Manager", contentX, y);

  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.text(
    "*Target delivery date based upon approval of first proof without changes.",
    contentX,
    pageHeight - 40
  );
}
