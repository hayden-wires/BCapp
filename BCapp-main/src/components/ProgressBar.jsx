// src/components/ProgressBar.jsx
import React from "react";

const STEPS = ["Product", "Customize", "Finalize", "Shipping", "Billing", "Confirm"];

/**
 * Props:
 *  - step: current step index (1-based)
 *  - onStepChange?: (nextStep: number) => void
 *  - maxStep?: highest step the user is allowed to jump to
 *  - stepStatus?: { [label: string]: "pending" | "complete" | "attention" }
 */
export default function ProgressBar({ step, onStepChange, maxStep, stepStatus = {} }) {
  const current = Number.isFinite(Number(step)) ? Number(step) : 1;
  const allowedMax = Number.isFinite(Number(maxStep)) ? Number(maxStep) : STEPS.length;
  const pct = Math.max(0, Math.min(100, ((current - 1) / (STEPS.length - 1)) * 100));

  return (
    <div className="w-full space-y-2">
      {/* Pills: equal-width on desktop, wrap nicely on small screens */}
      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => {
          const idx = i + 1;
          const active = current === idx;
          const reached = current >= idx;
          const disabled = idx > allowedMax;
          const status = stepStatus[label] || "pending";

          let borderClasses = "border-zinc-700 text-zinc-400";
          if (reached) borderClasses = "border-zinc-500 text-zinc-300";
          if (active) borderClasses = "border-zinc-200 text-zinc-50";
          if (status === "complete") borderClasses = "border-emerald-500 text-emerald-300";
          if (status === "attention") borderClasses = "border-amber-400 text-amber-300";

          const cursorClass = disabled ? "cursor-not-allowed" : "cursor-pointer";
          const hoverClass =
            !disabled && status !== "attention" ? "hover:border-[#FDD704]" : "";
          const opacityClass = disabled ? "opacity-50" : "";

          return (
            <div
              key={label}
              className="
                flex-1
                min-w-[90px]
                md:min-w-0
                flex
                justify-center
              "
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled || typeof onStepChange !== "function") return;
                  onStepChange(idx);
                }}
                className={`
                  relative
                  w-full
                  max-w-[150px]
                  rounded-full
                  border
                  px-3
                  py-1
                  text-[11px] sm:text-[12px]
                  whitespace-nowrap
                  ${borderClasses}
                  ${cursorClass}
                  ${hoverClass}
                  ${opacityClass}
                `}
              >
                <span className="align-middle leading-none">{label}</span>

                {status === "attention" && (
                  <span
                    className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-400"
                    aria-hidden="true"
                    title="Needs attention"
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-800">
        <div
          className="h-1.5 bg-[#FDD704] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
