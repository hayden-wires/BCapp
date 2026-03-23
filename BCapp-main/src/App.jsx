// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  WizardProvider,
  useWizard,
  STEP_PRODUCT,
  STEP_CUSTOMIZE,
  STEP_FINALIZE,
  STEP_SHIPPING,
  STEP_BILLING,
  STEP_CONFIRM,
} from "./context/WizardContext";

import TopBar from "./components/TopBar";
import ProgressBar from "./components/ProgressBar";

import ProductSelect from "./screens/ProductSelect";
import Customize from "./screens/Customize";
import Finalize from "./screens/Finalize";
import Shipping from "./screens/Shipping";
import Billing from "./screens/Billing";
import Confirm from "./screens/Confirm";
import InvoiceManager from "./screens/InvoiceManager";

import FeedbackModal from "./components/FeedbackModal";
import { probeApiStatus, submitFeedback } from "./utils/api";

function WizardShell() {
  const { state, dispatch, placeOrder, resetWizard, constants } = useWizard();
  const { step, maxStep, stepStatus, placingOrder, orderPlaced, orderError } = state.ui;
  const { cart, title, shipping, billing, totals, jobDraft } = state.order;
  const { STEP_LABELS } = constants;

  const [showInvoiceManager, setShowInvoiceManager] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const [feedbackStatus, setFeedbackStatus] = useState("idle"); // "idle" | "submitting" | "success" | "error"
  const [feedbackError, setFeedbackError] = useState("");

  const [apiStatus, setApiStatus] = useState({ checking: true, reachable: true, message: "" });

  useEffect(() => {
    let cancelled = false;

    async function checkApiStatus() {
      const result = await probeApiStatus();
      if (cancelled) return;

      if (result.ok) {
        setApiStatus({ checking: false, reachable: true, message: "" });
        return;
      }

      setApiStatus({
        checking: false,
        reachable: false,
        message:
          `Backend API unreachable at ${result.baseUrl}. ` +
          `Set VITE_API_BASE_URL for deployed environments or use the local /api proxy.`,
      });
    }

    checkApiStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const ticketNo = jobDraft?.ticketNo;
  const isEditing = !!ticketNo;

  const stepLabel = useMemo(
    () => STEP_LABELS?.[step - 1] ?? `Step ${step}`,
    [STEP_LABELS, step]
  );

  function handleProgressNav(nextStep) {
    if (nextStep === step) return;
    if (nextStep > maxStep) return;

    const currentLabel = STEP_LABELS[step - 1];
    dispatch({
      type: "MARK_STEP_ATTENTION",
      payload: { label: currentLabel },
    });

    dispatch({ type: "SET_STEP", payload: nextStep });
  }

  let content = null;

  switch (step) {
    case STEP_PRODUCT:
      content = <ProductSelect onOpenBilling={() => setShowInvoiceManager(true)} />;
      break;
    case STEP_CUSTOMIZE:
      content = <Customize />;
      break;
    case STEP_FINALIZE:
      content = <Finalize />;
      break;
    case STEP_SHIPPING:
      content = <Shipping />;
      break;
    case STEP_BILLING:
      content = <Billing />;
      break;
    case STEP_CONFIRM:
      content = (
        <Confirm
          orderTitle={title}
          cart={cart}
          shipping={shipping}
          billing={billing}
          totals={totals}
          placingOrder={placingOrder}
          orderPlaced={orderPlaced}
          orderError={orderError}
          onPlaceOrder={placeOrder}
        />
      );
      break;
    default:
      content = <div className="p-8 text-center">Unknown Step</div>;
  }

  const XIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );

  function openFeedback() {
    setFeedbackError("");
    setFeedbackStatus("idle");
    setShowFeedback(true);
  }

  function closeFeedback() {
    if (feedbackStatus === "submitting") return;
    setShowFeedback(false);

    setFeedbackStatus("idle");
    setFeedbackError("");
  }

  async function handleSubmitFeedback(payload) {
    try {
      setFeedbackError("");
      setFeedbackStatus("submitting");

      const lines = [];

      if (payload?.category) lines.push(`[${payload.category}]`);
      if (payload?.message) lines.push(payload.message);

      if (payload?.includeContext && payload?.context) {
        const ctx = payload.context || {};
        const ctxParts = [];
        if (ctx.stepLabel) ctxParts.push(`Step: ${ctx.stepLabel}`);
        if (ctx.isEditing) ctxParts.push("Editing: yes");
        if (ctx.ticketNo) ctxParts.push(`Ticket: ${ctx.ticketNo}`);
        if (ctxParts.length) {
          lines.push("");
          lines.push(ctxParts.join(" | "));
        }
      }

      const feedbackText = lines.join("\n").trim();

      await submitFeedback(feedbackText);

      setFeedbackStatus("success");

      setTimeout(() => {
        setShowFeedback(false);
        setFeedbackStatus("idle");
        setFeedbackError("");
      }, 900);
    } catch (err) {
      console.error("Feedback submit failed:", err);
      setFeedbackStatus("error");
      setFeedbackError(err?.message || "Failed to submit feedback.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="flex-1">
        <TopBar
          onOpenFeedback={openFeedback}
          onOpenInvoiceManager={() => setShowInvoiceManager(true)}
        />

        {isEditing && (
          <div className="bg-zinc-900/50 border-b border-zinc-800">
            <div className="mx-auto max-w-6xl px-4 flex items-center justify-between min-h-[40px]">
              <div className="flex items-center gap-4 py-2">
                <button
                  onClick={resetWizard}
                  className="flex items-center gap-2 rounded bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                  title="Discard changes and start a new order"
                >
                  <XIcon />
                  Cancel Edits
                </button>
                <span className="text-xs text-zinc-400">
                  Editing Ticket <strong>{ticketNo}</strong>
                </span>
              </div>
              <div />
            </div>
          </div>
        )}

        {!apiStatus.checking && !apiStatus.reachable && (
          <div className="mx-auto max-w-6xl px-4 pt-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <strong className="font-semibold">API Warning:</strong> {apiStatus.message}
            </div>
          </div>
        )}

        <div className="mx-auto max-w-6xl px-4 pt-4">
          <ProgressBar
            step={step}
            maxStep={maxStep}
            stepStatus={stepStatus}
            onStepChange={handleProgressNav}
          />
        </div>

        <main className="mx-auto max-w-6xl px-4 py-6">{content}</main>
      </div>

      <footer className="border-t border-zinc-900 py-1 text-[10px] text-zinc-500 text-center">
        BCapp v0.5.1
      </footer>

      {showInvoiceManager && <InvoiceManager onClose={() => setShowInvoiceManager(false)} />}

      {showFeedback && (
        <FeedbackModal
          isOpen={showFeedback}
          onClose={closeFeedback}
          onSubmit={handleSubmitFeedback}
          context={{
            step,
            stepLabel,
            isEditing,
            ticketNo: ticketNo ?? null,
          }}
          title="Send feedback"
          status={feedbackStatus}
          errorMessage={feedbackError}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <WizardProvider>
      <WizardShell />
    </WizardProvider>
  );
}
