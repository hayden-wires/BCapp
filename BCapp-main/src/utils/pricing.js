import { normalizeStockKey } from "./stocks";

// src/utils/pricing.js
// Business card–only pricing helper.
//
// Rules:
// - Minimum rung: 100 cards single-sided = $40
// - Next rung: 250 cards single-sided = $45
// - From 250 up: +$5 for each additional 250-card block (250, 500, 750…)
// - Double-sided adds $5 per double-sided version
// - Stock Surcharges:
//    - "Uncoated": $0
//    - "Cougar Natural": $10 per version
//    - "Classic Crest": Tiered ($45 for 1st, $35 for 2nd, $25 for 3rd, $15 for 4th+)
// - Round Corners (Finish) adds $5 per version applying it

// --- Stock options (for UI only right now) ---
export const STOCKS = [
  { key: "uncoated", label: "100# Uncoated Cover" },
  { key: "natural_cover_100", label: "100# Natural Cover" },
  { key: "cougar_natural", label: "130# Cougar Uncoated Cover" },
  { key: "classic_crest", label: "130# Classic Crest Eggshell Cover Avon Brilliant White" }, // NEW
  { key: "classic_crest_linen_natural_white", label: "80# Classic Crest Classic Linen Natural White" },
];

// --- Quantity helpers used by Customize.jsx ---
export const MIN_QTY = 100;   // minimum order quantity
export const MAX_QTY = 5000;  // you can adjust this as needed
export const QTY_STEP = 250;  // typical step for dropdowns (250, 500, 750…)

// Internal pricing constants
const MIN_RUNG_QTY = 100;
const BLOCK_SIZE_250 = 250;

const PRICE_100_SINGLE = 40;   // 100 single-sided
const PRICE_250_SINGLE = 45;   // 250 single-sided
const INCREMENT_PER_250 = 5;   // each additional 250 above 250

const DOUBLE_SIDES_SURCHARGE_PER_VERSION = 5; // $5 per double-sided version
const STOCK_SURCHARGE_COUGAR_PER_VERSION = 10; // $10 per version
const FINISH_SURCHARGE_ROUND_CORNERS = 5; // $5 per version for round corners

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Compute business card pricing.
 *
 * @param {Object} opts
 * @param {"single"|"double"|"mixed"} opts.sides
 * For pricing we treat:
 * - "single"  => no sides surcharge
 * - "double"  => surcharge for each version (versionCount)
 * - "mixed"   => caller should pass only the number of double-sided
 * versions as versionCount and sides="double".
 * @param {number} opts.versionCount - number of versions relevant for surcharge.
 * @param {number} opts.totalQty - total finished cards across all versions.
 * @param {string} opts.stock - "uncoated" or "cougar_natural" or "classic_crest"
 * @param {number} opts.finishCount - number of versions that have a finish (e.g. round corners)
 */
export function computeBusinessCardPrice({
  sides = "single",
  versionCount = 1,
  totalQty = 0,
  stock = "uncoated",
  finishCount = 0,
} = {}) {
  const qty = Math.max(0, Number(totalQty) || 0);
  const versions = Math.max(1, Number(versionCount) || 1);
  const stockKey = normalizeStockKey(stock || "uncoated") || "uncoated";

  if (!qty) {
    return {
      valid: false,
      reason: "Enter at least one card.",
      totalQty: 0,
      effectiveQty: 0,
      ladderQty: 0,
      baseSinglePrice: 0,
      sidesSurcharge: 0,
      stockSurcharge: 0,
      finishSurcharge: 0,
      totalPrice: 0,
      total: 0,
      unitPrice: 0,
      sides,
      versionCount: versions,
      doubleVersions: 0,
      minApplied: false,
    };
  }

  // 1. Determine Base Price (Ladder Logic)
  // - Up to 100: bill as 100 @ $40
  // - Above 100: bill based on 250-block ladder (250, 500, 750, …)
  let ladderQty;
  let baseSinglePrice;

  if (qty <= MIN_RUNG_QTY) {
    ladderQty = MIN_RUNG_QTY; // 100-card rung
    baseSinglePrice = PRICE_100_SINGLE;
  } else {
    const blocks = Math.ceil(qty / BLOCK_SIZE_250); // 1 block = 250
    ladderQty = blocks * BLOCK_SIZE_250;

    // 1 block (250)  => $45
    // 2 blocks (500) => $50
    // 3 blocks (750) => $55
    // 4 blocks (1000)=> $60, etc.
    baseSinglePrice =
      PRICE_250_SINGLE + (blocks - 1) * INCREMENT_PER_250;
  }

  // 2. Sides surcharge: $5 per double-sided version.
  const doubleVersions = sides === "double" ? versions : 0;
  const sidesSurcharge = DOUBLE_SIDES_SURCHARGE_PER_VERSION * doubleVersions;

  // 3. Stock surcharge Calculation
  let stockSurcharge = 0;

  if (stockKey === "cougar_natural") {
    // Standard per-version logic
    stockSurcharge = STOCK_SURCHARGE_COUGAR_PER_VERSION * versions;
  } 
  else if (stockKey === "classic_crest") {
    // Tiered logic:
    // 1st version: $45
    // 2nd version: +$35
    // 3rd version: +$25
    // 4th+ version: +$15 each
    
    if (versions >= 1) stockSurcharge += 45;
    if (versions >= 2) stockSurcharge += 35;
    if (versions >= 3) stockSurcharge += 25;
    if (versions >= 4) {
      stockSurcharge += (versions - 3) * 15;
    }
  }

  // 4. Finish surcharge: $5 per version that has the finish applied
  const finishSurcharge = (finishCount || 0) * FINISH_SURCHARGE_ROUND_CORNERS;

  // 5. Final Totals
  const totalPrice = round2(baseSinglePrice + sidesSurcharge + stockSurcharge + finishSurcharge);
  const total = totalPrice;
  const unitPrice = qty > 0 ? round2(totalPrice / qty) : 0;

  return {
    valid: true,
    reason: null,
    totalQty: qty,
    effectiveQty: ladderQty, // quantity rung we priced against
    ladderQty,
    baseSinglePrice: round2(baseSinglePrice),
    sidesSurcharge: round2(sidesSurcharge),
    stockSurcharge: round2(stockSurcharge),
    finishSurcharge: round2(finishSurcharge),
    totalPrice,
    total,
    unitPrice,
    sides,
    versionCount: versions,
    doubleVersions,
    // true when we had to apply the 100-card minimum rung
    minApplied: qty <= MIN_RUNG_QTY,
  };
}
