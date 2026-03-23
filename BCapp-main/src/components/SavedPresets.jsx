import React, { useEffect, useMemo, useState } from "react";
import { listPresets, removePreset, updatePreset } from "../utils/localPresets";
import { getStockLabel } from "../utils/stocks";

/**
 * Props:
 * - onApply(preset): called when user clicks "Use"
 */
export default function SavedPresets({ onApply }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [undo, setUndo] = useState(null); // { item, timer }

  function refresh() {
    setItems(listPresets());
  }

  useEffect(() => {
    refresh();
    return () => {
      if (undo?.timer) clearTimeout(undo.timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => {
      const cfg = p.config || {};
      return (
        p.label.toLowerCase().includes(q) ||
        String(cfg.stock || "").toLowerCase().includes(q) ||
        String(cfg.sides || "").toLowerCase().includes(q) ||
        String(cfg.finish || "").toLowerCase().includes(q) ||
        `${cfg?.size?.w || ""}x${cfg?.size?.h || ""}`.includes(q)
      );
    });
  }, [items, query]);

  function beginRename(p) {
    setRenamingId(p.id);
    setRenameValue(p.label);
  }

  function commitRename() {
    const id = renamingId;
    const val = renameValue.trim();
    if (id && val) {
      updatePreset(id, { label: val });
      refresh();
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue("");
  }

  function handleDelete(preset) {
    removePreset(preset.id);
    const timer = setTimeout(() => setUndo(null), 5000);
    setUndo({ item: preset, timer });
    refresh();
  }

  function undoDelete() {
    if (!undo) return;
    const { item, timer } = undo;
    clearTimeout(timer);
    // Re-create by updating local storage directly (preserving id & timestamps if present)
    updatePreset(item.id, item); // if it didn't exist, update will do nothing; fallback:
    const existing = listPresets().some((p) => p.id === item.id);
    if (!existing) {
      // fallback reinsert (preserving original order by time)
      const KEY = "presets.local.v1";
      try {
        const raw = localStorage.getItem(KEY);
        const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
        localStorage.setItem(KEY, JSON.stringify([item, ...arr]));
      } catch {
        // ignore
      }
    }
    setUndo(null);
    refresh();
  }

  if (!filtered.length && !items.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">Saved presets</h2>
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            aria-label="Filter saved presets"
            className="w-40 rounded-md bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
          />
          <button onClick={refresh} className="px-2 py-1.5 text-xs rounded border border-zinc-700 hover:border-[#FDD704]-500">
            Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-xs text-zinc-400">No presets match “{query}”.</div>
      ) : (
        <div className="grid xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((p) => {
            const cfg = p.config || {};
            const sizeStr =
              typeof cfg?.size?.w === "number" && typeof cfg?.size?.h === "number"
                ? `${cfg.size.w}″ × ${cfg.size.h}″`
                : "—";
            return (
              <div key={p.id} className="rounded-xl border border-zinc-700 p-3 bg-zinc-900">
                {renamingId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-sm"
                    />
                    <button onClick={commitRename} className="px-2 py-1 text-xs rounded border border-[#FDD704]-500 hover:bg-[#FDD704]-600/10">
                      Save
                    </button>
                    <button onClick={cancelRename} className="px-2 py-1 text-xs rounded border border-zinc-700 hover:border-rose-500">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.label}</div>
                      <div className="text-xs text-zinc-400">
                        {sizeStr} • {cfg.stock ? getStockLabel(cfg.stock) : "—"} • {cfg.sides || "—"} • {cfg.finish || "—"}
                      </div>
                    </div>
                    <button
                      onClick={() => beginRename(p)}
                      title="Rename"
                      className="px-2 py-1 text-xs rounded border border-zinc-700 hover:border-zinc-500"
                    >
                      Rename
                    </button>
                  </div>
                )}

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => onApply?.(p)}
                    className="px-2 py-1 text-xs rounded border border-[#FDD704]-500 hover:bg-[#FDD704]-600/10"
                  >
                    Use
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="px-2 py-1 text-xs rounded border border-zinc-700 hover:border-rose-500"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {undo && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 shadow-lg">
            Preset removed.
            <button
              onClick={undoDelete}
              className="ml-2 underline text-[#FDD704]-400 hover:text-[#FDD704]-300"
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}