// src/components/PresetSaveModal.jsx
import React, { useEffect, useRef, useState } from "react";
import { savePreset } from "../utils/localPresets";
import { getStockLabel } from "../utils/stocks";

export default function PresetSaveModal({ open, onClose, currentConfig, onSaved }) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const suggested =
      label ||
      currentConfig?.label ||
      [
        currentConfig?.productName,
        currentConfig?.size?.w && currentConfig?.size?.h
          ? `– ${currentConfig.size.w}×${currentConfig.size.h}″`
          : null,
        currentConfig?.stock ? `– ${getStockLabel(currentConfig.stock)}` : null,
        currentConfig?.sides ? `– ${formatSides(currentConfig.sides)}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    setLabel(suggested || "Saved preset");
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function formatSides(s) {
    return s === "double" ? "Double-sided" : "Single-sided";
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.();
  }

  async function handleSave() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const created = savePreset({
        label: label.trim(),
        config: {
          productId: currentConfig?.productId,
          size: currentConfig?.size,
          stock: currentConfig?.stock,
          sides: currentConfig?.sides,
          finish: currentConfig?.finish,
          colors: currentConfig?.colors,
          turnaround: currentConfig?.turnaround,
        },
      });
      onSaved?.(created);
      onClose?.();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={handleBackdrop}
      className="fixed inset-0 z-50 grid place-items-center bg-black/60"
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold">Save as preset</div>

        <div className="mt-3 space-y-2">
          <label className="text-sm text-zinc-300">Preset name</label>
          <input
            ref={inputRef}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose?.();
            }}
            className="w-full rounded bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            placeholder="e.g., Corp BC – Coated Classic 4/4"
          />
        </div>

        <div className="mt-4 space-y-1 text-xs text-zinc-400">
          <div>This preset is stored on this browser for quick reorders.</div>
          <div>Includes size, stock, sides, finish, and turnaround.</div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded border border-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !label.trim()}
            className={`px-3 py-1.5 rounded border ${
              busy || !label.trim()
                ? "border-zinc-700 opacity-60 cursor-not-allowed"
                : "border-[#FDD704]-500 hover:bg-[#FDD704]-600/10"
            }`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}