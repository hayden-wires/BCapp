// src/utils/hydration.js

import { normalizeStockKey } from "./stocks";

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function coerceNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getTicket(savedJob) {
  return savedJob?.ticketNo || savedJob?.jobId || null;
}

function isDeletedJob(savedJob) {
  return !!(savedJob?.isDeleted || savedJob?.deletedAt || savedJob?.status === "deleted");
}

function patchCartWithTicket(cart, ticketNo) {
  const arr = Array.isArray(cart) ? cart : [];
  if (!ticketNo) return arr;
  return arr.map((it) => ({
    ...it,
    ticketNo: it?.ticketNo || ticketNo,
    jobId: it?.jobId || ticketNo,
  }));
}

function patchCartWithDeleted(cart, deletedMeta) {
  const arr = Array.isArray(cart) ? cart : [];
  if (!deletedMeta?.isDeleted) return arr;

  return arr.map((it) => ({
    ...it,
    status: it?.status || "deleted",
    isDeleted: true,
    deletedAt: it?.deletedAt || deletedMeta.deletedAt || null,
    deletedBy: it?.deletedBy || deletedMeta.deletedBy || "",
    deletedReason: it?.deletedReason || deletedMeta.deletedReason || "",
  }));
}

export function mapSavedJobToWizardState(savedJob) {
  if (!savedJob) return null;

  const ticketNo = getTicket(savedJob);
  const orderedBy = safeStr(savedJob.orderedBy || "");

  const deletedMeta = {
    isDeleted: isDeletedJob(savedJob),
    status: savedJob?.status || (isDeletedJob(savedJob) ? "deleted" : ""),
    deletedAt: savedJob?.deletedAt || null,
    deletedBy: safeStr(savedJob?.deletedBy || ""),
    deletedReason: safeStr(savedJob?.deletedReason || savedJob?.deleteReason || ""),
  };

  const defaultSize = { w: 3.5, h: 2 };
  const loadedSize = savedJob.size || defaultSize;

  const product = {
    id: savedJob.productId || "business-cards",
    name: savedJob.productName || "Business Cards",
    size: loadedSize,
  };

  const jobDraft = {
    jobId: ticketNo,
    ticketNo,

    site: savedJob.site || "NORTH",
    orderDate: savedJob.orderDate,
    shipmentDate: savedJob.shipmentDate,
    stock: normalizeStockKey(savedJob.stock || "uncoated") || "uncoated",

    size: loadedSize,

    versions: Array.isArray(savedJob.versions) ? savedJob.versions : [],
    versionCount: savedJob.versionCount || savedJob.versions?.length || 0,
    totalQty: savedJob.totalQty || 0,

    orderedBy,

    pricingMeta: {
      sides: savedJob.sides || "double",
      doubleVersionCount: savedJob.doubleVersionCount || 0,
      effectiveVersionCount: savedJob.versionCount || 1,
    },

    customer: savedJob.customer || {
      custName: savedJob.custName || "",
      custId: savedJob.custId || "",
      custContact: savedJob.custContact || "",
      custEmail: savedJob.custEmail || "",
      custPhone: savedJob.custPhone || "",
      custAddress: savedJob.custAddress || "",
    },

    product,

    status: deletedMeta.status || "",
    isDeleted: deletedMeta.isDeleted,
    deletedAt: deletedMeta.deletedAt,
    deletedBy: deletedMeta.deletedBy,
    deletedReason: deletedMeta.deletedReason,
  };

  let cart = Array.isArray(savedJob.rawCart) ? savedJob.rawCart : null;

  if (!cart || cart.length === 0) {
    cart = [
      {
        ...jobDraft,
        price: {
          baseSinglePrice: coerceNumber(savedJob.priceBaseSingle, 0),
          sidesSurcharge: coerceNumber(savedJob.priceSidesSurcharge, 0),
          total: coerceNumber(savedJob.priceTotal ?? savedJob.subtotal, 0),
        },
      },
    ];
  }

  cart = patchCartWithTicket(cart, ticketNo);
  cart = patchCartWithDeleted(cart, deletedMeta);
  cart = cart.map((it) => ({
    ...it,
    product: it.product || product,
    size: it.size || loadedSize,
    stock: normalizeStockKey(it.stock || savedJob.stock || "uncoated") || "uncoated",
    versions: Array.isArray(it.versions) ? it.versions : jobDraft.versions,
    pricingMeta: it.pricingMeta || jobDraft.pricingMeta,
    customer: it.customer || jobDraft.customer,
    orderedBy: it.orderedBy ?? orderedBy,

    status: it.status || (deletedMeta.isDeleted ? "deleted" : it.status),
    isDeleted: it.isDeleted ?? deletedMeta.isDeleted,
    deletedAt: it.deletedAt ?? deletedMeta.deletedAt,
    deletedBy: it.deletedBy ?? deletedMeta.deletedBy,
    deletedReason: it.deletedReason ?? deletedMeta.deletedReason,
  }));

  let shipping = savedJob.rawShipping;
  if (!shipping) {
    shipping = {
      method: savedJob.shippingMethod || "Pickup",
      cost: coerceNumber(savedJob.shippingCost || 0, 0),
      address: savedJob.shippingAddress || {
        name: savedJob.shippingName || "",
        line1: savedJob.shippingLine1 || "",
        line2: savedJob.shippingLine2 || "",
        city: savedJob.shippingCity || "",
        region: savedJob.shippingRegion || "",
        zip: savedJob.shippingZip || "",
      },
    };
  }

  let billing = savedJob.rawBilling;
  if (!billing) {
    billing = {
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
  }

  const totals = {
    subtotal: coerceNumber(savedJob.subtotal || 0, 0),
    shipping: coerceNumber(savedJob.shippingCost || savedJob.shippingAmount || 0, 0),
    tax: coerceNumber(savedJob.tax || 0, 0),
    grandTotal: coerceNumber(savedJob.grandTotal || 0, 0),

    calculatedSubtotal: coerceNumber(savedJob.calculatedSubtotal || savedJob.subtotal || 0, 0),
    calculatedTax: coerceNumber(savedJob.calculatedTax || savedJob.tax || 0, 0),
    calculatedTotal: coerceNumber(savedJob.calculatedTotal || savedJob.grandTotal || 0, 0),
    overrideSubtotal:
      savedJob.overrideSubtotal != null ? coerceNumber(savedJob.overrideSubtotal, 0) : null,
  };

  const ui = {
    step: 2,
    maxStep: 6,
    stepStatus: {
      Product: "complete",
      Customize: "attention",
      Finalize: "complete",
      Shipping: "complete",
      Billing: "complete",
      Confirm: "pending",
    },
    placingOrder: false,
    orderPlaced: false,
    orderError: "",
  };

  if (deletedMeta.isDeleted) {
    ui.orderError = "This order is marked deleted. Editing is disabled.";
  }

  return {
    ui,
    order: {
      title: savedJob.orderTitle || "",
      orderedBy,
      product,
      jobDraft,
      cart,
      shipping,
      billing,
      totals,

      status: deletedMeta.status || "",
      isDeleted: deletedMeta.isDeleted,
      deletedAt: deletedMeta.deletedAt,
      deletedBy: deletedMeta.deletedBy,
      deletedReason: deletedMeta.deletedReason,
    },
  };
}
