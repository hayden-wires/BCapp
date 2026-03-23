// src/screens/Confirm.jsx
import React, { useMemo } from "react";
import { useWizard, STEP_BILLING } from "../context/WizardContext";
import CancelOrderButton from "../components/CancelOrderButton";
import {
  openPaperTicketWindow,
  openProductionTicketWindow,
  openDeliveryTicketWindow,
  openInvoiceTicketWindow,
  openOrderConfirmationWindow,
  openAllTicketsWindow,
} from "../utils/tickets.js";
import { stockLabelFromKey } from "../utils/tickets/shared";
import { normalizeStockKey } from "../utils/stocks";

function Thumb({ url, mime, fallbackLabel }) {
  if (!url) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-300">
        {fallbackLabel}
      </div>
    );
  }

  if (mime === "application/pdf") {
    return (
      <iframe
        title="proof"
        src={url}
        className="h-24 w-24 rounded bg-zinc-900"
      />
    );
  }

  return (
    <img
      src={url}
      alt="uploaded artwork"
      className="h-24 w-24 rounded bg-zinc-900 object-cover"
    />
  );
}

function isDeletedLike(obj) {
  return !!(obj?.isDeleted || obj?.deletedAt || obj?.status === "deleted");
}

export default function Confirm() {
  const { state, dispatch, placeOrder, isCurrentOrderDeleted } = useWizard();

  const { cart, shipping, billing, totals, title: orderTitle, jobDraft } =
    state.order;
  const { placingOrder, orderPlaced, orderError } = state.ui;

  const item = cart?.[0] || {};
  const draft = jobDraft || {};

  // Edit mode must be derived from the draft (source of truth), not the cart.
  const isEditing = !!draft.ticketNo;

  // Canonical view model for display: draft wins over cart.
  const current = useMemo(() => ({ ...item, ...draft }), [item, draft]);

  // Deleted state (belt + suspenders): use provider guard, but also derive locally.
  const isDeleted =
    !!isCurrentOrderDeleted ||
    isDeletedLike(state.order) ||
    isDeletedLike(draft) ||
    isDeletedLike(item) ||
    isDeletedLike(current);

  const product = current.product || {};
  const versions = current.versions || [];
  const versionCount = current.versionCount ?? versions.length;

  const quantities = versions
    .map((v) => Number(v.quantity) || 0)
    .filter((q) => q > 0);

  const totalQtyFromVersions = quantities.reduce((sum, q) => sum + q, 0);
  const totalQty = current.totalQty || totalQtyFromVersions || 0;

  const allSameQty =
    quantities.length > 0 && quantities.every((q) => q === quantities[0]);
  const qtyPerVersion = allSameQty ? quantities[0] : null;

  const doubleCount = versions.filter((v) => v.sides === "double").length;
  let sidesLabel = "4/0";
  if (doubleCount === 0) sidesLabel = "4/0";
  else if (doubleCount === versionCount) sidesLabel = "4/4";
  else sidesLabel = "Mixed (4/0 + 4/4)";

  const size = current.size || product.size || { w: 3.5, h: 2 };
  const todayStr = new Date().toISOString().slice(0, 10);

  const customer = current.customer || {};
  const orderedBy = state.order.orderedBy ?? current.orderedBy ?? "";
  const shippingAddress = shipping?.address || null;
  const billingAddress = billing?.address || null;

  const subtotal = Number(totals?.subtotal ?? 0);
  const shippingCost = Number(totals?.shipping ?? 0);
  const tax = Number(totals?.tax ?? 0);
  const grandTotal = Number(totals?.grandTotal ?? 0);

  const calculatedSubtotal = Number(totals?.calculatedSubtotal ?? subtotal);
  const overrideSubtotal =
    totals?.overrideSubtotal === null || totals?.overrideSubtotal === undefined
      ? null
      : Number(totals.overrideSubtotal);

  const invoiceLines = useMemo(() => {
    if (versions.length > 0 && totalQty > 0 && subtotal > 0) {
      return versions.map((v) => {
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
    }

    return [
      {
        description:
          product.name ||
          orderTitle ||
          `Business Cards (${size.w}" × ${size.h}")`,
        qty: totalQty || 1,
        unitPrice: totalQty > 0 ? subtotal / totalQty : subtotal || 0,
        total: subtotal || 0,
      },
    ];
  }, [versions, totalQty, subtotal, product.name, orderTitle, size.w, size.h]);

  const jobIdDisplay = draft.ticketNo || current.ticketNo || current.jobId || "—";

  const baseJobForTickets = useMemo(
    () => ({
      jobId: jobIdDisplay || "",
      site: current.site || "NORTH",
      orderDate: current.orderDate || todayStr,
      shipmentDate: current.shipmentDate || todayStr,
      printedAt: current.printedAt || "",
      printedBy: current.printedBy || "",
      productName: product.name || orderTitle || "Business Cards",
      size,
      sidesLabel,
      versionCount,
      qtyPerVersion,
      totalQty,
      stockKey: normalizeStockKey(current.stock || "uncoated") || "uncoated",
      stockOverrideLabel: null,
      customer: { ...customer },
      orderedBy,
      billing: {
        address: billingAddress,
        payment: billing?.payment,
      },
      versions,
      packSize: 250,
      packsPerBox: 4,
      shipping: {
        method: shipping?.method || "Pickup",
        cost: shippingCost,
        address: shippingAddress || {},
        notes: shipping?.notes || "",
      },
      amounts: {
        subtotal,
        shipping: shippingCost,
        tax,
        grandTotal,
        calculatedSubtotal,
        overrideSubtotal,
      },
      lines: invoiceLines,
      cardsPerSheet: current.cardsPerSheet,
      wastePercent: current.wastePercent,
      parentSizeLabel: current.parentSizeLabel,
      proofType: "PDF",
      jobType: isEditing ? "Reprint/Update" : "New",
      prepressNotes: "",
      pressName: "Digital Press",
      finishing: `Cut to ${size.w}" × ${size.h}", box in packs of 250`,

      // Include delete flags so ticket templates can optionally watermark, etc.
      status: current.status || (isDeleted ? "deleted" : ""),
      isDeleted: !!current.isDeleted || isDeleted,
      deletedAt: current.deletedAt || null,
      deletedBy: current.deletedBy || "",
      deletedReason: current.deletedReason || "",
    }),
    [
      jobIdDisplay,
      current.site,
      current.orderDate,
      current.shipmentDate,
      current.printedAt,
      current.printedBy,
      product.name,
      orderTitle,
      size,
      sidesLabel,
      versionCount,
      qtyPerVersion,
      totalQty,
      current.stock,
      customer,
      orderedBy,
      billingAddress,
      billing?.payment,
      versions,
      shipping?.method,
      shippingCost,
      shippingAddress,
      shipping?.notes,
      subtotal,
      tax,
      grandTotal,
      calculatedSubtotal,
      overrideSubtotal,
      invoiceLines,
      current.cardsPerSheet,
      current.wastePercent,
      current.parentSizeLabel,
      isEditing,
      todayStr,
      current.status,
      current.isDeleted,
      current.deletedAt,
      current.deletedBy,
      current.deletedReason,
      isDeleted,
    ]
  );

  function handleBack() {
    if (placingOrder) return;
    dispatch({ type: "SET_STEP", payload: STEP_BILLING });
  }

  function handleStartNewOrder() {
    dispatch({ type: "RESET_ORDER" });
  }

  const wrapTicketAction = (fn) => () => {
    if (!cart || !cart.length) return;
    fn(baseJobForTickets);
  };

  const hasCart = !!(cart && cart.length);
  const disableActions = !hasCart || placingOrder;

  // Update is blocked if deleted (even though WizardContext also blocks, UI should be explicit).
  const disableUpdate =
    disableActions || orderPlaced || (isEditing && isDeleted);

  // Prefer a clear message (we still allow printing).
  const deletedBannerText = useMemo(() => {
    const when = current.deletedAt ? String(current.deletedAt) : "";
    const who = current.deletedBy ? String(current.deletedBy) : "";
    const reason = current.deletedReason ? String(current.deletedReason) : "";
    const parts = [];
    if (when) parts.push(`Deleted at: ${when}`);
    if (who) parts.push(`Deleted by: ${who}`);
    if (reason) parts.push(`Reason: ${reason}`);
    return parts.join(" · ");
  }, [current.deletedAt, current.deletedBy, current.deletedReason]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={placingOrder}
          className={`rounded border px-3 py-1.5 text-sm ${
            placingOrder
              ? "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
              : "border-zinc-700 hover:border-[#FDD704]"
          }`}
        >
          Back
        </button>
        <div className="text-2xl font-bold">Order Confirmation</div>
        <div />
      </div>

      {isDeleted && (
        <div className="rounded-md border border-amber-500 bg-amber-900/25 px-3 py-2 text-xs text-amber-100">
          <div className="font-semibold">This order is marked deleted.</div>
          <div className="mt-0.5 text-amber-100/90">
            Printing is allowed, but updating/saving is disabled to prevent
            accidentally restoring a deleted record.
            {deletedBannerText ? ` ${deletedBannerText}` : ""}
          </div>
        </div>
      )}

      {orderError && (
        <div className="rounded-md border border-red-500 bg-red-900/40 px-3 py-2 text-xs text-red-100">
          {orderError}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
        <div className="flex items-center justify-between text-sm">
          <div>
            <div className="text-xs text-zinc-400">Order</div>
            <div className="text-lg font-semibold">
              {orderTitle || product.name || "Business Cards"}
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            Job ID: <span className="font-mono text-zinc-200">{jobIdDisplay}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {cart.map((it, idx) => {
          const vCount = it.versionCount ?? it.versions?.length ?? 0;
          const price = it.price || {};
          const basePrice = price.baseSinglePrice ?? price.base ?? 0;
          const surcharge = price.sidesSurcharge ?? price.addons ?? 0;
          const stockCost = price.stockSurcharge ?? 0;
          const total = price.total ?? basePrice + surcharge + stockCost;

          const lineSize = it.size || size;
          const lineQty = it.totalQty || totalQty;

          return (
            <div
              key={it.jobId || it.ticketNo || `cart-${idx}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex items-start gap-3">
                <Thumb
                  url={it.previewUrl}
                  mime={it.previewMime}
                  fallbackLabel={`${lineSize.w}″ × ${lineSize.h}″`}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {it.itemTitle || product.name || "Business Cards"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {Number(lineSize.w)}″ × {Number(lineSize.h)}″ · {lineQty} cards ·{" "}
                    {vCount} version{vCount === 1 ? "" : "s"} ·{" "}
                    {stockLabelFromKey(normalizeStockKey(it.stock || "uncoated") || "uncoated")}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Base single-sided: ${basePrice.toFixed(2)}
                    {" · "}
                    Sides surcharge: ${surcharge.toFixed(2)}
                    {stockCost > 0 &&
                      ` · Paper surcharge: $${stockCost.toFixed(2)}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">${total.toFixed(2)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
          <div className="mb-1 text-sm font-semibold">Customer</div>
          {customer?.custName || customer?.custContact ? (
            <div className="space-y-0.5 text-zinc-300">
              {customer.custName && <div>{customer.custName}</div>}
              {customer.custContact && (
                <div className="text-zinc-400">
                  Contact: {customer.custContact}
                </div>
              )}
              {customer.custEmail && (
                <div className="text-zinc-400">{customer.custEmail}</div>
              )}
            </div>
          ) : (
            <div className="text-zinc-400">No customer details.</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
          <div className="mb-1 text-sm font-semibold">Shipping</div>
          {shippingAddress ? (
            <div className="space-y-0.5 text-zinc-300">
              <div>{shippingAddress.name}</div>
              <div>{shippingAddress.line1}</div>
              {shippingAddress.line2 && <div>{shippingAddress.line2}</div>}
              <div>
                {shippingAddress.city}, {shippingAddress.region}{" "}
                {shippingAddress.zip}
              </div>
              <div className="mt-1 text-zinc-400">
                Method: {shipping?.method || "—"}
              </div>
            </div>
          ) : (
            <div className="text-zinc-400">No shipping details.</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
          <div className="mb-1 text-sm font-semibold">Billing</div>
          {billingAddress ? (
            <div className="space-y-0.5 text-zinc-300">
              <div>{billingAddress.name}</div>
              <div>{billingAddress.line1}</div>
              {billingAddress.line2 && <div>{billingAddress.line2}</div>}
              <div>
                {billingAddress.city}, {billingAddress.region}{" "}
                {billingAddress.zip}
              </div>
              <div className="mt-1 text-zinc-400">
                Method: {billing?.payment || "—"}
              </div>
            </div>
          ) : (
            <div className="text-zinc-400">No billing details.</div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-xs">
          <div className="mb-1 text-sm font-semibold">Totals</div>
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-zinc-800 pt-1 text-base font-semibold">
            <span>Total (incl. tax)</span>
            <span>${grandTotal.toFixed(2)}</span>
          </div>

          {overrideSubtotal !== null && (
            <div className="mt-2 rounded bg-zinc-800/70 p-2 text-[11px] text-zinc-300">
              <div className="font-semibold">Subtotal override applied</div>
              <div>Original: ${calculatedSubtotal.toFixed(2)}</div>
            </div>
          )}
        </div>
      </div>

      {orderPlaced && !orderError && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#FDD704] bg-[#FDD704] px-4 py-3 text-xs text-black md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold">
              {isEditing ? "Order updated" : "Order saved"}
            </div>
            <div className="mt-0.5">
              {isEditing ? "Updated" : "Saved"} as{" "}
              <span className="font-mono font-semibold">{jobIdDisplay}</span>.
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <button
              type="button"
              onClick={wrapTicketAction(openAllTicketsWindow)}
              disabled={!hasCart}
              className={`w-full rounded border border-black px-4 py-2 text-sm font-semibold md:w-auto ${
                hasCart
                  ? "bg-transparent text-black hover:bg-black hover:text-[#FDD704]"
                  : "cursor-not-allowed bg-zinc-700 text-zinc-400 opacity-60"
              }`}
            >
              Print Job Tickets
            </button>
            <button
              type="button"
              onClick={handleStartNewOrder}
              className="w-full rounded bg-black px-6 py-2.5 text-sm font-semibold text-[#FDD704] hover:bg-zinc-900 md:w-auto"
            >
              Start New Order
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-zinc-800 pt-4">
        <CancelOrderButton />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={handleBack}
            disabled={placingOrder}
            className={`rounded border px-3 py-1.5 text-sm ${
              placingOrder
                ? "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
                : "border-zinc-700 hover:border-[#FDD704]"
            }`}
          >
            Back
          </button>

          <button
            onClick={wrapTicketAction(openPaperTicketWindow)}
            disabled={disableActions}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions
                ? "border-zinc-600 text-zinc-100 hover:border-[#FDD704]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Paper
          </button>

          <button
            onClick={wrapTicketAction(openProductionTicketWindow)}
            disabled={disableActions}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions
                ? "border-zinc-600 text-zinc-100 hover:border-[#FDD704]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Production
          </button>

          <button
            onClick={wrapTicketAction(openDeliveryTicketWindow)}
            disabled={disableActions}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions
                ? "border-zinc-600 text-zinc-100 hover:border-[#FDD704]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Delivery
          </button>

          <button
            onClick={wrapTicketAction(openInvoiceTicketWindow)}
            disabled={disableActions}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions
                ? "border-zinc-600 text-zinc-100 hover:border-[#FDD704]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Invoice
          </button>

          <button
            onClick={wrapTicketAction(openOrderConfirmationWindow)}
            disabled={disableActions}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions
                ? "border-zinc-600 text-zinc-100 hover:border-[#FDD704]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Confirmation
          </button>

          <button
            onClick={wrapTicketAction(openAllTicketsWindow)}
            disabled={disableActions || orderPlaced}
            className={`rounded border px-3 py-1.5 text-sm ${
              !disableActions && !orderPlaced
                ? "border-[#FDD704] text-zinc-50 hover:bg-[#FDD704] hover:text-black"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            All PDFs
          </button>

          <button
            onClick={placeOrder}
            disabled={disableUpdate}
            title={
              isEditing && isDeleted
                ? "This order is deleted and cannot be updated."
                : undefined
            }
            className={`rounded border px-4 py-2 text-sm font-semibold ${
              !disableUpdate
                ? "border-[#FDD704] text-zinc-50 hover:bg-[#FDD704] hover:text-black"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            {placingOrder ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border border-zinc-300 border-t-transparent" />
                <span>{isEditing ? "Updating..." : "Placing..."}</span>
              </span>
            ) : orderPlaced ? (
              isEditing ? "Updated" : "Placed"
            ) : isEditing ? (
              isDeleted ? (
                "Update Disabled"
              ) : (
                "Update Order"
              )
            ) : (
              "Place Order"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
