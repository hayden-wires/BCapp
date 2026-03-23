// src/components/OrderHistory.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fetchJobs, searchJobs } from "../utils/api";
import { useWizard, STEP_CONFIRM } from "../context/WizardContext";
import JobDetailModal from "./JobDetailModal";
import InvoicedToggle from "./InvoicedToggle";
import { mapSavedJobToWizardState } from "../utils/hydration";
import { mapSavedJobToTicketData, openBulkInvoiceTicketWindow } from "../utils/tickets";

function XIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

function SearchIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function normalizeTicket(job) {
  return job?.ticketNo || job?.jobId || "";
}

function safeDateValue(d) {
  const dt = new Date(d || 0);
  const ms = dt.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isJobDeleted(job) {
  return !!(job?.isDeleted || job?.deletedAt || job?.status === "deleted");
}

export default function OrderHistory({ isWidget = false, onClose, widgetLimit = 3 }) {
  const { dispatch } = useWizard();

  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [selectedJob, setSelectedJob] = useState(null);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState(() => new Set());

  const jobsByTicket = useMemo(() => {
    const map = new Map();
    for (const j of allJobs) {
      const t = normalizeTicket(j);
      if (t) map.set(String(t), j);
    }
    return map;
  }, [allJobs]);

  const lastQueryRef = useRef("");
  const prevQueryRef = useRef("");
  const searchSeqRef = useRef(0);
  const jobsByTicketRef = useRef(new Map());

  useEffect(() => {
    const map = new Map();
    for (const j of allJobs) {
      const t = normalizeTicket(j);
      if (t) map.set(String(t), j);
    }
    jobsByTicketRef.current = map;
  }, [allJobs]);

  const refreshList = async ({ includeDeleted } = {}) => {
    setLoading(true);
    try {
      const data = await fetchJobs({ includeDeleted: !!includeDeleted });
      const arr = Array.isArray(data) ? data : [];
      arr.sort((a, b) => safeDateValue(b.orderDate) - safeDateValue(a.orderDate));
      setAllJobs(arr);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      try {
        const data = await fetchJobs({ includeDeleted: showDeleted });
        if (!mounted) return;

        const arr = Array.isArray(data) ? data : [];
        arr.sort((a, b) => safeDateValue(b.orderDate) - safeDateValue(a.orderDate));
        setAllJobs(arr);
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If user toggles showDeleted, refresh list with includeDeleted.
  useEffect(() => {
    if (isWidget) return;
    refreshList({ includeDeleted: showDeleted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleted]);

  // Search:
  // - Debounce network calls
  // - If exact ticket exists locally, show it immediately
  // - Respect showDeleted via includeDeleted flag
  useEffect(() => {
    const q = searchTerm.trim();
    const prevQ = prevQueryRef.current;

    lastQueryRef.current = q;
    prevQueryRef.current = q;

    if (!q) {
      setIsSearching(false);

      // Only refresh once when transitioning from a non-empty query to empty.
      if (prevQ) {
        refreshList({ includeDeleted: showDeleted });
      }
      return;
    }

    const localHit = jobsByTicketRef.current.get(q);
    if (localHit) {
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      const seq = ++searchSeqRef.current;
      setIsSearching(true);

      try {
        const results = await searchJobs(q, { includeDeleted: showDeleted });
        if (seq !== searchSeqRef.current) return;
        if (lastQueryRef.current !== q) return;

        const arr = Array.isArray(results) ? results : [];
        arr.sort((a, b) => safeDateValue(b.orderDate) - safeDateValue(a.orderDate));
        setAllJobs(arr);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        if (seq === searchSeqRef.current) setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, showDeleted]);


  const toggleSelection = (ticketNo) => {
    if (!ticketNo) return;
    setSelectedTickets((prev) => {
      const next = new Set(prev);
      if (next.has(ticketNo)) next.delete(ticketNo);
      else next.add(ticketNo);
      return next;
    });
  };

  const clearSelection = () => setSelectedTickets(new Set());

  const handleBulkInvoiceDownload = () => {
    const selectedJobs = displayedJobs.filter((job) => selectedTickets.has(String(normalizeTicket(job))));
    if (selectedJobs.length === 0) return;

    const invoiceJobs = selectedJobs
      .map((job) => mapSavedJobToTicketData(job))
      .filter(Boolean);

    if (!invoiceJobs.length) {
      alert("Unable to prepare invoice data for selected jobs.");
      return;
    }

    const baseName = invoiceJobs[0]?.jobId || "jobs";
    const filename =
      invoiceJobs.length === 1
        ? `InvoiceTicket_${baseName}.pdf`
        : `InvoiceTickets_${invoiceJobs.length}_jobs.pdf`;

    openBulkInvoiceTicketWindow(invoiceJobs, filename);
  };

  const displayedJobs = useMemo(() => {
    const base = isWidget ? allJobs.slice(0, widgetLimit) : allJobs;

    // Always exclude deleted unless Show Deleted is enabled
    const filtered = showDeleted ? base : base.filter((j) => !isJobDeleted(j));

    const q = searchTerm.trim();
    if (isWidget && !q) return filtered;
    if (!q) return filtered;

    const hit = jobsByTicket.get(q);
    if (hit) {
      if (!showDeleted && isJobDeleted(hit)) return [];
      return [hit];
    }

    return filtered;
  }, [allJobs, isWidget, searchTerm, jobsByTicket, showDeleted, widgetLimit]);

  useEffect(() => {
    setSelectedTickets((prev) => {
      const valid = new Set(displayedJobs.map((job) => String(normalizeTicket(job))).filter(Boolean));
      const next = new Set([...prev].filter((ticket) => valid.has(ticket)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [displayedJobs]);


  const handleEdit = (rawJob) => {
    if (!rawJob) return;

    if (isJobDeleted(rawJob)) {
      // Deleted jobs should not be edited from history by default.
      // If you want "restore then edit" later, handle that flow explicitly.
      return;
    }

    const payload = mapSavedJobToWizardState(rawJob);
    if (!payload) return;

    dispatch({ type: "LOAD_EXISTING_ORDER", payload });
    dispatch({ type: "SET_STEP", payload: STEP_CONFIRM });

    if (onClose) onClose();
    if (showFullHistory) setShowFullHistory(false);
    setSelectedJob(null);
  };

  const formatSize = (job) => {
    const s = job.size || { w: 3.5, h: 2 };
    return `${Number(s.w)} × ${Number(s.h)}`;
  };

  // Called by JobDetailModal when delete succeeds, before modal closes.
  // Requirement: "on delete success, update local list/state so it shows as deleted."
  const handleJobDeleted = (ticketNo) => {
    if (!ticketNo) return;

    setAllJobs((prev) =>
      prev.map((j) => {
        const t = normalizeTicket(j);
        if (String(t) !== String(ticketNo)) return j;

        return {
          ...j,
          status: "deleted",
          isDeleted: true,
          deletedAt: j.deletedAt || new Date().toISOString(),
        };
      })
    );
  };

  // Requirement: "after deletion, refresh happens when the modal is closed."
  const handleModalClose = async () => {
    setSelectedJob(null);
    if (!isWidget) {
      await refreshList({ includeDeleted: showDeleted });
    }
  };

  return (
    <div className={`flex h-full flex-col ${!isWidget && "space-y-4"}`}>
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Order History</h2>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search by ticket or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`rounded border border-zinc-700 bg-zinc-900 py-1.5 pl-8 pr-8 text-sm transition-all ${
                isWidget ? "w-52" : "w-44 focus:w-64"
              }`}
            />
            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
              <SearchIcon className="h-3.5 w-3.5" />
            </div>

            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Clear search"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            )}

            {isSearching && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-zinc-200"></div>
              </div>
            )}
          </div>

          {!isWidget && (
            <>
              <label className="flex select-none items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="h-4 w-4 rounded border border-zinc-700 bg-zinc-900"
                />
                Show Deleted
              </label>

              <button
                type="button"
                onClick={handleBulkInvoiceDownload}
                disabled={selectedTickets.size === 0}
                className="rounded bg-[#FDD704] px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#e5c204] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download {selectedTickets.size > 0 ? `${selectedTickets.size} ` : ""}Invoice{selectedTickets.size === 1 ? "" : "s"}
              </button>

              <button
                type="button"
                onClick={clearSelection}
                disabled={selectedTickets.size === 0}
                className="rounded border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Clear
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="rounded-full bg-zinc-800 p-1.5 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-950 text-xs uppercase text-zinc-400">
              <tr>
                {!isWidget && (
                  <th className="w-10 bg-zinc-950 px-4 py-3 text-center font-medium">Sel.</th>
                )}
                <th className="w-10 bg-zinc-950 px-4 py-3 text-center font-medium">Inv.</th>
                <th className="bg-zinc-950 px-4 py-3 font-medium">Ticket</th>
                <th className="bg-zinc-950 px-4 py-3 font-medium">Customer</th>
                {!isWidget && (
                  <th className="bg-zinc-950 px-4 py-3 font-medium">Size</th>
                )}
                <th className="bg-zinc-950 px-4 py-3 text-right font-medium">
                  Qty
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr>
                  <td
                    colSpan={isWidget ? 4 : 6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    Loading...
                  </td>
                </tr>
              ) : displayedJobs.length === 0 ? (
                <tr>
                  <td
                    colSpan={isWidget ? 4 : 6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    {searchTerm.trim()
                      ? isSearching
                        ? "Searching..."
                        : "No matches found."
                      : "No orders found."}
                  </td>
                </tr>
              ) : (
                displayedJobs.map((job, index) => {
                  const ticket = normalizeTicket(job);
                  const deleted = isJobDeleted(job);
                  const rowKey =
                    ticket ||
                    [job.custId, job.orderDate, job.custName || job.clientName]
                      .filter(Boolean)
                      .join("-") ||
                    `order-history-row-${index}`;

                  return (
                    <tr
                      key={rowKey}
                      className={`group transition-colors hover:bg-zinc-800 ${
                        deleted ? "opacity-70" : ""
                      } ${selectedTickets.has(String(ticket)) ? "bg-zinc-800/70" : ""}`}
                      title={deleted ? "Deleted" : ""}
                    >
                      {!isWidget && (
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTickets.has(String(ticket))}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelection(String(ticket))}
                            className="h-4 w-4 rounded border border-zinc-700 bg-zinc-900"
                            aria-label={`Select ${ticket || "job"}`}
                          />
                        </td>
                      )}

                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <InvoicedToggle
                          ticketNo={ticket}
                          initialStatus={!!job.isInvoiced}
                          size="sm"
                          ticketsToToggle={
                            selectedTickets.size > 1 && selectedTickets.has(String(ticket))
                              ? [...selectedTickets]
                              : [String(ticket)]
                          }
                          onStatusApplied={(tickets, status) => {
                            const updated = new Set(tickets.map((t) => String(t)));
                            setAllJobs((prev) =>
                              prev.map((rowJob) => {
                                const rowTicket = String(normalizeTicket(rowJob));
                                return updated.has(rowTicket)
                                  ? { ...rowJob, isInvoiced: status }
                                  : rowJob;
                              })
                            );
                          }}
                        />
                      </td>

                      <td className="px-4 py-3 font-mono text-zinc-300 cursor-pointer" onClick={() => setSelectedJob(job)}>
                        <div className="flex items-center gap-2">
                          <span>{ticket || "—"}</span>
                          {deleted && (
                            <span className="rounded border border-red-500/40 bg-red-900/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
                              Deleted
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-medium text-zinc-200 cursor-pointer" onClick={() => setSelectedJob(job)}>
                        <div className="max-w-[140px] truncate sm:max-w-[240px]">
                          {job.custName || job.clientName || "—"}
                        </div>
                      </td>

                      {!isWidget && (
                        <td className="px-4 py-3 text-xs text-zinc-400 cursor-pointer" onClick={() => setSelectedJob(job)}>
                          {formatSize(job)}
                        </td>
                      )}

                      <td className="px-4 py-3 text-right text-zinc-400 cursor-pointer" onClick={() => setSelectedJob(job)}>
                        {job.totalQty ?? 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isWidget && !loading && (
          <div className="border-t border-zinc-800 bg-zinc-950/50 p-2 text-center text-xs text-zinc-500">
            {allJobs.length} orders total
          </div>
        )}
      </div>

      {isWidget && (
        <div className="mt-auto pt-4">
          <button
            onClick={() => setShowFullHistory(true)}
            className="w-full rounded border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            View All Orders
          </button>
        </div>
      )}

      {showFullHistory && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setShowFullHistory(false)}
        >
          <div
            className="h-[80vh] w-full max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <OrderHistory isWidget={false} onClose={() => setShowFullHistory(false)} />
          </div>
        </div>
      )}

      {selectedJob && (
        <JobDetailModal
          job={selectedJob}
          onClose={handleModalClose}
          onEdit={handleEdit}
          onDeleted={handleJobDeleted}
        />
      )}
    </div>
  );
}
