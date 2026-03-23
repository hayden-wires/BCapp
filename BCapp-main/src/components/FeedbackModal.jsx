// src/components/FeedbackModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function FeedbackModal({
  isOpen = true,
  onClose,
  onSubmit,
  context,
  title = "Send feedback",
  status = "idle", 
  errorMessage = "",
}) {
  const [category, setCategory] = useState("Bug");
  const [message, setMessage] = useState("");
  const [includeContext, setIncludeContext] = useState(true);

  const dialogRef = useRef(null);
  const messageRef = useRef(null);
  const liveRef = useRef(null);

  const canSubmit = useMemo(() => message.trim().length > 0, [message]);

  const isSubmitting = status === "submitting";
  const isSuccess = status === "success";
  const isError = status === "error";

  useEffect(() => {
    if (!isOpen) return;
    if (isSuccess) return;

    const t = setTimeout(() => {
      messageRef.current?.focus?.();
    }, 0);

    return () => clearTimeout(t);
  }, [isOpen, isSuccess]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      if (isSubmitting) return; 
      onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isSuccess) return;

    const t = setTimeout(() => {
      liveRef.current?.focus?.();
    }, 0);

    return () => clearTimeout(t);
  }, [isOpen, isSuccess]);

  function handleBackdropMouseDown(e) {
    if (e.target !== e.currentTarget) return;
    if (isSubmitting) return;
    onClose?.();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    if (isSubmitting) return;
    if (isSuccess) return;

    const payload = {
      category,
      message: message.trim(),
      includeContext,
      context: includeContext ? context ?? null : null,
      createdAtISO: new Date().toISOString(),
    };

    onSubmit?.(payload);

  }

  useEffect(() => {
    if (!isOpen) return;
    if (!isSuccess) return;

    setCategory("Bug");
    setMessage("");
    setIncludeContext(true);
  }, [isOpen, isSuccess]);

  if (!isOpen) return null;

  const disableForm = isSubmitting || isSuccess;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Feedback"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-100 truncate">
              {title}
            </div>
            <div className="text-xs text-zinc-400">
              Share a bug, idea, or request.
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (isSubmitting) return;
              onClose?.();
            }}
            disabled={isSubmitting}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <div className="relative">
          <form onSubmit={handleSubmit} className="px-4 py-4">
            <fieldset disabled={disableForm} className="space-y-0">
              <label className="block text-xs text-zinc-400 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-60"
              >
                <option value="Bug">Bug</option>
                <option value="Idea">Idea</option>
                <option value="Request">Request</option>
                <option value="Other">Other</option>
              </select>

              <label className="block text-xs text-zinc-400 mt-4 mb-1">
                Details
              </label>
              <textarea
                ref={messageRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="Describe what happened, what you expected, and any helpful context."
                className="w-full resize-none rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-60"
              />

              <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300 select-none">
                <input
                  type="checkbox"
                  checked={includeContext}
                  onChange={(e) => setIncludeContext(e.target.checked)}
                  disabled={disableForm}
                />
                Include current step info (helps debugging)
              </label>

              {isError && (
                <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {errorMessage || "Failed to submit feedback. Please try again."}
                </div>
              )}

              <div className="mt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isSubmitting) return;
                    onClose?.();
                  }}
                  disabled={isSubmitting}
                  className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting || isSuccess}
                  className="rounded-md border border-[#FDD704]/40 bg-[#FDD704] text-black px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Sending..." : isSuccess ? "Sent" : "Submit"}
                </button>
              </div>
            </fieldset>
          </form>

          {isSuccess && (
            <>
              <div className="absolute inset-0 bg-black/55" />
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div
                  ref={liveRef}
                  tabIndex={-1}
                  className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 px-5 py-4 shadow-xl outline-none"
                  role="status"
                  aria-live="polite"
                >
                  <div className="text-sm font-semibold text-zinc-100">
                    Thank you for your feedback!
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Your message has been sent.
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}