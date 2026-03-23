// src/components/CancelOrderButton.jsx
import React, { useCallback, useMemo, useState } from "react";
import { useWizard } from "../context/WizardContext";
import { softDeleteJob } from "../utils/api";

function getTicketFromWizardState(state) {
  const draft = state?.order?.jobDraft || {};
  const cart0 = state?.order?.cart?.[0] || {};
  return draft.ticketNo || draft.jobId || cart0.ticketNo || cart0.jobId || null;
}

function isDeletedLike(obj) {
  return !!(obj?.isDeleted || obj?.deletedAt || obj?.status === "deleted");
}

export default function CancelOrderButton({ className = "" }) {
  const { state, dispatch } = useWizard();
  const [isCancelling, setIsCancelling] = useState(false);

  const ticketNo = useMemo(() => getTicketFromWizardState(state), [state]);
  const isEditingExisting = !!ticketNo;

  const isDeleted =
    isDeletedLike(state?.order) ||
    isDeletedLike(state?.order?.jobDraft) ||
    isDeletedLike(state?.order?.cart?.[0]);

  const buttonLabel = useMemo(() => {
    if (isCancelling) return isEditingExisting ? "Marking Deleted..." : "Discarding...";
    if (isEditingExisting) return "Cancel Order";
    return "Discard Draft";
  }, [isCancelling, isEditingExisting]);

  const handleCancel = useCallback(async () => {
    if (isCancelling) return;

    // If the order is already deleted, there is nothing to "cancel" on the backend.
    // In that case, just clear local state.
    if (isEditingExisting && isDeleted) {
      const ok = window.confirm(
        "This order is already marked deleted.\n\nClose it and clear your local draft?"
      );
      if (!ok) return;
      dispatch({ type: "RESET_ORDER" });
      return;
    }

    if (!isEditingExisting) {
      const ok = window.confirm(
        "Discard this draft?\n\nThis only clears your local changes. Nothing has been saved yet."
      );
      if (!ok) return;
      dispatch({ type: "RESET_ORDER" });
      return;
    }

    const ok = window.confirm(
      `Cancel this order?\n\nThis will mark ticket ${ticketNo} as deleted in the sheet (soft delete), and clear your local draft. Printing is still possible from Order History if you enable "Show Deleted".`
    );
    if (!ok) return;

    setIsCancelling(true);
    try {
      await softDeleteJob(ticketNo, { source: "cancel_button" });
      dispatch({ type: "RESET_ORDER" });
    } catch (err) {
      console.error("Soft delete failed:", err);
      window.alert(err?.message || "Could not mark this order as deleted.");
    } finally {
      setIsCancelling(false);
    }
  }, [dispatch, isCancelling, isDeleted, isEditingExisting, ticketNo]);

  return (
    <button
      type="button"
      onClick={handleCancel}
      disabled={isCancelling}
      className={`rounded border px-4 py-2 text-sm font-medium transition-colors ${
        isCancelling
          ? "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
          : isEditingExisting
          ? "border-red-500 text-red-500 hover:bg-red-500/10"
          : "border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
      } ${className}`}
      title={
        isEditingExisting
          ? "Marks the saved order as deleted (soft delete) and clears your draft."
          : "Clears your local draft."
      }
    >
      {buttonLabel}
    </button>
  );
}
