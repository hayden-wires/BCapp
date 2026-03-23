// src/components/InvoicedToggle.jsx
import React, { useEffect, useState } from "react";
import { toggleJobInvoiced } from "../utils/api";

export default function InvoicedToggle({
  ticketNo,
  initialStatus = false,
  size = "md",
  className = "",
  ticketsToToggle,
  onStatusApplied,
}) {
  const [invoiced, setInvoiced] = useState(initialStatus);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInvoiced(initialStatus);
  }, [initialStatus]);

  // Size classes map
  const sizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const handleToggle = async (e) => {
    e.stopPropagation(); // Stop row click
    if (loading) return;

    const targetTickets = Array.isArray(ticketsToToggle)
      ? ticketsToToggle.map((ticket) => String(ticket)).filter(Boolean)
      : [String(ticketNo)].filter(Boolean);

    if (targetTickets.length === 0) return;

    // 1. Optimistic Update
    const newValue = !invoiced;
    setInvoiced(newValue);
    setLoading(true);

    try {
      // 2. API Call in Background
      await Promise.all(targetTickets.map((ticket) => toggleJobInvoiced(ticket, newValue)));
      if (onStatusApplied) onStatusApplied(targetTickets, newValue);
    } catch (err) {
      console.error("Failed to toggle invoice status:", err);
      // 3. Revert on Error
      setInvoiced(!newValue);
      alert("Failed to update status. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      title={invoiced ? "Mark as Uninvoiced" : "Mark as Invoiced"}
      className={`
        flex items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-[#FDD704]
        ${className}
      `}
    >
      {invoiced ? (
        // CHECKED STATE (Green)
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className={`${sizes[size]} text-emerald-500 hover:text-emerald-400 hover:scale-110 transition-transform`}
        >
          <path
            fillRule="evenodd"
            d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        // UNCHECKED STATE (Gray Outline)
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={`${sizes[size]} text-zinc-600 hover:text-zinc-400 hover:scale-110 transition-transform`}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      )}
    </button>
  );
}
