// src/utils/localPresets.js
// @ts-check

import { normalizeStockKey } from "./stocks";

/**
 * @typedef {{ w:number, h:number }} SizeInches
 *
 * @typedef {{
 *   productId?: string,
 *   size: SizeInches,
 *   stock: string,
 *   sides: string,
 *   finish: string,
 *   colors?: string,
 *   turnaround: string
 * }} PresetConfig
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   config: PresetConfig,
 *   createdAt: number,
 *   updatedAt?: number
 * }} Preset
 */

const KEY = "presets.local.v1";


function normalizePresetConfig(config) {
  if (!config || typeof config !== "object") return config;
  return {
    ...config,
    stock: normalizeStockKey(config.stock || "uncoated") || "uncoated",
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map((item) => ({ ...item, config: normalizePresetConfig(item?.config) }))
      : [];
  } catch {
    return [];
  }
}
function write(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function listPresets() {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function savePreset({ label, config }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const items = read();
  const preset = { id, label, config: normalizePresetConfig(config), createdAt: Date.now() };
  write([preset, ...items]);
  return preset;
}

export function removePreset(id) {
  write(read().filter((p) => p.id !== id));
}

export function updatePreset(id, patch) {
  write(
    read().map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p))
  );
}
