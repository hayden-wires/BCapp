// src/components/JobDetailModal.jsx
import React, { useMemo, useState } from "react";
import {
  mapSavedJobToTicketData,
  openPaperTicketWindow,
  openProductionTicketWindow,
  openDeliveryTicketWindow,
  openInvoiceTicketWindow,
  openOrderConfirmationWindow,
  openAllTicketsWindow,
} from "../utils/tickets";
import InvoicedToggle from "./InvoicedToggle";
import { softDeleteJob } from "../utils/api";

export default function JobDetailModal({
  job,
  onClose,
  onEdit,
  onDeleted,
}) {
  if (!job) return null;

  return (
    <JobDetailModalContent
      job={job}
      onClose={onClose}
      onEdit={onEdit}
      onDeleted={onDeleted}
    />
  );
}

function JobDetailModalContent({
  job,
  onClose,
  onEdit,
  onDeleted,
}) {

  const jobId = job.ticketNo || job.jobId || "—";
  const ticketNo = job.ticketNo || job.jobId || "";

  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const ticketBtnClass =
    "rounded border border-zinc-700 py-2 text-sm text-zinc-200 hover:border-[#FDD704] hover:text-white transition-colors";

  const formatSize = (j) => {
    const s = j?.size || { w: 3.5, h: 2 };
    return `${Number(s.w)} × ${Number(s.h)}`;
  };

  const formatMoney = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(n || 0));

  const totals = useMemo(() => {
    const subtotal = Number(job.subtotal ?? 0);
    const shipping = Number(job.shippingCost ?? job.shippingAmount ?? 0);
    const tax = Number(job.tax ?? job.calculatedTax ?? 0);

    const grand =
      Number(job.grandTotal ?? job.total ?? job.calculatedTotal ?? 0) ||
      Number(subtotal + shipping + tax);

    return { subtotal, shipping, tax, grandTotal: grand };
  }, [job]);

  const orderedBy = useMemo(() => {
    if (job.orderedBy) return String(job.orderedBy);

    if (job.billingName) return String(job.billingName);

    const bName = job.billingAddress?.name;
    if (bName) return String(bName);

    return "";
  }, [job]);

  const isDeleted = !!(job.isDeleted || job.deletedAt || job.status === "deleted");

  const handlePrint = (ticketFn) => {
    const data = mapSavedJobToTicketData(job);
    if (data) ticketFn(data);
  };

  const handleDelete = async () => {
    if (!ticketNo || isDeleting || isDeleted) return;

    const ok = window.confirm(
      `Mark job ${ticketNo} as deleted?\n\nThis will hide it from normal views, but keep it in the sheet for audit/history.`
    );
    if (!ok) return;

    setDeleteError("");
    setIsDeleting(true);

    try {
      await softDeleteJob(ticketNo);

      // Signal to parent that deletion occurred.
      // Parent should refresh data when the modal is closed (per your requirement).
      if (typeof onDeleted === "function") onDeleted(ticketNo);

      // Close immediately; parent handles refresh-on-close behavior.
      onClose?.();
    } catch (err) {
      console.error("Soft delete failed:", err);
      setDeleteError(err?.message || "Failed to delete job.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold text-white">Job {jobId}</h3>

              <InvoicedToggle
                ticketNo={ticketNo}
                initialStatus={!!job.isInvoiced}
                size="md"
              />
            </div>

            <p className="mt-1 text-sm text-zinc-400">
              {job.custName || job.clientName || "—"}
            </p>

            {isDeleted && (
              <div className="mt-2 inline-flex rounded border border-red-500/40 bg-red-900/20 px-2 py-1 text-[11px] font-semibold text-red-200">
                Deleted
              </div>
            )}
          </div>

          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            Close
          </button>
        </div>

        {deleteError && (
          <div className="rounded-md border border-red-500 bg-red-900/40 px-3 py-2 text-xs text-red-100">
            {deleteError}
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-zinc-800/50 bg-zinc-950/50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Date:</span>
            <span className="text-zinc-200">
              {job.orderDate ? new Date(job.orderDate).toLocaleDateString() : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-zinc-400">Product:</span>
            <span className="text-zinc-200">
              {job.orderTitle || job.productName || "Business Cards"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-zinc-400">Dimensions:</span>
            <span className="text-zinc-200">{formatSize(job)}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-zinc-400">Quantity:</span>
            <span className="text-zinc-200">{job.totalQty ?? "—"}</span>
          </div>

          {!!orderedBy && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Ordered by:</span>
              <span className="text-zinc-200">{orderedBy}</span>
            </div>
          )}

          {(job.shippingMethod || job.paymentMethod) && (
            <div className="flex justify-between">
              <span className="text-zinc-400">Ship / Pay:</span>
              <span className="text-zinc-200">
                {(job.shippingMethod || "—") + " / " + (job.paymentMethod || "—")}
              </span>
            </div>
          )}

          <div className="mt-2 flex justify-between border-t border-zinc-800 pt-2">
            <span className="font-semibold text-zinc-300">Total:</span>
            <span className="font-bold text-[#FDD704]">
              {formatMoney(totals.grandTotal)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handlePrint(openPaperTicketWindow)}
            className={ticketBtnClass}
          >
            Paper Ticket
          </button>
          <button
            onClick={() => handlePrint(openProductionTicketWindow)}
            className={ticketBtnClass}
          >
            Production Ticket
          </button>
          <button
            onClick={() => handlePrint(openDeliveryTicketWindow)}
            className={ticketBtnClass}
          >
            Delivery Ticket
          </button>
          <button
            onClick={() => handlePrint(openInvoiceTicketWindow)}
            className={ticketBtnClass}
          >
            Invoice
          </button>

          <button
            onClick={() => handlePrint(openOrderConfirmationWindow)}
            className={`col-span-2 ${ticketBtnClass}`}
          >
            Order Confirmation
          </button>

          <button
            onClick={() => handlePrint(openAllTicketsWindow)}
            className="col-span-2 rounded bg-[#FDD704] py-2 text-sm font-bold text-black transition-colors hover:bg-[#e5c204]"
          >
            Print All PDFs
          </button>
        </div>

        <div className="space-y-2 border-t border-zinc-800 pt-4">
          {onEdit && (
            <button
              onClick={() => onEdit(job)}
              disabled={isDeleted}
              className={`w-full rounded border py-2 text-sm transition-colors ${
                isDeleted
                  ? "cursor-not-allowed border-zinc-800 text-zinc-500 opacity-60"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              Edit Order
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={!ticketNo || isDeleting || isDeleted}
            className={`w-full rounded border py-2 text-sm font-semibold transition-colors ${
              !ticketNo || isDeleting || isDeleted
                ? "cursor-not-allowed border-zinc-800 text-zinc-500 opacity-60"
                : "border-red-500/60 text-red-200 hover:bg-red-900/30 hover:border-red-400"
            }`}
          >
            {isDeleted ? "Deleted" : isDeleting ? "Deleting..." : "Delete Job"}
          </button>

          <div className="text-[11px] text-zinc-500">
            Delete is a soft delete: the job stays in the sheet, but is marked deleted.
          </div>
        </div>
      </div>
    </div>
  );
}
