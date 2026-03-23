// src/components/CustomerManager.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  fetchCustomers,
  upsertCustomer,
  bulkUpsertCustomers,
  searchJobs,
} from "../utils/api";
import { useWizard, STEP_CUSTOMIZE, STEP_CONFIRM } from "../context/WizardContext";
import JobDetailModal from "./JobDetailModal";
import { mapSavedJobToWizardState } from "../utils/hydration";

// --- Sub-component: Edit Form ---

function CustomerForm({ initialData, onSave, onCancel, busy }) {
  const [formData, setFormData] = useState(() => ({
    custId: "",
    custName: "",
    custContact: "",
    custEmail: "",
    custPhone: "",

    shipLine1: "",
    shipLine2: "",
    shipCity: "",
    shipState: "",
    shipZip: "",

    billLine1: "",
    billLine2: "",
    billCity: "",
    billState: "",
    billZip: "",

    ...initialData,
  }));

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const isNew = !initialData.custId;

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-1">
        <div className="space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#FDD704] uppercase tracking-wider">
              General Information
            </h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Customer ID
                </label>
                <input
                  value={formData.custId}
                  onChange={(e) => handleChange("custId", e.target.value)}
                  placeholder="Auto"
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-[#FDD704] focus:outline-none placeholder:text-zinc-600"
                />
              </div>
              <div className="col-span-3">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Company / Customer Name *
                </label>
                <input
                  required
                  value={formData.custName}
                  onChange={(e) => handleChange("custName", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-[#FDD704] focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Contact Person
                </label>
                <input
                  value={formData.custContact}
                  onChange={(e) => handleChange("custContact", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Phone
                </label>
                <input
                  value={formData.custPhone}
                  onChange={(e) => handleChange("custPhone", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-full">
                <label className="mb-1 block text-xs font-medium text-zinc-400">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.custEmail}
                  onChange={(e) => handleChange("custEmail", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800" />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[#FDD704] uppercase tracking-wider">
              Default Shipping
            </h3>
            <div className="space-y-2">
              <input
                placeholder="Address Line 1"
                value={formData.shipLine1}
                onChange={(e) => handleChange("shipLine1", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                placeholder="Address Line 2"
                value={formData.shipLine2}
                onChange={(e) => handleChange("shipLine2", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="City"
                  value={formData.shipCity}
                  onChange={(e) => handleChange("shipCity", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
                <input
                  placeholder="State"
                  value={formData.shipState}
                  onChange={(e) => handleChange("shipState", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Zip"
                  value={formData.shipZip}
                  onChange={(e) => handleChange("shipZip", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#FDD704] uppercase tracking-wider">
                Default Billing
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    billLine1: prev.shipLine1,
                    billLine2: prev.shipLine2,
                    billCity: prev.shipCity,
                    billState: prev.shipState,
                    billZip: prev.shipZip,
                  }));
                }}
                className="text-[10px] text-zinc-400 underline hover:text-zinc-200"
              >
                Copy from Shipping
              </button>
            </div>
            <div className="space-y-2">
              <input
                placeholder="Address Line 1"
                value={formData.billLine1}
                onChange={(e) => handleChange("billLine1", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <input
                placeholder="Address Line 2"
                value={formData.billLine2}
                onChange={(e) => handleChange("billLine2", e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  placeholder="City"
                  value={formData.billCity}
                  onChange={(e) => handleChange("billCity", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
                <input
                  placeholder="State"
                  value={formData.billState}
                  onChange={(e) => handleChange("billState", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
                <input
                  placeholder="Zip"
                  value={formData.billZip}
                  onChange={(e) => handleChange("billZip", e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-zinc-800 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !formData.custName}
          className={`rounded border px-6 py-2 text-sm font-semibold ${
            busy || !formData.custName
              ? "cursor-not-allowed border-zinc-700 text-zinc-500"
              : "border-[#FDD704] bg-[#FDD704] text-black hover:bg-[#e5c204]"
          }`}
        >
          {busy ? "Saving..." : isNew ? "Create Customer" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

// --- Main Component ---

function safeDateValue(d) {
  const dt = new Date(d || 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeTicket(job) {
  return job?.ticketNo || job?.jobId || "";
}

function isDeletedJob(job) {
  const v = job?.isDeleted;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "y";
  }
  return false;
}

export default function CustomerManager({ onClose }) {
  const { dispatch } = useWizard();
  const fileInputRef = useRef(null);

  // View State: 'list' | 'edit' | 'history'
  const [view, setView] = useState("list");

  // Data
  const [customers, setCustomers] = useState([]);
  const [customerJobs, setCustomerJobs] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [query, setQuery] = useState("");

  // History filtering (deleted)
  const [showDeletedJobs, setShowDeletedJobs] = useState(false);

  // Job modal state
  const [selectedJob, setSelectedJob] = useState(null);
  const [refreshHistoryOnClose, setRefreshHistoryOnClose] = useState(false);

  // Edit State
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  // Load Customers on Mount
  useEffect(() => {
    loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadCustomers() {
    setLoading(true);
    try {
      const list = await fetchCustomers();
      if (Array.isArray(list)) {
        setCustomers(
          list.sort((a, b) => {
            const aId = Number(a.custId) || 0;
            const bId = Number(b.custId) || 0;
            return bId - aId;
          })
        );
      } else {
        setCustomers([]);
      }
    } catch (err) {
      console.error("Failed to load customers", err);
    } finally {
      setLoading(false);
    }
  }

  // Load Job History when viewing history
  useEffect(() => {
    if (view === "history" && selectedClient) {
      loadCustomerHistory(selectedClient.custName, { includeDeleted: showDeletedJobs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedClient, showDeletedJobs]);

  async function loadCustomerHistory(clientName, opts = {}) {
    setJobsLoading(true);
    try {
      const jobs = await searchJobs(clientName, {
        includeDeleted: !!opts.includeDeleted,
      });
      const arr = Array.isArray(jobs) ? jobs : [];
      arr.sort((a, b) => safeDateValue(b.orderDate) - safeDateValue(a.orderDate));
      setCustomerJobs(arr);
    } catch (err) {
      console.error("Failed to load history", err);
      setCustomerJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }

  const displayedCustomerJobs = useMemo(() => {
    if (showDeletedJobs) return customerJobs;
    return customerJobs.filter((j) => !isDeletedJob(j));
  }, [customerJobs, showDeletedJobs]);

  // Filtering customers list
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        (c.custName && c.custName.toLowerCase().includes(q)) ||
        (c.custId && String(c.custId).includes(q))
    );
  }, [customers, query]);

  // --- Handlers ---

  function handleAddNew() {
    setEditingCustomer(null);
    setView("edit");
  }

  function handleEdit(customer) {
    setEditingCustomer(customer);
    setView("edit");
  }

  function handleViewHistory(customer) {
    setSelectedClient(customer);
    setShowDeletedJobs(false);
    setCustomerJobs([]);
    setSelectedJob(null);
    setRefreshHistoryOnClose(false);
    setView("history");
  }

  function handleCreateJob(customer) {
    dispatch({ type: "UPDATE_DRAFT", payload: { customer } });
    dispatch({
      type: "MARK_STEP_COMPLETE",
      payload: { label: "Product", nextStep: STEP_CUSTOMIZE },
    });
    onClose();
  }

  function handleOpenJob(job) {
    if (!job) return;
    setSelectedJob(job);
    setRefreshHistoryOnClose(false);
  }

  function handleEditJobFromHistory(job) {
    const payload = mapSavedJobToWizardState(job);
    if (!payload) return;

    dispatch({ type: "LOAD_EXISTING_ORDER", payload });
    dispatch({ type: "SET_STEP", payload: STEP_CONFIRM });

    onClose();
  }

  async function handleSave(data) {
    setSaving(true);
    try {
      await upsertCustomer(data);
      await loadCustomers();
      setView("list");
    } catch (err) {
      console.error("Failed to save customer", err);
      alert("Error saving customer. Check console.");
    } finally {
      setSaving(false);
    }
  }

  // CSV
  function handleBulkUploadClick() {
    if (fileInputRef.current) {
      fileInputRef.current.value = null;
      fileInputRef.current.click();
    }
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      const text = evt.target.result;
      try {
        const rows = parseCSV(String(text || ""));
        if (rows.length === 0) {
          alert("No valid rows found.");
          setLoading(false);
          return;
        }
        const result = await bulkUpsertCustomers(rows);
        alert(
          `Upload Complete!\nUpdates: ${result.updates || 0}\nNew: ${result.creates || 0}`
        );
        await loadCustomers();
      } catch (err) {
        console.error("CSV Upload Failed:", err);
        alert("Upload failed.");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsText(file);
  }

  function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length < 2) return [];

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());

    const map = {
      "customer id": "custId",
      company: "custName",
      street: "shipLine1",
      city: "shipCity",
      state: "shipState",
      "postal code": "shipZip",
    };

    const list = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      const obj = {};
      let hasData = false;

      headers.forEach((header, idx) => {
        const key = map[header];
        if (key && values[idx]) {
          obj[key] = values[idx];
          hasData = true;
        }
      });

      if (hasData) {
        if (obj.shipLine1 && !obj.custAddress) obj.custAddress = obj.shipLine1;
        list.push(obj);
      }
    }

    return list;
  }

  // --- Render ---

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-xl font-bold text-white">
            {view === "list"
              ? "Manage Customers"
              : view === "history"
              ? `Job History: ${selectedClient?.custName}`
              : editingCustomer
              ? "Edit Customer"
              : "New Customer"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6">
          {/* VIEW: LIST */}
          {view === "list" && (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex gap-4">
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search customers..."
                  className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm focus:border-[#FDD704] focus:outline-none"
                />
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={handleBulkUploadClick}
                  disabled={loading}
                  className="rounded border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800"
                >
                  Bulk Upload CSV
                </button>
                <button
                  onClick={handleAddNew}
                  className="rounded bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
                >
                  + Add Customer
                </button>
              </div>

              <div className="flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/30">
                {loading ? (
                  <div className="p-8 text-center text-zinc-500">Processing...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">No customers found.</div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-800/50 text-zinc-400">
                      <tr>
                        <th className="px-4 py-2 font-medium">Name</th>
                        <th className="px-4 py-2 font-medium">Contact</th>
                        <th className="px-4 py-2 font-medium">Email</th>
                        <th className="px-4 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {filtered.map((c) => (
                        <tr
                          key={c.custId || `${c.custName || "cust"}-${Math.random()}`}
                          className="group hover:bg-zinc-800/30"
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-200">{c.custName}</div>
                            <div className="text-xs text-zinc-500">ID: {c.custId}</div>
                          </td>
                          <td className="px-4 py-3 text-zinc-400">{c.custContact || "—"}</td>
                          <td className="px-4 py-3 text-zinc-400">{c.custEmail || "—"}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                              <button
                                onClick={() => handleViewHistory(c)}
                                className="rounded border border-zinc-700 px-3 py-1 text-xs hover:border-[#FDD704] hover:text-white"
                              >
                                History
                              </button>
                              <button
                                onClick={() => handleEdit(c)}
                                className="rounded border border-zinc-700 px-3 py-1 text-xs hover:border-[#FDD704] hover:text-white"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleCreateJob(c)}
                                className="rounded bg-[#FDD704] px-3 py-1 text-xs font-medium text-black hover:bg-[#e5c204]"
                              >
                                New Job
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* VIEW: HISTORY */}
          {view === "history" && (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-center justify-between gap-3">
                <button
                  onClick={() => setView("list")}
                  className="flex items-center text-sm text-zinc-400 hover:text-[#FDD704]"
                >
                  ← Back to Customers
                </button>

                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={showDeletedJobs}
                    onChange={(e) => setShowDeletedJobs(e.target.checked)}
                    className="h-4 w-4 rounded border border-zinc-700 bg-zinc-900"
                  />
                  Show deleted
                </label>
              </div>

              <div className="flex-1 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/30">
                {jobsLoading ? (
                  <div className="p-8 text-center text-zinc-500">Loading history...</div>
                ) : displayedCustomerJobs.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500">
                    No job history found for this client.
                  </div>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-zinc-800/50 text-zinc-400">
                      <tr>
                        <th className="px-4 py-2 font-medium">Ticket</th>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Product</th>
                        <th className="px-4 py-2 text-right font-medium">Total</th>
                        <th className="px-4 py-2 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {displayedCustomerJobs.map((job) => {
                        const ticket = normalizeTicket(job);
                        const deleted = isDeletedJob(job);

                        return (
                          <tr
                            key={ticket || `${job.orderDate || "job"}-${Math.random()}`}
                            className={`hover:bg-zinc-800/30 ${
                              deleted ? "opacity-70" : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-zinc-200">
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{ticket || "—"}</span>
                                {deleted && (
                                  <span className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-300">
                                    Deleted
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              {job.orderDate
                                ? new Date(job.orderDate).toLocaleDateString()
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {job.productType || job.productName || "Business Cards"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-zinc-300">
                              ${Number(job.grandTotal || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => handleOpenJob(job)}
                                  className="rounded border border-zinc-700 px-3 py-1 text-xs hover:border-[#FDD704] hover:text-white"
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditJobFromHistory(job)}
                                  className={`rounded border px-3 py-1 text-xs ${
                                    deleted
                                      ? "cursor-not-allowed border-zinc-800 text-zinc-500 opacity-60"
                                      : "border-zinc-700 hover:border-[#FDD704] hover:text-white"
                                  }`}
                                  disabled={deleted}
                                  title={
                                    deleted
                                      ? "Deleted jobs cannot be updated. Restore is not supported."
                                      : "Load this job into the wizard for editing."
                                  }
                                >
                                  Edit
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* VIEW: EDIT */}
          {view === "edit" && (
            <CustomerForm
              initialData={editingCustomer || {}}
              onSave={handleSave}
              onCancel={() => setView("list")}
              busy={saving}
            />
          )}
        </div>

        {/* Job detail modal */}
        {selectedJob && (
          <JobDetailModal
            job={selectedJob}
            onEdit={handleEditJobFromHistory}
            onClose={() => {
              setSelectedJob(null);

              if (refreshHistoryOnClose && selectedClient) {
                loadCustomerHistory(selectedClient.custName, {
                  includeDeleted: showDeletedJobs,
                });
              }
              setRefreshHistoryOnClose(false);
            }}
            onDeleted={(updatedJob) => {
              // Keep the table in-sync immediately.
              setCustomerJobs((prev) => {
                const t = normalizeTicket(updatedJob);
                if (!t) return prev;
                return prev.map((j) => {
                  const jt = normalizeTicket(j);
                  return jt === t ? { ...j, ...updatedJob, isDeleted: true } : j;
                });
              });
              setRefreshHistoryOnClose(true);
            }}
          />
        )}
      </div>
    </div>
  );
}