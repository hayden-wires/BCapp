import React, { useEffect, useMemo, useRef, useState } from "react";

export default function TopBar({
  brandText = "BCapp",
  onOpenFeedback,
  menuItems = [],
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const items = useMemo(() => {
    const base = [
      {
        label: "Feedback",
        onClick: onOpenFeedback,
      },
    ];

    const extra = (menuItems || []).filter(
      (it) => it?.label && it.label.toLowerCase() !== "feedback"
    );

    return [...base, ...extra];
  }, [menuItems, onOpenFeedback]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    const onPointerDown = (e) => {
      const el = menuRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setMenuOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  const handleMenuItemClick = (fn, disabled) => {
    if (disabled) return;
    setMenuOpen(false);
    if (typeof fn === "function") fn();
  };

  return (
    <div className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60">
      <div className="mx-auto max-w-6xl px-4 py-2 flex items-center justify-between gap-3">
        {/* Left: App identity */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-zinc-100 truncate">
            {brandText}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Desktop: show Feedback as a primary action */}
          <button
            type="button"
            onClick={onOpenFeedback}
            className="hidden sm:inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:border-[#FDD704] focus:outline-none focus:ring-2 focus:ring-[#FDD704]/40"
          >
            Feedback
          </button>

          {/* More menu (always available, especially for mobile) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex items-center justify-center rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/40"
            >
              More
              <span className="ml-2 text-zinc-400" aria-hidden="true">
                ▾
              </span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Top bar menu"
                className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-lg"
              >
                {items.map((it, idx) => {
                  const disabled = Boolean(it.disabled);
                  return (
                    <button
                      key={`${it.label}-${idx}`}
                      type="button"
                      role="menuitem"
                      disabled={disabled}
                      onClick={() => handleMenuItemClick(it.onClick, disabled)}
                      className={[
                        "w-full text-left px-3 py-2 text-sm",
                        "hover:bg-zinc-900 focus:bg-zinc-900 focus:outline-none",
                        disabled ? "text-zinc-600 cursor-not-allowed" : "text-zinc-100",
                        idx !== items.length - 1 ? "border-b border-zinc-900" : "",
                      ].join(" ")}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}