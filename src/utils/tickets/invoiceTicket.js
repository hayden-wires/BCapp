// src/utils/tickets/invoiceTicket.js
import { drawHeader, normalizeCustomer } from "./shared";

export function renderInvoiceTicket(doc, job) {
  const margin = 48;
  let y = drawHeader(doc, "INVOICE TICKET", job);

  const productName = job.productName || "Business Cards";
  const size = job.size || { w: 3.5, h: 2 };
  const totalQty = job.totalQty || 0;

  const billingAddr = job.billing?.address;
  const billingNorm = billingAddr
    ? {
        displayName: billingAddr.name,
        addrLines: [
          billingAddr.line1,
          billingAddr.line2,
          billingAddr.city || billingAddr.region || billingAddr.zip
            ? `${billingAddr.city || ""}, ${billingAddr.region || ""} ${billingAddr.zip || ""}`.trim()
            : null,
        ].filter(Boolean),
      }
    : normalizeCustomer(job.customer || null);

  const customerNorm = normalizeCustomer(job.customer);
  const shipping = job.shipping || {};
  const shipAddr = shipping.address || {};

  const amounts = job.amounts || job.totals || {};
  const subtotal = Number(amounts.subtotal ?? job.subtotal ?? job.itemsSubtotal ?? 0);
  const shippingAmt = Number(amounts.shipping ?? job.shippingAmount ?? shipping.cost ?? 0);
  const tax = Number(amounts.tax ?? job.tax ?? 0);
  const grandTotal = Number(
    amounts.grandTotal ?? job.total ?? subtotal + shippingAmt + tax
  );

  const lines =
    Array.isArray(job.lines) && job.lines.length
      ? job.lines
      : [
          {
            description: `${productName} (${size.w}" × ${size.h}")`,
            qty: totalQty || 1,
            unitPrice:
              totalQty > 0 ? subtotal / totalQty : grandTotal || subtotal || 0,
            total: subtotal || 0,
          },
        ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Bill to", margin, y);
  doc.text("Ship to", margin + 260, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  let billY = y;

  if (billingNorm) {
    if (billingNorm.displayName) {
      doc.text(String(billingNorm.displayName), margin, billY);
      billY += 14;
    }
    if (billingNorm.addrLines && billingNorm.addrLines.length) {
      billingNorm.addrLines.forEach((line) => {
        doc.text(String(line), margin, billY);
        billY += 14;
      });
    }
  } else {
    doc.text("—", margin, billY);
    billY += 14;
  }

  billY += 14;

  const custId = customerNorm?.id || (job.customer && job.customer.custId) || "—";

  doc.setFont("helvetica", "bold");
  doc.text("Customer ID: ", margin, billY);
  const idLabelW = doc.getTextWidth("Customer ID: ");

  doc.setFont("helvetica", "normal");
  doc.text(String(custId), margin + idLabelW, billY);
  billY += 14;

  const orderedBy =
    job.orderedBy ||
    job.billing?.orderedBy ||
    job.billing?.address?.name ||
    "";

  doc.text(`Ordered by: ${orderedBy}`, margin, billY);
  billY += 14;

  let shipY = y;

  if (shipAddr && (shipAddr.name || shipAddr.line1 || shipAddr.city)) {
    if (shipAddr.name) {
      doc.text(String(shipAddr.name), margin + 260, shipY);
      shipY += 14;
    }
    if (shipAddr.line1) {
      doc.text(String(shipAddr.line1), margin + 260, shipY);
      shipY += 14;
    }
    if (shipAddr.line2) {
      doc.text(String(shipAddr.line2), margin + 260, shipY);
      shipY += 14;
    }
    if (shipAddr.city || shipAddr.region || shipAddr.zip) {
      const parts = [shipAddr.city, shipAddr.region, shipAddr.zip]
        .filter(Boolean)
        .map(String);
      if (parts.length) {
        doc.text(parts.join(", "), margin + 260, shipY);
        shipY += 14;
      }
    }
  } else {
    if (customerNorm) {
      if (customerNorm.displayName) {
        doc.text(customerNorm.displayName, margin + 260, shipY);
        shipY += 14;
      }
      (customerNorm.addrLines || []).forEach((line) => {
        doc.text(line, margin + 260, shipY);
        shipY += 14;
      });
    } else {
      doc.text("—", margin + 260, shipY);
      shipY += 14;
    }
  }

  y = Math.max(billY, shipY) + 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Invoice items", margin, y);
  y += 18;

  const xQty = margin + 280;
  const xUnit = margin + 360;
  const xTotal = margin + 450;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Description", margin, y);
  doc.text("Qty", xQty, y, { align: "right" });
  doc.text("Unit", xUnit, y, { align: "right" });
  y += 12;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(margin, y, xTotal + 10, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  lines.forEach((ln) => {
    const desc = String(ln.description || "");
    const qty = Number(ln.qty || ln.quantity || 0);
    const unit = Number(ln.unitPrice || ln.unit || 0);

    doc.text(desc, margin, y);
    doc.text(String(qty || ""), xQty, y, { align: "right" });
    doc.text(`$${unit.toFixed(2)}`, xUnit, y, { align: "right" });
    y += 16;
  });

  y += 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Totals", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  function rightRow(label, value) {
    doc.text(label, xUnit, y, { align: "right" });
    doc.text(`$${Number(value).toFixed(2)}`, xTotal, y, { align: "right" });
    y += 16;
  }

  rightRow("Subtotal", subtotal);
  rightRow("Shipping", shippingAmt);
  rightRow("Tax", tax);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total (incl. tax)", xUnit, y, { align: "right" });
  doc.text(`$${grandTotal.toFixed(2)}`, xTotal, y, { align: "right" });
}
