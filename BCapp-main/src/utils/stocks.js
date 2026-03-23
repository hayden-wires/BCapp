export const STOCK_CATALOG = [
  { key: "uncoated", label: "100# Uncoated Cover" },
  { key: "natural_cover_100", label: "100# Natural Cover" },
  { key: "cougar_natural", label: "130# Cougar Uncoated Cover" },
  {
    key: "classic_crest",
    label: "130# Classic Crest Eggshell Cover Avon Brilliant White",
  },
  {
    key: "classic_crest_linen_natural_white",
    label: "80# Classic Crest Classic Linen Natural White",
  },
];

const STOCK_KEY_ALIASES = {
  natural_cover: "natural_cover_100",
};

export function normalizeStockKey(key) {
  if (!key) return "";
  const normalized = String(key).trim().toLowerCase();
  return STOCK_KEY_ALIASES[normalized] || normalized;
}

const STOCK_LABEL_LOOKUP = Object.fromEntries(
  STOCK_CATALOG.map(({ key, label }) => [key, label])
);

export function getStockLabel(key) {
  if (!key) return "Unspecified stock";
  const canonicalKey = normalizeStockKey(key);
  return STOCK_LABEL_LOOKUP[canonicalKey] || key;
}
