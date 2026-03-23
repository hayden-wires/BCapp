// src/screens/Finalize.jsx
import React, { useMemo } from "react";
import { useWizard, STEP_CUSTOMIZE, STEP_SHIPPING } from "../context/WizardContext";
import { stockLabelFromKey } from "../utils/tickets/shared";

export default function Finalize() {
  const { state, dispatch } = useWizard();
  const { cart, orderedBy } = state.order;

  const itemsTotal = useMemo(
    () => cart.reduce((sum, it) => sum + (it.price?.total ?? 0), 0),
    [cart]
  );

  function handleRemove(targetIndex) {
    const newCart = cart.filter((_, index) => index !== targetIndex);
    dispatch({ type: "UPDATE_CART", payload: newCart });
  }

  function handleProceed() {
    if (!cart || !cart.length) return;

    const ob = orderedBy ?? "";
    const newCart = cart.map((it) => ({ ...it, orderedBy: ob }));
    dispatch({ type: "UPDATE_CART", payload: newCart });

    dispatch({
      type: "MARK_STEP_COMPLETE",
      payload: { label: "Finalize", nextStep: STEP_SHIPPING },
    });
  }

  function handleBack() {
    dispatch({ type: "SET_STEP", payload: STEP_CUSTOMIZE });
  }

  const hasItems = !!(cart && cart.length > 0);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:border-[#FDD704]"
        >
          Back
        </button>

        <div className="text-2xl font-bold">Finalize Order</div>

        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-500"
        >
          Add another item
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <label className="block text-sm font-semibold text-zinc-200">
          Ordered By
        </label>
        <input
          type="text"
          value={orderedBy ?? ""}
          onChange={(e) =>
            dispatch({ type: "SET_ORDERED_BY", payload: e.target.value })
          }
          placeholder="Name of the person placing the order"
          className="mt-2 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-[#FDD704] focus:outline-none"
        />
        <div className="mt-2 text-xs text-zinc-500">
          This will appear on the invoice and be saved with the job.
        </div>
      </div>

      <div className="space-y-3">
        {!hasItems && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No items in the cart yet.
          </div>
        )}

        {cart.map((it, index) => {
          const uniqueKey = it.jobId || `item-${index}`;
          const product = it.product || {};
          const size = product.size || { w: 3.5, h: 2 };
          const vCount = it.versionCount ?? it.versions?.length ?? 0;

          const qtys = it.versions?.map((v) => Number(v.quantity) || 0) ?? [];
          const totalFromVersions = qtys.reduce((s, q) => s + q, 0);
          const totalQty = it.totalQty || totalFromVersions || 0;

          const price = it.price || {};
          const baseSingle = price.baseSinglePrice ?? price.base ?? price.total ?? 0;
          const sidesSurcharge = price.sidesSurcharge ?? price.addons ?? 0;
          const lineTotal = price.total ?? baseSingle + sidesSurcharge;
          const perCard = totalQty > 0 ? (lineTotal / totalQty).toFixed(4) : null;

          const hasDouble = it.versions?.some((v) => v.sides === "double") ?? false;
          const allDouble =
            it.versions && it.versions.length > 0
              ? it.versions.every((v) => v.sides === "double")
              : false;

          let sidesLabel = "single";
          if (hasDouble && !allDouble) sidesLabel = "mixed";
          else if (allDouble) sidesLabel = "double";

          const stockLabel = stockLabelFromKey(it.stock || "uncoated");

          return (
            <div
              key={uniqueKey}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-24 w-24 items-center justify-center rounded bg-zinc-800 text-xs text-zinc-300">
                  {size.w}″ × {size.h}″
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {it.itemTitle || product.name || "Business Cards"}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {size.w}″ × {size.h}″ · {totalQty} cards · {vCount}{" "}
                    version{vCount === 1 ? "" : "s"} · {sidesLabel} · {stockLabel}
                  </div>

                  {it.versions && it.versions.length > 0 && (
                    <div className="mt-2 text-xs text-zinc-400">
                      Versions:
                      <div className="mt-1 space-y-0.5">
                        {it.versions.map((v, idx) => (
                          <div key={idx}>
                            V{idx + 1} — Qty {v.quantity || 0} (
                            {v.sides === "double" ? "double-sided" : "single-sided"})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-zinc-500">
                    Base single-sided: ${baseSingle.toFixed(2)} · Sides surcharge: $
                    {sidesSurcharge.toFixed(2)}
                    {perCard && <> · Per card: ${perCard}</>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-lg font-bold">${lineTotal.toFixed(2)}</div>
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-red-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between text-lg">
          <span className="text-sm font-semibold">Subtotal</span>
          <span className="text-xl font-bold">${itemsTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={handleProceed}
          disabled={!hasItems}
          className={`rounded border px-4 py-2 text-sm ${
            hasItems
              ? "border-[#FDD704] text-zinc-50 hover:bg-[#FDD704] hover:text-black"
              : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
          }`}
        >
          Proceed to Shipping
        </button>
      </div>
    </div>
  );
}
