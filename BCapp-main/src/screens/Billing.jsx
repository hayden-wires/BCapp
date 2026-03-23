// src/screens/Billing.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWizard, STEP_SHIPPING, STEP_CONFIRM } from "../context/WizardContext";
import CancelOrderButton from "../components/CancelOrderButton";

export default function Billing() {
  const { state, dispatch } = useWizard();
  const { cart, shipping, billing } = state.order;

  // --- State Initialization ---

  // Helper to compare two address objects
  const areAddressesEqual = (a, b) => {
    if (!a || !b) return false;

    const normalizeAddress = (address) => ({
      name: address?.name ?? "",
      line1: address?.line1 ?? "",
      line2: address?.line2 ?? "",
      city: address?.city ?? "",
      region: address?.region ?? "",
      zip: address?.zip ?? "",
    });

    const normalizedA = normalizeAddress(a);
    const normalizedB = normalizeAddress(b);

    return (
      normalizedA.name === normalizedB.name &&
      normalizedA.line1 === normalizedB.line1 &&
      normalizedA.line2 === normalizedB.line2 &&
      normalizedA.city === normalizedB.city &&
      normalizedA.region === normalizedB.region &&
      normalizedA.zip === normalizedB.zip
    );
  };

  // 1. Determine if "Same as Shipping" should be checked initially
  const [useSameAsShipping, setUseSameAsShipping] = useState(() => {
    // If no billing saved yet, default to TRUE
    if (!billing?.address) return true;
    // If billing saved, only true if it matches shipping
    return areAddressesEqual(billing.address, shipping?.address);
  });

  // 2. Address State
  // If useSameAsShipping is true, we initialize with shipping address.
  // Otherwise, use saved billing address or empty defaults.
  const [addr, setAddr] = useState(() => {
    if (useSameAsShipping && shipping?.address) {
      return shipping.address;
    }
    return billing?.address || { name: "", line1: "", line2: "", city: "", region: "", zip: "" };
  });
  
  const [pay, setPay] = useState(() => billing?.payment || "card");

  // Optional manual override of the pre-tax subtotal
  const [overrideInput, setOverrideInput] = useState(() => 
    state.order.totals?.overrideSubtotal !== null 
      ? String(state.order.totals.overrideSubtotal) 
      : ""
  );
  
  const [overrideTouched, setOverrideTouched] = useState(false);
  const [staleOverrideNotice, setStaleOverrideNotice] = useState("");

  const savedCalculatedSubtotal = useMemo(() => {
    const prior = state.order.totals?.calculatedSubtotal;
    return Number.isFinite(Number(prior)) ? Number(prior) : null;
  }, [state.order.totals?.calculatedSubtotal]);

  const savedOverrideSubtotal = useMemo(() => {
    const prior = state.order.totals?.overrideSubtotal;
    return prior !== null && prior !== undefined ? Number(prior) : null;
  }, [state.order.totals?.overrideSubtotal]);

  // --- Effects ---

  // SYNC Logic: Keep billing address in sync with shipping if checkbox is checked
  useEffect(() => {
    if (useSameAsShipping && shipping?.address) {
      setAddr(shipping.address);
    }
  }, [useSameAsShipping, shipping?.address]);

  // Handle Checkbox Toggle
  const handleSameAsShippingChange = (e) => {
    const isChecked = e.target.checked;
    setUseSameAsShipping(isChecked);

    if (!isChecked) {
      // REQUIREMENT: "If the user unchecks it, all the data in the Billing field will be erased"
      setAddr({ name: "", line1: "", line2: "", city: "", region: "", zip: "" });
    } else {
      // If re-checked, the useEffect above will immediately sync it back
    }
  };

  // --- Calculations ---

  const itemsTotal = useMemo(
    () => (cart || []).reduce((sum, it) => sum + (it.price?.total || 0), 0),
    [cart]
  );

  const shippingCost = shipping?.cost ?? 0;

  // System-calculated subtotal (Items + Shipping)
  const calculatedSubtotal = useMemo(
    () => itemsTotal + shippingCost,
    [itemsTotal, shippingCost]
  );

  const TAX_RATE = 0.0875; // 8.75%

  const calculatedTax = useMemo(
    () => Math.round(calculatedSubtotal * TAX_RATE * 100) / 100,
    [calculatedSubtotal]
  );

  const calculatedTotal = useMemo(
    () => Math.round((calculatedSubtotal + calculatedTax) * 100) / 100,
    [calculatedSubtotal, calculatedTax]
  );

  // --- Override handling ---

  const parsedOverride = useMemo(() => {
    if (overrideInput.trim() === "") return null;
    const n = Number(overrideInput);
    if (!Number.isFinite(n) || n < 0) return NaN;
    return n;
  }, [overrideInput]);

  const overrideError =
    overrideTouched &&
    parsedOverride !== null &&
    Number.isNaN(parsedOverride)
      ? "Override must be a non-negative number."
      : "";

  const activeSubtotal =
    parsedOverride !== null && !Number.isNaN(parsedOverride)
      ? parsedOverride
      : calculatedSubtotal;

  const tax = useMemo(
    () => Math.round(activeSubtotal * TAX_RATE * 100) / 100,
    [activeSubtotal]
  );

  const grandTotal = useMemo(
    () => Math.round((activeSubtotal + tax) * 100) / 100,
    [activeSubtotal, tax]
  );

  const persistTotals = useCallback((overrideSubtotalValue) => {
    const validOverride =
      overrideSubtotalValue !== null &&
      overrideSubtotalValue !== undefined &&
      !Number.isNaN(overrideSubtotalValue)
        ? overrideSubtotalValue
        : null;

    const subtotalForSave =
      validOverride !== null ? validOverride : calculatedSubtotal;

    const taxForSave = Math.round(subtotalForSave * TAX_RATE * 100) / 100;
    const totalForSave = Math.round((subtotalForSave + taxForSave) * 100) / 100;

    dispatch({
      type: "SET_TOTALS",
      payload: {
        subtotal: subtotalForSave,
        shipping: shippingCost,
        tax: taxForSave,
        grandTotal: totalForSave,
        calculatedSubtotal,
        calculatedTax,
        calculatedTotal,
        overrideSubtotal: validOverride,
      },
    });
  }, [
    calculatedSubtotal,
    calculatedTax,
    calculatedTotal,
    dispatch,
    shippingCost,
    TAX_RATE,
  ]);

  useEffect(() => {
    const hasSavedOverride = savedOverrideSubtotal !== null;
    const hasSavedCalculatedSubtotal = savedCalculatedSubtotal !== null;
    const hasCalculatedChanged =
      hasSavedCalculatedSubtotal &&
      Math.abs(calculatedSubtotal - savedCalculatedSubtotal) > 0.00001;

    if (hasSavedOverride && hasCalculatedChanged && !overrideTouched) {
      setOverrideInput("");
      setStaleOverrideNotice(
        "Previous manual override was cleared because the cart subtotal changed."
      );
      persistTotals(null);
    }
  }, [
    calculatedSubtotal,
    overrideTouched,
    persistTotals,
    savedCalculatedSubtotal,
    savedOverrideSubtotal,
  ]);

  // --- Validation ---

  const validAddr =
    addr.name &&
    addr.line1 &&
    addr.city &&
    addr.region &&
    addr.zip;

  const validPayment = pay === "card" || pay === "invoice";
  const valid = validAddr && validPayment && !overrideError;

  // --- Handlers ---

  function handleBack() {
    dispatch({ type: "SET_STEP", payload: STEP_SHIPPING });
  }

  function proceed() {
    // 1. Save Billing Snapshot
    dispatch({
      type: "SET_BILLING",
      payload: {
        address: addr,
        payment: pay,
      },
    });

    // 2. Save Totals (Active + Audit)
    persistTotals(
      parsedOverride !== null && !Number.isNaN(parsedOverride)
        ? parsedOverride
        : null
    );

    // 3. Move Next
    dispatch({ 
      type: "MARK_STEP_COMPLETE", 
      payload: { label: "Billing", nextStep: STEP_CONFIRM } 
    });
  }

  // --- Render ---

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Left: Billing details */}
      <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        
        {/* Same as Shipping Checkbox */}
        <div className="mb-4 flex items-center gap-2 rounded bg-zinc-800/50 p-2">
          <input
            type="checkbox"
            id="sameAsShipping"
            checked={useSameAsShipping}
            onChange={handleSameAsShippingChange}
            className="accent-[#FDD704] h-4 w-4"
          />
          <label htmlFor="sameAsShipping" className="text-sm text-zinc-300 cursor-pointer select-none">
            Billing address is same as shipping address
          </label>
        </div>

        <div className="text-sm font-semibold">Billing address</div>
        
        <input
          placeholder="Name / Company"
          value={addr.name}
          onChange={(e) => setAddr({ ...addr, name: e.target.value })}
          disabled={useSameAsShipping}
          className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <input
          placeholder="Address Line 1"
          value={addr.line1}
          onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
          disabled={useSameAsShipping}
          className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <input
          placeholder="Address Line 2 (Optional)"
          value={addr.line2 || ""}
          onChange={(e) => setAddr({ ...addr, line2: e.target.value })}
          disabled={useSameAsShipping}
          className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            placeholder="City"
            value={addr.city}
            onChange={(e) => setAddr({ ...addr, city: e.target.value })}
            disabled={useSameAsShipping}
            className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          <input
            placeholder="State"
            value={addr.region}
            onChange={(e) => setAddr({ ...addr, region: e.target.value })}
            disabled={useSameAsShipping}
            className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
          />
          <input
            placeholder="Zip"
            value={addr.zip}
            onChange={(e) => setAddr({ ...addr, zip: e.target.value })}
            disabled={useSameAsShipping}
            className={`w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm ${useSameAsShipping ? "opacity-50 cursor-not-allowed" : ""}`}
          />
        </div>

        <div className="mt-3 text-sm font-semibold">Payment</div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            className="accent-[#FDD704]"
            checked={pay === "card"}
            onChange={() => setPay("card")}
          />
          <span>Credit/Debit Card</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            className="accent-[#FDD704]"
            checked={pay === "invoice"}
            onChange={() => setPay("invoice")}
          />
          <span>Invoice (approved accounts)</span>
        </label>

        {pay === "card" && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              placeholder="Card number"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="Name on card"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="MM/YY"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="CVC"
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      {/* Right: Totals + override */}
      <aside className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col h-full">
        <div className="text-sm font-semibold">Totals</div>

        <div className="text-xs text-zinc-400">
          Items: ${itemsTotal.toFixed(2)}
        </div>
        <div className="text-xs text-zinc-400">
          Shipping: ${shippingCost.toFixed(2)}
        </div>
        <div className="text-xs text-zinc-400">
          Calculated subtotal (items + shipping): $
          {calculatedSubtotal.toFixed(2)}
        </div>

        <div className="mt-2 space-y-1">
          <label className="text-xs font-medium text-zinc-300">
            Override subtotal before tax (optional)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={overrideInput}
            onChange={(e) => {
              setOverrideInput(e.target.value);
              setStaleOverrideNotice("");
              if (!overrideTouched) setOverrideTouched(true);
            }}
            placeholder="Leave blank to use calculated subtotal"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          />
          <p className="text-[11px] text-zinc-400">
            {parsedOverride !== null && !Number.isNaN(parsedOverride)
              ? "Status: Manual override"
              : "Status: Calculated from current cart"}
          </p>
          {staleOverrideNotice && (
            <p className="text-[11px] text-amber-300">{staleOverrideNotice}</p>
          )}
          {overrideError && (
            <p className="text-[11px] text-red-400">{overrideError}</p>
          )}
          {parsedOverride !== null && !Number.isNaN(parsedOverride) && (
            <p className="text-[11px] text-amber-300">
              Using override subtotal of ${parsedOverride.toFixed(2)} before tax.
            </p>
          )}
        </div>

        <div className="text-xs text-zinc-400">
          Tax: ${tax.toFixed(2)}
        </div>
        <div className="mt-1 text-2xl font-bold">
          Total: ${grandTotal.toFixed(2)}
        </div>

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1"></div>

        <div className="pt-4 flex items-center justify-between">
          {/* LEFT: Cancel Button */}
          <CancelOrderButton />

          {/* RIGHT: Navigation */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBack}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:border-[#FDD704]"
            >
              Back
            </button>
            <button
              type="button"
              onClick={proceed}
              disabled={!valid}
              className={`rounded border px-3 py-1.5 text-sm ${
                valid
                  ? "border-[#FDD704] bg-zinc-900 hover:bg-zinc-800"
                  : "cursor-not-allowed border-zinc-700 bg-zinc-900 opacity-60"
              }`}
            >
              Review &amp; Confirm
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
