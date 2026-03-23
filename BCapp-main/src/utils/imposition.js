// src/utils/imposition.js

// --- CONSTANTS ---

// Standard Digital Press Sheet (e.g. HP Indigo / Xerox)
const PARENT_SHEET_W = 12;
const PARENT_SHEET_H = 18;

// Unprintable "Gripper" margins
// We assume we lose 0.25" on all four sides for printer handling/crop marks
const MARGIN = 0.25;

// Standard Bleed
// 0.125" is added to EACH side (Top, Bottom, Left, Right)
const BLEED = 0.125; 

/**
 * Calculates how many finished items fit on a parent sheet and how much paper is needed.
 *
 * @param {number} finishedW - The width of the final cut product (e.g. 3.5)
 * @param {number} finishedH - The height of the final cut product (e.g. 2)
 * @param {number} totalQty - Total number of finished pieces needed
 * @param {number} wastePercent - Decimal for waste (default 0.15 for 15%)
 */
export function calculateImposition(finishedW, finishedH, totalQty = 0, wastePercent = 0.15) {
  // 1. Sanitize Inputs
  const w = Math.abs(Number(finishedW) || 0);
  const h = Math.abs(Number(finishedH) || 0);
  const qty = Math.max(0, Number(totalQty) || 0);

  // Guard: If dimensions are zero, return empty stats
  if (w === 0 || h === 0) {
    return { 
      yield: 0, 
      sheetsNet: 0, 
      sheetsGross: 0, 
      layout: "Invalid Size",
      debug: "Dimensions must be greater than 0"
    };
  }

  // 2. Define Printable Area
  // 12" - (0.25 left + 0.25 right) = 11.5"
  const printableW = PARENT_SHEET_W - (MARGIN * 2);
  // 18" - (0.25 top + 0.25 bottom) = 17.5"
  const printableH = PARENT_SHEET_H - (MARGIN * 2);

  // 3. Define Imposition Unit Size (Finished Size + Full Bleeds)
  // A 3.5" card becomes 3.75" wide for calculation
  const unitW = w + (BLEED * 2);
  const unitH = h + (BLEED * 2);

  // 4. Test Fits (Algorithm)
  
  // Scenario A: Standard Orientation
  // How many units fit across the width?
  const colsA = Math.floor(printableW / unitW);
  // How many units fit down the height?
  const rowsA = Math.floor(printableH / unitH);
  const yieldA = colsA * rowsA;

  // Scenario B: Rotated Orientation (Swap W/H)
  const colsB = Math.floor(printableW / unitH);
  const rowsB = Math.floor(printableH / unitW);
  const yieldB = colsB * rowsB;

  // 5. Determine Best Fit
  // We strictly choose the orientation that gives the higher yield.
  let bestYield = 0;
  let layoutDescription = "";

  if (yieldA >= yieldB) {
    bestYield = yieldA;
    layoutDescription = `Standard (${colsA} × ${rowsA})`;
  } else {
    bestYield = yieldB;
    layoutDescription = `Rotated (${colsB} × ${rowsB})`;
  }

  // Guard: Item is too big for the sheet
  if (bestYield === 0) {
    return {
      yield: 0,
      sheetsNet: 0,
      sheetsGross: 0,
      layout: "Too Large",
      debug: `Item (${unitW}"x${unitH}") exceeds printable area (${printableW}"x${printableH}")`
    };
  }

  // 6. Calculate Paper Requirements
  // Net: Exact number of sheets needed to hit quantity
  const sheetsNet = Math.ceil(qty / bestYield);
  
  // Gross: Sheets to order (Net + Waste %)
  // Example: 10 sheets * 1.15 = 11.5 -> 12 sheets
  const sheetsGross = Math.ceil(sheetsNet * (1 + wastePercent));

  return {
    yield: bestYield,       // Cards per sheet
    sheetsNet,              // Minimum sheets
    sheetsGross,            // Order amount (with waste)
    layout: layoutDescription,
    parentSize: `${PARENT_SHEET_W}" × ${PARENT_SHEET_H}"`,
    wasteUsed: `${(wastePercent * 100).toFixed(0)}%`
  };
}