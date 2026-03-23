// src/utils/tickets/mapSavedJobToTicketData.js
import { normalizeStockKey } from "../stocks";
export function mapSavedJobToTicketData(savedJob) {
  if (!savedJob) return null;

  const ticketNo = savedJob.ticketNo || savedJob.jobId || "";

  const product = {
    name: savedJob.productName || "Business Cards",
    size: savedJob.size || { w: 3.5, h: 2 },
  };

  const orderedBy = String(savedJob.orderedBy || "");

  const versions = Array.isArray(savedJob.versions) ? savedJob.versions : [];
  const versionCount = savedJob.versionCount || savedJob.versions?.length || 0;
  const totalQty = savedJob.totalQty || 0;

  const quantities = versions
    .map((v) => Number(v.quantity) || 0)
    .filter((q) => q > 0);

  const allSame =
    quantities.length > 0 && quantities.every((q) => q === quantities[0]);
  const qtyPerVersion = allSame ? quantities[0] : null;

  let sidesLabel = "4/0";
  if (savedJob.sides) {
    sidesLabel = savedJob.sides === "double" ? "4/4" : "4/0";
  } else {
    const doubleCount = versions.filter((v) => v.sides === "double").length;
    if (doubleCount === 0) sidesLabel = "4/0";
    else if (doubleCount === versionCount) sidesLabel = "4/4";
    else sidesLabel = "Mixed (4/0 + 4/4)";
  }

  const subtotal = Number(savedJob.subtotal || 0);
  const shippingCost = Number(
    savedJob.shippingCost || savedJob.shippingAmount || 0
  );
  const tax = Number(savedJob.tax || savedJob.calculatedTax || 0);
  const grandTotal = Number(savedJob.grandTotal || savedJob.calculatedTotal || 0);

  const amounts = {
    subtotal,
    shipping: shippingCost,
    tax,
    grandTotal,
    calculatedSubtotal: Number(savedJob.calculatedSubtotal || subtotal),
    calculatedTax: Number(savedJob.calculatedTax || tax),
    calculatedTotal: Number(savedJob.calculatedTotal || grandTotal),
    overrideSubtotal:
      savedJob.overrideSubtotal != null ? Number(savedJob.overrideSubtotal) : null,
  };

  let lines = [];

  if (versions.length > 0 && totalQty > 0 && subtotal > 0) {
    lines = versions.map((v) => {
      const vQty = Number(v.quantity || 0);
      const ratio = totalQty > 0 ? vQty / totalQty : 0;
      const vTotal = subtotal * ratio;
      const vUnit = vQty > 0 ? vTotal / vQty : 0;

      const vName = v.name || "Untitled Version";

      return {
        description: `Business Cards - ${vName}`,
        qty: vQty,
        unitPrice: vUnit,
        total: vTotal,
      };
    });
  } else {
    lines = [
      {
        description: `${product.name} (${product.size.w}" × ${product.size.h}")`,
        qty: totalQty || 1,
        unitPrice: totalQty > 0 ? subtotal / totalQty : subtotal || 0,
        total: subtotal || 0,
      },
    ];
  }

  const shipping = {
    method: savedJob.shippingMethod || "Pickup",
    cost: shippingCost,
    address: savedJob.shippingAddress || {
      name: savedJob.shippingName || "",
      line1: savedJob.shippingLine1 || "",
      city: savedJob.shippingCity || "",
      region: savedJob.shippingRegion || "",
      zip: savedJob.shippingZip || "",
    },
    notes: savedJob.shippingNotes || "",
  };

  const billing = {
    payment: savedJob.paymentMethod || "card",
    address: savedJob.billingAddress || {
      name: savedJob.billingName || "",
      line1: savedJob.billingLine1 || "",
      line2: savedJob.billingLine2 || "",
      city: savedJob.billingCity || "",
      region: savedJob.billingRegion || "",
      zip: savedJob.billingZip || "",
    },
  };

  const normalizeBool = (v) => {
    if (v === true || v === false) return v;
    if (v == null) return false;
    if (typeof v === "number") return v !== 0;
    const s = String(v).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  };

  return {
    jobId: ticketNo,
    ticketNo,

    isDeleted: normalizeBool(savedJob.isDeleted),

    site: savedJob.site || "NORTH",
    orderDate: savedJob.orderDate || "",
    shipmentDate: savedJob.shipmentDate || "",
    printedAt: savedJob.printedAt || "",
    printedBy: savedJob.printedBy || "",

    orderedBy,

    productName: product.name,
    size: product.size,
    sidesLabel,
    versionCount,
    qtyPerVersion,
    totalQty,
    stockKey: normalizeStockKey(savedJob.stock || "uncoated") || "uncoated",
    stockOverrideLabel: null,

    customer: {
      ...(savedJob.customer || {}),

      custName: savedJob.customer?.custName || savedJob.custName,
      custContact: savedJob.customer?.custContact || savedJob.custContact,
      custEmail: savedJob.customer?.custEmail || savedJob.custEmail,
      custPhone: savedJob.customer?.custPhone || savedJob.custPhone,
      custAddress: savedJob.customer?.custAddress || savedJob.custAddress,
      shipLine1: savedJob.customer?.shipLine1 || "",

      custId: savedJob.customer?.custId || savedJob.custId,
    },

    billing,
    versions,

    packSize: 250,
    packsPerBox: 4,

    shipping,
    amounts,
    lines,

    cardsPerSheet: savedJob.cardsPerSheet || 24,
    wastePercent: savedJob.wastePercent || 0.15,
    parentSizeLabel: savedJob.parentSizeLabel || '12" × 18"',

    proofType: "PDF",
    jobType: "Reprint",
    prepressNotes: "",
    pressName: "Digital Press",
    finishing: `Cut to ${product.size.w}" × ${product.size.h}", box in packs of 250`,
    orderTitle: savedJob.orderTitle,
  };
}
