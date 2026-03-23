// src/screens/Customize.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useWizard, STEP_PRODUCT, STEP_FINALIZE } from "../context/WizardContext";
import {
  STOCKS,
  MIN_QTY,
  MAX_QTY,
  QTY_STEP,
  computeBusinessCardPrice,
} from "../utils/pricing";
import { calculateImposition } from "../utils/imposition";
import { peekNextTicket, fetchCustomers } from "../utils/api";
import CancelOrderButton from "../components/CancelOrderButton";

// ----- Helpers -----

function makeEmptyVersion() {
  return {
    name: "",
    other: "", // Notes
    sides: "double", // "single" | "double"
    quantity: MIN_QTY,
    finish: "none", // "none" | "round_corners"
  };
}

function CopyIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function DeleteIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  );
}

function LockIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
  );
}

export default function Customize() {
  const { state, dispatch } = useWizard();

  // Destructure title here so we can bind the input to it
  const { jobDraft, title } = state.order;
  const product = state.order.product || { name: "Business Cards" };

  // Editing = job already exists in DB (has real ticketNo/jobId)
  const isEditing = !!(jobDraft.ticketNo || jobDraft.jobId);

  const [jobIdLoading, setJobIdLoading] = useState(false);
  const [customersCache, setCustomersCache] = useState([]);
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);

  const [customerQuery, setCustomerQuery] = useState(
    () => jobDraft.customer?.custName || ""
  );

  // Local state for Dimensions (initialized from Draft)
  const [width, setWidth] = useState(jobDraft.size?.w || 3.5);
  const [height, setHeight] = useState(jobDraft.size?.h || 2);

  // ----- Effects -----

  // 1) Load Customers
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await fetchCustomers();
        if (!cancelled && Array.isArray(list)) {
          setCustomersCache(list);
        }
      } catch (err) {
        console.error("Failed to load customers", err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2) Peek Next Ticket (preview only; never becomes the real jobId)
  useEffect(() => {
    if (isEditing) return;

    let cancelled = false;
    async function doPeek() {
      try {
        setJobIdLoading(true);
        const res = await peekNextTicket("BC");
        const suggestion = res?.suggestion || res?.ticketNo;

        if (!cancelled && suggestion) {
          dispatch({
            type: "UPDATE_DRAFT",
            payload: {
              // Make sure we're not carrying a real saved ticket into a new draft
              ticketNo: null,
              jobId: null,
              ticketPreview: String(suggestion),
            },
          });
        }
      } catch (err) {
        console.error("peekNextTicket failed", err);
      } finally {
        if (!cancelled) setJobIdLoading(false);
      }
    }

    doPeek();
    return () => {
      cancelled = true;
    };
  }, [isEditing, dispatch]);

  // 3) Sync Dimensions to Context
  useEffect(() => {
    dispatch({
      type: "UPDATE_DRAFT",
      payload: { size: { w: Number(width), h: Number(height) } },
    });
  }, [width, height, dispatch]);

  // ----- Derived Calculations -----

  const versions = Array.isArray(jobDraft.versions) ? jobDraft.versions : [];
  const versionCount = Number(jobDraft.versionCount || 0);

  const totalQty = useMemo(
    () => versions.reduce((sum, v) => sum + (Number(v.quantity) || 0), 0),
    [versions]
  );

  const doubleCount = useMemo(
    () =>
      versions.reduce((count, v) => (v.sides === "double" ? count + 1 : count), 0),
    [versions]
  );

  const finishCount = useMemo(
    () =>
      versions.reduce(
        (count, v) => (v.finish === "round_corners" ? count + 1 : count),
        0
      ),
    [versions]
  );

  const hasVersions = versionCount > 0;
  const meetsMinQty = totalQty >= MIN_QTY;

  const impositionStats = useMemo(() => {
    return calculateImposition(width, height, totalQty);
  }, [width, height, totalQty]);

  const sidesForPricing = doubleCount > 0 ? "double" : "single";
  const versionCountForPricing = doubleCount || 1;

  const price = useMemo(() => {
    if (!hasVersions || !meetsMinQty) return null;
    return computeBusinessCardPrice({
      sides: sidesForPricing,
      versionCount: versionCountForPricing,
      totalQty,
      stock: jobDraft.stock || "uncoated",
      finishCount,
    });
  }, [
    hasVersions,
    meetsMinQty,
    sidesForPricing,
    versionCountForPricing,
    totalQty,
    jobDraft.stock,
    finishCount,
  ]);

  const canPrice = !!(price && price.valid);

  // IMPORTANT CHANGE:
  // Next should NOT require jobDraft.jobId anymore (jobId is only allocated on save).
  // Gate on “we have a valid price” + “not currently peeking”.
  const canNext = canPrice && !jobIdLoading;

  const sidesSummary =
    doubleCount === 0
      ? "4/0"
      : doubleCount === versionCount
      ? "4/4"
      : "Mixed (4/0 + 4/4)";

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return [];
    return customersCache
      .filter((c) => c.custName && c.custName.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customersCache, customerQuery]);

  const versionOptions = useMemo(() => {
    const max = Math.max(8, versionCount + 1);
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [versionCount]);

  // ----- Handlers -----

  const handleBack = () => {
    dispatch({ type: "SET_STEP", payload: STEP_PRODUCT });
  };

  const handleNext = () => {
    if (!canNext) return;

    const pricingMeta = {
      sides: sidesForPricing,
      doubleVersionCount: doubleCount,
      effectiveVersionCount: versionCountForPricing,
      finishCount,
    };

    let finalCustomer = jobDraft.customer;

    // Ensure we capture typed customer name even if not selected from dropdown
    if (!finalCustomer || !finalCustomer.custName) {
      if (customerQuery.trim()) {
        finalCustomer = {
          custName: customerQuery.trim(),
          custId: "",
          custContact: "",
          custEmail: "",
          custPhone: "",
          custAddress: "",
        };
      } else {
        finalCustomer = null;
      }
    }

    dispatch({
      type: "COMMIT_DRAFT_TO_CART",
      payload: {
        totalQty,
        price,
        pricingMeta,
        customer: finalCustomer,
        versionCount,
        versions,
        size: { w: Number(width), h: Number(height) },
      },
    });

    dispatch({
      type: "MARK_STEP_COMPLETE",
      payload: { label: "Customize", nextStep: STEP_FINALIZE },
    });
  };

  // --- Field Updaters ---

  const setStock = (val) => {
    dispatch({ type: "UPDATE_DRAFT", payload: { stock: val } });
  };

  // Ticket preview input (display-only; does not become the real ticket id)
  const setJobId = (val) => {
    let next = String(val || "").trim().toUpperCase();
    const core = next.replace(/BC/g, "");
    next = core ? `${core}BC` : "";
    dispatch({ type: "UPDATE_DRAFT", payload: { ticketPreview: next } });
  };

  const setVersionCount = (count) => {
    const newCount = Number(count) || 0;
    let newVersions = [...versions];

    if (newCount > versions.length) {
      for (let i = versions.length; i < newCount; i++) {
        newVersions.push(makeEmptyVersion());
      }
    } else if (newCount < versions.length) {
      newVersions = newVersions.slice(0, newCount);
    }

    dispatch({
      type: "UPDATE_DRAFT",
      payload: { versionCount: newCount, versions: newVersions },
    });
  };

  const handleCopyVersion = (idx) => {
    const source = versions[idx];
    const clone = { ...source };

    const newVersions = [...versions];
    newVersions.splice(idx + 1, 0, clone);

    dispatch({
      type: "UPDATE_DRAFT",
      payload: { versions: newVersions, versionCount: newVersions.length },
    });
  };

  const handleDeleteVersion = (idx) => {
    const newVersions = [...versions];
    newVersions.splice(idx, 1);

    dispatch({
      type: "UPDATE_DRAFT",
      payload: { versions: newVersions, versionCount: newVersions.length },
    });
  };

  const updateVersion = (idx, patch) => {
    const newVersions = [...versions];
    newVersions[idx] = { ...newVersions[idx], ...patch };
    dispatch({ type: "UPDATE_DRAFT", payload: { versions: newVersions } });
  };

  const handleCustomerSelect = (c) => {
    setCustomerQuery(c.custName || "");
    setShowCustomerSuggestions(false);
    dispatch({ type: "UPDATE_DRAFT", payload: { customer: c } });
  };

  const clearCustomer = () => {
    setCustomerQuery("");
    dispatch({ type: "UPDATE_DRAFT", payload: { customer: null } });
  };

  const selectedCustomer = jobDraft.customer;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="rounded border border-zinc-700 px-3 py-1.5 text-sm hover:border-[#FDD704]"
        >
          Back
        </button>

        <div className="min-w-0 flex-1 text-center text-sm font-semibold">
          {product.name}
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Job ID:</span>
          <div className="relative">
            <input
              type="text"
              value={jobDraft.ticketPreview || jobDraft.jobId || ""}
              onChange={(e) => setJobId(e.target.value)}
              disabled={isEditing}
              className={`w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs ${
                isEditing ? "opacity-50 cursor-not-allowed pr-6" : ""
              }`}
            />
            {isEditing && (
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500">
                <LockIcon className="w-3 h-3" />
              </div>
            )}
          </div>
          {jobIdLoading && (
            <span className="h-3 w-3 animate-spin rounded-full border border-zinc-500 border-t-transparent" />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left: Order details */}
        <section className="space-y-4 lg:col-span-2">
          {/* Main Details Panel */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
            <h2 className="text-sm font-semibold">Order details</h2>

            {/* Project Title Input */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">
                Project Title{" "}
                <span className="text-zinc-500 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={title || ""}
                onChange={(e) =>
                  dispatch({ type: "SET_TITLE", payload: e.target.value })
                }
                placeholder="e.g. Summer Campaign"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-[#FDD704] focus:outline-none"
              />
            </div>

            {/* Customer Search */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-300">
                Customer name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customerQuery}
                  placeholder="Start typing to search or add a customer"
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    if (selectedCustomer?.custId) {
                      dispatch({
                        type: "UPDATE_DRAFT",
                        payload: { customer: null },
                      });
                    }
                    setShowCustomerSuggestions(true);
                  }}
                  onFocus={() => setShowCustomerSuggestions(true)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-[#FDD704] focus:outline-none"
                />

                {showCustomerSuggestions && filteredCustomers.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-md border border-zinc-700 bg-zinc-900 text-xs shadow-lg">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.custId || c.custName}
                        type="button"
                        className="block w-full px-2 py-1 text-left hover:bg-zinc-800"
                        onClick={() => handleCustomerSelect(c)}
                      >
                        <div className="font-medium text-zinc-100">
                          {c.custName}
                        </div>
                        <div className="text-[10px] text-zinc-400">
                          {c.custId ? `ID ${c.custId}` : ""}
                          {c.custContact ? ` · ${c.custContact}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedCustomer?.custId ? (
                <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>
                    Using saved customer{" "}
                    <span className="font-semibold">
                      {selectedCustomer.custName}
                    </span>
                    {` (ID ${selectedCustomer.custId})`}
                  </span>
                  <button
                    type="button"
                    onClick={clearCustomer}
                    className="ml-2 text-[10px] underline"
                  >
                    Clear
                  </button>
                </div>
              ) : customerQuery ? (
                <p className="mt-1 text-[11px] text-zinc-500">
                  This will be saved as a new customer when the job is created.
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500">
                  Optional, but recommended so tickets include customer name.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">Paper</label>
                <select
                  value={jobDraft.stock || "uncoated"}
                  onChange={(e) => setStock(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                >
                  {STOCKS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-300">
                  Number of versions
                </label>
                <select
                  value={versionCount}
                  onChange={(e) => setVersionCount(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                >
                  {versionOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500">
                  Choose how many unique names/titles you are ordering.
                </p>
              </div>
            </div>
          </div>

          {/* Size & Imposition Panel */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Size & Imposition</h2>

            <div className="flex gap-4">
              {/* Inputs */}
              <div className="w-1/2 grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Width</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.125"
                      min="1"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                    />
                    <span className="absolute right-2 top-1.5 text-zinc-500 text-xs">
                      ″
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Height</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.125"
                      min="1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                    />
                    <span className="absolute right-2 top-1.5 text-zinc-500 text-xs">
                      ″
                    </span>
                  </div>
                </div>
              </div>

              {/* Stats Output */}
              <div className="w-1/2 flex flex-col justify-center text-xs text-zinc-400 space-y-1 pl-4 border-l border-zinc-800">
                <div>
                  Yield:{" "}
                  <span className="text-zinc-200 font-semibold">
                    {impositionStats.yield} up
                  </span>{" "}
                  ({impositionStats.layout})
                </div>
                <div>
                  Net Sheets: <span className="text-zinc-200">{impositionStats.sheetsNet}</span>
                </div>
                <div>
                  Order Sheets:{" "}
                  <span className="text-[#FDD704] font-bold">{impositionStats.sheetsGross}</span>{" "}
                  <span className="text-[10px] text-zinc-500">(w/waste)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Total quantity: <span className="font-semibold">{totalQty || 0}</span>
              </span>
              <span>Sides: {sidesSummary}</span>
            </div>
            {!meetsMinQty && (
              <p className="mt-1 text-[11px] text-amber-400">
                Minimum order is {MIN_QTY} cards. Add more quantity to see pricing.
              </p>
            )}
          </div>
        </section>

        {/* Right: Pricing */}
        <section className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold">Pricing</h2>
            {canPrice && price ? (
              <>
                <div className="mt-2 text-xs text-zinc-400 space-y-1">
                  <div>Base single-sided: ${price.baseSinglePrice.toFixed(2)}</div>
                  <div>Sides surcharge: ${price.sidesSurcharge.toFixed(2)}</div>
                  {price.stockSurcharge > 0 && (
                    <div className="text-amber-300">
                      Paper surcharge: ${price.stockSurcharge.toFixed(2)}
                    </div>
                  )}
                  {price.finishSurcharge > 0 && (
                    <div className="text-[#FDD704]">
                      Finish surcharge: ${price.finishSurcharge.toFixed(2)}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-2xl font-bold">${price.total.toFixed(2)}</div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  Effective rung: {price.ladderQty} cards · Per-card: ${price.unitPrice.toFixed(4)}
                  {price.minApplied && <> · 100-card minimum applied</>}
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-xs text-zinc-400">
                  Pricing appears once you have at least 1 version with enough quantity.
                </p>
                {!canPrice && (
                  <p className="mt-2 text-xs text-amber-400">
                    Add at least 1 version to see sales price.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
      </div>

      {/* Versions Editor */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Customize versions</h2>
          <div className="text-xs text-zinc-400">
            {versionCount} version{versionCount === 1 ? "" : "s"}
          </div>
        </div>

        {versionCount === 0 && (
          <p className="text-xs text-zinc-400">
            Set the number of versions above to begin entering card details.
          </p>
        )}

        {versions.map((v, idx) => (
          <div
            key={idx}
            className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
          >
            {/* Version Header + Action Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Version {idx + 1}</div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`sides-${idx}`}
                      checked={v.sides === "single"}
                      onChange={() => updateVersion(idx, { sides: "single" })}
                      className="accent-[#FDD704]"
                    />
                    <span>Single-sided (4/0)</span>
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name={`sides-${idx}`}
                      checked={v.sides === "double"}
                      onChange={() => updateVersion(idx, { sides: "double" })}
                      className="accent-[#FDD704]"
                    />
                    <span>Double-sided (4/4)</span>
                  </label>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCopyVersion(idx)}
                    title="Duplicate this version"
                    className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-[#FDD704] border border-zinc-700"
                  >
                    <CopyIcon className="w-3 h-3" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteVersion(idx)}
                    title="Delete this version"
                    className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-red-500 border border-zinc-700 hover:border-red-500"
                  >
                    <DeleteIcon className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={v.name}
                onChange={(e) => updateVersion(idx, { name: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
              />

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-medium text-zinc-300">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={MAX_QTY}
                    step={QTY_STEP}
                    value={v.quantity}
                    onChange={(e) => {
                      let n = Number(e.target.value);
                      if (n < 0) n = 0;
                      if (n > MAX_QTY) n = MAX_QTY;
                      updateVersion(idx, { quantity: n });
                    }}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
                  />
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-[11px] font-medium text-zinc-300">
                    Finish
                  </label>
                  <select
                    value={v.finish || "none"}
                    onChange={(e) => updateVersion(idx, { finish: e.target.value })}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm"
                  >
                    <option value="none">None</option>
                    <option value="round_corners">Round Corners (+$5)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-300">Notes</label>
              <textarea
                rows={2}
                placeholder="Extra notes, title lines, etc."
                value={v.other}
                onChange={(e) => updateVersion(idx, { other: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Bottom actions */}
      <div className="flex items-center justify-between pt-4">
        <CancelOrderButton />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="rounded border border-zinc-700 px-4 py-2 text-sm hover:border-[#FDD704]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canNext}
            className={`rounded border px-6 py-2 text-sm font-semibold ${
              canNext
                ? "border-[#FDD704] bg-[#FDD704] text-black hover:bg-[#e5c204]"
                : "cursor-not-allowed border-zinc-700 text-zinc-500 opacity-60"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
