// src/screens/InvoiceManager.jsx
import React, { useState, useEffect, useMemo } from "react";
import { fetchInvoices, searchJobs } from "../utils/api"; 
import { openInvoiceTicketWindow, openBulkInvoiceTicketWindow, mapSavedJobToTicketData } from "../utils/tickets"; 
import JobDetailModal from "../components/JobDetailModal"; 
import InvoicedToggle from "../components/InvoicedToggle"; // NEW: Toggle Component

// --- Icons ---

function PrinterIcon({ className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
  );
}

// --- Helpers ---

const formatMoney = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n || 0);

const formatDate = (isoStr) => {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleDateString();
};

// Default Date Range: Jan 1 of current year to Today
function getDefaultRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: now.toISOString().slice(0, 10),
  };
}

export default function InvoiceManager({ onClose }) {
  // --- State: Data Loading ---
  const [range, setRange] = useState(getDefaultRange);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // --- State: Job Details / Modal ---
  const [selectedJob, setSelectedJob] = useState(null);
  const [fetchingId, setFetchingId] = useState(null); // Track which ticket is loading
  const [selectedTickets, setSelectedTickets] = useState(() => new Set());
  const [bulkDownloading, setBulkDownloading] = useState(false);

  // --- State: Filtering & Sorting ---
  const [searchQuery, setSearchQuery] = useState("");
  const [amountFilter, setAmountFilter] = useState({ min: "", max: "" });
  const [sortConfig, setSortConfig] = useState({ key: "date", dir: "desc" });

  // --- 1. Fetch Invoices List ---
  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const data = await fetchInvoices(range.start, range.end);
        if (mounted) setInvoices(data);
      } catch (err) {
        console.error("Load failed", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [range.start, range.end]);

  // --- 2. Job Detail Fetching ---
  
  // Helper to get full job data (needed for tickets/modal) based on ticket ID
  const fetchFullJob = async (ticketNo) => {
    setFetchingId(ticketNo);
    try {
      const results = await searchJobs(ticketNo);
      // Find exact match
      const job = Array.isArray(results) 
        ? results.find(j => j.ticketNo === ticketNo || j.jobId === ticketNo) 
        : null;
        
      if (!job) throw new Error("Job not found");
      return job;
    } catch (err) {
      console.error("Failed to fetch details", err);
      alert(`Could not load details for ${ticketNo}`);
      return null;
    } finally {
      setFetchingId(null);
    }
  };

  const handleTicketClick = async (ticketNo) => {
    const job = await fetchFullJob(ticketNo);
    if (job) setSelectedJob(job);
  };

  const handleQuickPrintInvoice = async (ticketNo, e) => {
    e.stopPropagation(); // Prevent opening modal
    const job = await fetchFullJob(ticketNo);
    if (job) {
      const ticketData = mapSavedJobToTicketData(job);
      openInvoiceTicketWindow(ticketData);
    }
  };

  const toggleTicketSelection = (ticketNo) => {
    if (!ticketNo) return;
    setSelectedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticketNo)) next.delete(ticketNo);
      else next.add(ticketNo);
      return next;
    });
  };

  const clearSelection = () => setSelectedTickets(new Set());

  const handleBulkInvoiceDownload = async () => {
    const selected = [...selectedTickets];
    if (selected.length === 0 || bulkDownloading) return;

    setBulkDownloading(true);
    try {
      const fullJobs = (await Promise.all(selected.map((ticketNo) => fetchFullJob(ticketNo))))
        .filter(Boolean);

      const invoiceJobs = fullJobs.map((job) => mapSavedJobToTicketData(job)).filter(Boolean);
      if (invoiceJobs.length === 0) {
        alert("Unable to prepare invoice data for selected jobs.");
        return;
      }

      const filename =
        invoiceJobs.length === 1
          ? `InvoiceTicket_${invoiceJobs[0]?.jobId || "job"}.pdf`
          : `InvoiceTickets_${invoiceJobs.length}_jobs.pdf`;

      openBulkInvoiceTicketWindow(invoiceJobs, filename);
    } finally {
      setBulkDownloading(false);
    }
  };

  // --- 3. Filter Logic (Memoized) ---
  const filteredData = useMemo(() => {
    let data = invoices;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (inv) => {
          const customer = (inv.customer ?? "").toString().toLowerCase();
          const ticketNo = (inv.ticketNo ?? "").toString().toLowerCase();
          return customer.includes(q) || ticketNo.includes(q);
        }
      );
    }

    const min = parseFloat(amountFilter.min);
    const max = parseFloat(amountFilter.max);
    if (!isNaN(min)) {
      data = data.filter((inv) => {
        const total = Number(inv.total ?? 0);
        return total >= min;
      });
    }
    if (!isNaN(max)) {
      data = data.filter((inv) => {
        const total = Number(inv.total ?? 0);
        return total <= max;
      });
    }

    return data;
  }, [invoices, searchQuery, amountFilter]);

  // --- 4. Sort Logic (Memoized) ---
  const sortedData = useMemo(() => {
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];

      if (sortConfig.key === "date") {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (typeof valA === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortConfig.dir === "asc" ? -1 : 1;
      if (valA > valB) return sortConfig.dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  useEffect(() => {
    setSelectedTickets((prev) => {
      const valid = new Set(sortedData.map((inv) => String(inv.ticketNo)).filter(Boolean));
      const next = new Set([...prev].filter((ticket) => valid.has(ticket)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [sortedData]);

  // --- 5. Summary Metrics ---
  const summary = useMemo(() => {
    return filteredData.reduce(
      (acc, row) => {
        acc.subtotal += row.subtotal || 0;
        acc.tax += row.tax || 0;
        acc.shipping += row.shipping || 0;
        acc.total += row.total || 0;
        acc.count += 1;
        return acc;
      },
      { subtotal: 0, tax: 0, shipping: 0, total: 0, count: 0 }
    );
  }, [filteredData]);

  // --- Handlers ---

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      dir: prev.key === key && prev.dir === "desc" ? "asc" : "desc",
    }));
  };

  const handleExport = () => {
    if (filteredData.length === 0) return alert("No data to export.");

    const groups = {};
    filteredData.forEach((inv) => {
      const d = new Date(inv.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      
      if (!groups[key]) {
        groups[key] = { month: key, subtotal: 0, tax: 0, total: 0, count: 0 };
      }
      groups[key].subtotal += inv.subtotal;
      groups[key].tax += inv.tax;
      groups[key].total += inv.total;
      groups[key].count += 1;
    });

    const reportRows = Object.values(groups).sort((a, b) => 
      b.month.localeCompare(a.month)
    );

    const header = ["Month", "Orders", "Subtotal", "Tax", "Total Revenue"];
    const csvRows = [header.join(",")];

    reportRows.forEach((row) => {
      const line = [
        row.month,
        row.count,
        row.subtotal.toFixed(2),
        row.tax.toFixed(2),
        row.total.toFixed(2),
      ];
      csvRows.push(line.join(","));
    });

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Revenue_Report_${range.start}_to_${range.end}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Render ---

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-white">Billing & Invoices</h2>
            <p className="text-xs text-zinc-400">
              Manage invoice data and export financial reports
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          
          {/* Sidebar / Controls */}
          <aside className="w-full border-b border-zinc-800 bg-zinc-950/50 p-6 lg:w-72 lg:border-b-0 lg:border-r overflow-y-auto">
            <div className="space-y-6">
              
              {/* Date Range */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Date Range
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] text-zinc-400">From</label>
                    <input
                      type="date"
                      value={range.start}
                      onChange={(e) =>
                        setRange((p) => ({ ...p, start: e.target.value }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:border-[#FDD704] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] text-zinc-400">To</label>
                    <input
                      type="date"
                      value={range.end}
                      onChange={(e) =>
                        setRange((p) => ({ ...p, end: e.target.value }))
                      }
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:border-[#FDD704] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800" />

              {/* Filters */}
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Filter Rows
                </label>
                
                <input
                  type="text"
                  placeholder="Search customer or ticket..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#FDD704] focus:outline-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    placeholder="Min $"
                    value={amountFilter.min}
                    onChange={(e) =>
                      setAmountFilter((p) => ({ ...p, min: e.target.value }))
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#FDD704] focus:outline-none"
                  />
                  <input
                    type="number"
                    placeholder="Max $"
                    value={amountFilter.max}
                    onChange={(e) =>
                      setAmountFilter((p) => ({ ...p, max: e.target.value }))
                    }
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-[#FDD704] focus:outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-800" />

              {/* Actions */}
              <div className="space-y-3">
                <button
                  onClick={handleBulkInvoiceDownload}
                  disabled={loading || selectedTickets.size === 0 || bulkDownloading}
                  className="w-full rounded bg-[#FDD704] py-2 text-sm font-bold text-black hover:bg-[#e5c204] disabled:opacity-50"
                >
                  {bulkDownloading
                    ? "Preparing PDF..."
                    : `Download ${selectedTickets.size > 0 ? `${selectedTickets.size} ` : ""}Invoice${selectedTickets.size === 1 ? "" : "s"} (PDF)`}
                </button>

                <button
                  onClick={clearSelection}
                  disabled={selectedTickets.size === 0 || bulkDownloading}
                  className="w-full rounded border border-zinc-700 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Clear Selected Jobs
                </button>

                <button
                  onClick={handleExport}
                  disabled={loading || sortedData.length === 0}
                  className="w-full rounded bg-zinc-100 py-2 text-sm font-bold text-black hover:bg-white disabled:opacity-50"
                >
                  Export Monthly Report (CSV)
                </button>
                <p className="mt-2 text-center text-[10px] text-zinc-500">
                  Aggregates totals by month based on current filters.
                </p>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex flex-1 flex-col overflow-hidden bg-zinc-900">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 border-b border-zinc-800 bg-zinc-950 p-6 sm:grid-cols-4 shrink-0">
              <div>
                <div className="text-xs text-zinc-500">Orders Found</div>
                <div className="text-2xl font-bold text-white">{summary.count}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total Revenue</div>
                <div className="text-2xl font-bold text-[#FDD704]">
                  {formatMoney(summary.total)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total Tax</div>
                <div className="text-2xl font-bold text-zinc-300">
                  {formatMoney(summary.tax)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total Subtotal</div>
                <div className="text-2xl font-bold text-zinc-300">
                  {formatMoney(summary.subtotal)}
                </div>
              </div>
            </div>

            {/* Data Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm text-zinc-300">
                <thead className="sticky top-0 bg-zinc-800 text-xs font-semibold uppercase text-zinc-400 z-10">
                  <tr>
                    {/* NEW: Invoice Toggle Column */}
                    <th className="px-4 py-3 font-medium bg-zinc-900 w-10 text-center">Sel.</th>
                    <th className="px-4 py-3 font-medium bg-zinc-900 w-10 text-center">Inv.</th>
                    
                    <SortHeader label="Date" colKey="date" currentSort={sortConfig} onSort={handleSort} />
                    <SortHeader label="Ticket" colKey="ticketNo" currentSort={sortConfig} onSort={handleSort} />
                    <SortHeader label="Customer" colKey="customer" currentSort={sortConfig} onSort={handleSort} />
                    <SortHeader label="Subtotal" colKey="subtotal" align="right" currentSort={sortConfig} onSort={handleSort} />
                    <SortHeader label="Tax" colKey="tax" align="right" currentSort={sortConfig} onSort={handleSort} />
                    <SortHeader label="Total" colKey="total" align="right" currentSort={sortConfig} onSort={handleSort} />
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-zinc-500">
                        Loading data...
                      </td>
                    </tr>
                  ) : sortedData.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-12 text-center text-zinc-500">
                        No invoices found for this range.
                      </td>
                    </tr>
                  ) : (
                    sortedData.map((inv, index) => {
                      const rowKey =
                        [inv.ticketNo, inv.date, inv.customer].filter(Boolean).join("-") ||
                        `invoice-row-${index}`;

                      return (
                        <tr key={rowKey} className={`hover:bg-zinc-800/50 group ${selectedTickets.has(String(inv.ticketNo)) ? "bg-zinc-800/60" : ""}`}>
                        
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedTickets.has(String(inv.ticketNo))}
                            onChange={() => toggleTicketSelection(String(inv.ticketNo))}
                            className="h-4 w-4 rounded border border-zinc-700 bg-zinc-900"
                            aria-label={`Select ${inv.ticketNo || "job"}`}
                          />
                        </td>

                        {/* NEW: Invoiced Toggle Cell */}
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                           <InvoicedToggle 
                             ticketNo={inv.ticketNo} 
                             initialStatus={!!inv.isInvoiced}
                             size="sm"
                             ticketsToToggle={
                               selectedTickets.size > 1 && selectedTickets.has(String(inv.ticketNo))
                                 ? [...selectedTickets]
                                 : [String(inv.ticketNo)]
                             }
                             onStatusApplied={(tickets, status) => {
                               const updated = new Set(tickets.map((t) => String(t)));
                               setInvoices((prev) =>
                                 prev.map((row) =>
                                   updated.has(String(row.ticketNo))
                                     ? { ...row, isInvoiced: status }
                                     : row
                                 )
                               );
                             }}
                           />
                        </td>

                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                          {formatDate(inv.date)}
                        </td>
                        
                        {/* Interactive Ticket Column */}
                        <td className="px-4 py-3">
                           <button
                             onClick={() => handleTicketClick(inv.ticketNo)}
                             disabled={fetchingId === inv.ticketNo}
                             className={`font-mono text-xs font-semibold px-2 py-1 rounded bg-zinc-800/50 hover:bg-[#FDD704] hover:text-black transition-colors ${
                               fetchingId === inv.ticketNo ? "opacity-50 cursor-wait" : ""
                             }`}
                           >
                              {fetchingId === inv.ticketNo ? "..." : inv.ticketNo}
                           </button>
                        </td>

                        <td className="px-4 py-3 font-medium text-white">
                          {inv.customer}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                          {formatMoney(inv.subtotal)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-400">
                          {formatMoney(inv.tax)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-[#FDD704]">
                          {formatMoney(inv.total)}
                        </td>

                        {/* Actions Column */}
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => handleQuickPrintInvoice(inv.ticketNo, e)}
                            disabled={fetchingId === inv.ticketNo}
                            title="Print Invoice"
                            className="p-1.5 rounded text-zinc-500 hover:bg-zinc-700 hover:text-white transition-colors"
                          >
                            <PrinterIcon className="w-4 h-4" />
                          </button>
                        </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>

      {/* Shared Job Detail Modal */}
      {selectedJob && (
        <JobDetailModal 
          job={selectedJob} 
          onClose={() => setSelectedJob(null)} 
          // We don't pass onEdit here if you want to keep Billing read-only, 
          // or you can pass it if you want editable access.
        />
      )}
    </div>
  );
}

// --- Sortable Header Helper ---
function SortHeader({ label, colKey, align = "left", currentSort, onSort }) {
  const isActive = currentSort.key === colKey;
  
  return (
    <th
      scope="col"
      className={`px-4 py-3 cursor-pointer select-none hover:bg-zinc-700 hover:text-white transition-colors ${
        align === "right" ? "text-right" : "text-left"
      }`}
      onClick={() => onSort(colKey)}
      aria-sort={isActive ? (currentSort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
        {label}
        {isActive && (
          <span className="text-[10px] text-[#FDD704]">
            {currentSort.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
      </div>
    </th>
  );
}
