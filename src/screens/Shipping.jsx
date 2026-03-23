// src/screens/Shipping.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useWizard, STEP_FINALIZE, STEP_BILLING } from "../context/WizardContext";
import CancelOrderButton from "../components/CancelOrderButton";
import { upsertCustomer } from "../utils/api";

const METHODS = [
  { key: "pickup", label: "Pickup (free)", cost: 0 },
  { key: "courier", label: "Courier (local)", cost: 0 }, // Now Free
  { key: "carrier", label: "Carrier (UPS/FedEx)", cost: 15 }, // Changed to $15
];

export default function Shipping() {
  const { state, dispatch } = useWizard();
  const { cart, shipping } = state.order;

  // Initialize from Context (if user navigated back) or defaults
  const [addr, setAddr] = useState(() => shipping?.address || {
    name: "",
    line1: "",
    line2: "",
    city: "",
    region: "",
    zip: "",
  });
  
  const [method, setMethod] = useState(() => shipping?.method || "pickup");
  const [saveToProfile, setSaveToProfile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Identify customer from the cart
  const firstItem = cart?.[0] || {};
  const customer = firstItem.customer || null;

  // --- Auto-Populate Logic ---
  // If context is empty, pull from customer object
  useEffect(() => {
    if (shipping?.address) return; // Respect saved wizard state if it exists
    if (!customer) return;

    const isEmpty =
      !addr.name && !addr.line1 && !addr.city && !addr.region && !addr.zip;

    if (!isEmpty) return;

    // Map customer fields to address form
    const name =
      customer.custContact ||
      customer.custName ||
      customer.name ||
      "";

    const line1 = customer.shipLine1 || customer.custAddress || "";
    const line2 = customer.shipLine2 || "";
    const city = customer.shipCity || "";
    const region = customer.shipState || "";
    const zip = customer.shipZip || "";

    setAddr((prev) => ({
      ...prev,
      name,
      line1,
      line2,
      city,
      region,
      zip
    }));
  }, [customer, shipping, addr]);

  // --- Change Detection ---
  // Determine if the current form data differs from the saved customer profile
  const isModified = useMemo(() => {
    if (!customer) return false;
    
    // What the DB thinks the address is:
    const dbLine1 = customer.shipLine1 || customer.custAddress || "";
    const dbLine2 = customer.shipLine2 || "";
    const dbCity = customer.shipCity || "";
    const dbRegion = customer.shipState || "";
    const dbZip = customer.shipZip || "";

    // Check against current form state
    return (
      (addr.line1 || "") !== dbLine1 ||
      (addr.line2 || "") !== dbLine2 ||
      (addr.city || "") !== dbCity ||
      (addr.region || "") !== dbRegion ||
      (addr.zip || "") !== dbZip
    );
  }, [addr, customer]);

  // Reset checkbox if user reverts changes manually
  useEffect(() => {
    if (!isModified) setSaveToProfile(false);
  }, [isModified]);

  // --- Calculations ---
  const itemsTotal = useMemo(
    () => (cart || []).reduce((sum, it) => sum + (it.price?.total || 0), 0),
    [cart]
  );

  const shipCost = METHODS.find((m) => m.key === method)?.cost ?? 0;
  const subtotal = itemsTotal + shipCost;

  const valid =
    addr.name &&
    addr.line1 &&
    addr.city &&
    addr.region &&
    addr.zip;

  // --- Handlers ---

  function handleBack() {
    dispatch({ type: "SET_STEP", payload: STEP_FINALIZE });
  }

  async function handleProceed() {
    setIsSaving(true);

    try {
      // 1. Optional: Update Customer Profile in Background
      if (isModified && saveToProfile && customer?.custId) {
        const updatedCustomer = {
          ...customer,
          shipLine1: addr.line1,
          shipLine2: addr.line2,
          shipCity: addr.city,
          shipState: addr.region,
          shipZip: addr.zip,
          // We don't overwrite billing here, only shipping
        };
        await upsertCustomer(updatedCustomer);
        console.log("Customer shipping profile updated.");
      }
    } catch (err) {
      console.error("Failed to update customer profile:", err);
      // We don't block the order flow for this error, just log it
    }

    // 2. Save Shipping Snapshot to Wizard Context
    dispatch({
      type: "SET_SHIPPING",
      payload: {
        address: addr,
        method,
        cost: shipCost,
      },
    });

    // 3. Move Next
    dispatch({
      type: "MARK_STEP_COMPLETE",
      payload: { label: "Shipping", nextStep: STEP_BILLING },
    });
    
    setIsSaving(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-sm font-semibold">Shipping address</div>

        <input
          placeholder="ATTN / Name"
          value={addr.name}
          onChange={(e) => setAddr({ ...addr, name: e.target.value })}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Address Line 1"
          value={addr.line1}
          onChange={(e) => setAddr({ ...addr, line1: e.target.value })}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <input
          placeholder="Address Line 2 (Optional)"
          value={addr.line2 || ""}
          onChange={(e) => setAddr({ ...addr, line2: e.target.value })}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <div className="grid grid-cols-3 gap-2">
          <input
            placeholder="City"
            value={addr.city}
            onChange={(e) => setAddr({ ...addr, city: e.target.value })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="State"
            value={addr.region}
            onChange={(e) => setAddr({ ...addr, region: e.target.value })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          />
          <input
            placeholder="Zip"
            value={addr.zip}
            onChange={(e) => setAddr({ ...addr, zip: e.target.value })}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </div>

        {/* Dynamic Checkbox: Only show if data is different from DB */}
        {isModified && customer?.custId && (
          <div className="mt-2 flex items-start gap-2 rounded bg-zinc-800/50 p-2">
            <input
              type="checkbox"
              id="saveToProfile"
              checked={saveToProfile}
              onChange={(e) => setSaveToProfile(e.target.checked)}
              className="mt-0.5 accent-[#FDD704]"
            />
            <label htmlFor="saveToProfile" className="text-xs text-zinc-300 cursor-pointer select-none">
              <span className="font-semibold text-[#FDD704]">New address detected.</span>
              <br />
              Update customer's default shipping address?
            </label>
          </div>
        )}

        <div className="mt-3 text-sm font-semibold">Method</div>
        <div className="space-y-2">
          {METHODS.map((m) => (
            <label
              key={m.key}
              className="flex items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="method"
                className="accent-[#FDD704]"
                checked={method === m.key}
                onChange={() => setMethod(m.key)}
              />
              <span>{m.label} {m.cost > 0 ? `($${m.cost})` : ""}</span>
            </label>
          ))}
        </div>
      </div>

      <aside className="space-y-1 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col h-full">
        <div className="text-sm font-semibold">Order subtotal</div>
        <div className="text-xs text-zinc-400">
          Items: ${itemsTotal.toFixed(2)}
        </div>
        <div className="text-xs text-zinc-400">
          Shipping: ${shipCost.toFixed(2)}
        </div>
        <div className="mt-1 text-2xl font-bold">
          Subtotal: ${subtotal.toFixed(2)}
        </div>

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1"></div>

        <div className="pt-4 flex items-center justify-between">
          {/* LEFT: Cancel Button */}
          <CancelOrderButton />

          {/* RIGHT: Navigation */}
          <div className="flex gap-2">
            <button
              onClick={handleBack}
              disabled={isSaving}
              className="rounded border border-zinc-700 px-3 py-1.5 hover:border-[#FDD704]"
            >
              Back
            </button>
            <button
              onClick={handleProceed}
              disabled={!valid || isSaving}
              className={`rounded border px-3 py-1.5 flex items-center gap-2 ${
                valid
                  ? "border-[#FDD704] bg-zinc-900 hover:bg-zinc-800"
                  : "cursor-not-allowed border-zinc-700 bg-zinc-900 opacity-60"
              }`}
            >
              {isSaving && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-[#FDD704]" />
              )}
              <span>Continue to Billing</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}