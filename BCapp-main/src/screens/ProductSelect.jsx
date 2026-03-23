// src/screens/ProductSelect.jsx
import React, { useState, useCallback } from "react";
import { useWizard, STEP_CUSTOMIZE } from "../context/WizardContext";
import OrderHistory from "../components/OrderHistory";
import CustomerManager from "../components/CustomerManager";

export default function ProductSelect({ onOpenBilling }) {
  const { dispatch } = useWizard();
  const [showCustomerManager, setShowCustomerManager] = useState(false);

  const handleNewOrder = useCallback(() => {
    // Clears any stale ticket/cart from a previously loaded job
    dispatch({ type: "START_NEW_ORDER" });

    // Advances to Customize
    dispatch({
      type: "MARK_STEP_COMPLETE",
      payload: { label: "Product", nextStep: STEP_CUSTOMIZE },
    });
  }, [dispatch]);

  const openCustomers = useCallback(() => setShowCustomerManager(true), []);
  const closeCustomers = useCallback(() => setShowCustomerManager(false), []);

  return (
    <div className="h-full flex flex-col space-y-4">
      <h1 className="text-lg font-semibold text-zinc-50 pl-1">
        Business Card Orders
      </h1>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-[16rem_10rem_10rem]">
        {/* 1. New Order Card */}
        <button
          type="button"
          onClick={handleNewOrder}
          className="
            group relative flex flex-col justify-between h-64 lg:h-auto
            lg:col-start-1 lg:row-start-1
            rounded-2xl border border-zinc-800 bg-zinc-950
            p-6 text-left shadow-sm transition-all
            hover:border-[#FDD704] hover:bg-zinc-900/50
            focus:outline-none focus:ring-2 focus:ring-[#FDD704]
          "
        >
          <div className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 group-hover:border-[#FDD704] group-hover:text-[#FDD704] transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>

            <div>
              <div className="text-2xl font-bold text-zinc-50 group-hover:text-[#FDD704] transition-colors">
                New Order
              </div>
              <div className="mt-2 pr-8 text-sm leading-relaxed text-zinc-400">
                Start a new job from scratch. Configure specs, upload artwork,
                and generate tickets.
              </div>
            </div>
          </div>

          <div className="absolute bottom-6 right-6 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="text-[#FDD704] text-xs font-medium uppercase tracking-wider">
              Get Started →
            </span>
          </div>
        </button>

        {/* 2. Clients */}
        <button
          type="button"
          onClick={openCustomers}
          className="
            group flex flex-col justify-center h-40 lg:h-auto
            lg:col-start-1 lg:row-start-2
            rounded-2xl border border-zinc-800 bg-zinc-950
            p-6 text-left shadow-sm transition-all
            hover:border-zinc-600 hover:bg-zinc-900
          "
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-500 group-hover:border-zinc-500 group-hover:text-zinc-200 transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
            </div>

            <div>
              <div className="text-2xl font-bold text-zinc-200 group-hover:text-white transition-colors">
                Clients
              </div>
              <div className="mt-1 text-sm leading-relaxed text-zinc-400 group-hover:text-zinc-300">
                Manage customer database, shipping addresses, and billing
                profiles.
              </div>
            </div>
          </div>
        </button>

        {/* 3. Billing & Reports */}
        <button
          type="button"
          onClick={onOpenBilling}
          className="
            group flex flex-col justify-center h-40 lg:h-auto
            lg:col-start-1 lg:row-start-3
            rounded-2xl border border-zinc-800 bg-zinc-950
            p-6 text-left shadow-sm transition-all
            hover:border-zinc-600 hover:bg-zinc-900
          "
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-500 group-hover:border-zinc-500 group-hover:text-[#FDD704] transition-colors">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="20" x2="12" y2="10"></line>
                <line x1="18" y1="20" x2="18" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="16"></line>
              </svg>
            </div>

            <div>
              <div className="text-2xl font-bold text-zinc-200 group-hover:text-white transition-colors">
                Billing & Reports
              </div>
              <div className="mt-1 text-sm leading-relaxed text-zinc-400 group-hover:text-zinc-300">
                View invoicing dashboard, track revenue, and export CSVs.
              </div>
            </div>
          </div>
        </button>

        {/* 4. Order History Widget */}
        <div className="h-[26rem] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:h-auto">
          <OrderHistory isWidget={true} widgetLimit={10} />
        </div>
      </div>

      {/* Customer Manager Modal */}
      {showCustomerManager && <CustomerManager onClose={closeCustomers} />}
    </div>
  );
}
