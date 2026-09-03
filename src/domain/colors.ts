import type { BlockColor, ColorFamily } from "./types";

export interface PaletteColor {
  id: string;
  name: string;
  hex: string;
  family: ColorFamily;
}

export const COLOR_FAMILY_LABELS: Record<ColorFamily, string> = {
  neutral: "Neutrals",
  brown: "Browns",
  blue: "Blues",
  green: "Greens",
  red: "Reds",
  yellow: "Yellows",
  pink: "Pinks",
  purple: "Purples",
};

/**
 * Curated palette. Ordered by family, then light to dark. Ids are stable and
 * stored on blocks as `paletteId`, so never rename an id, only add new ones.
 */
export const PALETTE: readonly PaletteColor[] = [
  { id: "white", name: "White", hex: "#ffffff", family: "neutral" },
  { id: "off-white", name: "Off-white", hex: "#f3efe6", family: "neutral" },
  { id: "cream", name: "Cream", hex: "#eee5cf", family: "neutral" },
  { id: "beige", name: "Beige", hex: "#d9c9ad", family: "neutral" },
  { id: "sand", name: "Sand", hex: "#c9b48f", family: "neutral" },
  { id: "light-grey", name: "Light grey", hex: "#c9c9cd", family: "neutral" },
  { id: "grey", name: "Grey", hex: "#8e8e93", family: "neutral" },
  { id: "charcoal", name: "Charcoal", hex: "#3a3a3c", family: "neutral" },
  { id: "black", name: "Black", hex: "#111111", family: "neutral" },

  { id: "tan", name: "Tan", hex: "#c8a27a", family: "brown" },
  { id: "camel", name: "Camel", hex: "#b5834f", family: "brown" },
  { id: "brown", name: "Brown", hex: "#7a5230", family: "brown" },
  { id: "chocolate", name: "Chocolate", hex: "#4a2f1e", family: "brown" },

  { id: "light-blue", name: "Light blue", hex: "#b8d0e8", family: "blue" },
  { id: "sky", name: "Sky", hex: "#7fb0dc", family: "blue" },
  { id: "denim", name: "Denim blue", hex: "#4c6d9c", family: "blue" },
  { id: "navy", name: "Navy", hex: "#1f2a44", family: "blue" },
  { id: "indigo", name: "Indigo", hex: "#2b2f6e", family: "blue" },

  { id: "sage", name: "Sage", hex: "#a8b59a", family: "green" },
  { id: "olive", name: "Olive", hex: "#6b6b3a", family: "green" },
  { id: "forest", name: "Forest", hex: "#2f4a3a", family: "green" },
  { id: "teal", name: "Teal", hex: "#2f7f86", family: "green" },

  { id: "rust", name: "Rust", hex: "#b3562e", family: "red" },
  { id: "red", name: "Red", hex: "#c8322b", family: "red" },
  { id: "burgundy", name: "Burgundy", hex: "#6b1f2b", family: "red" },
  { id: "orange", name: "Orange", hex: "#e8853a", family: "red" },

  { id: "mustard", name: "Mustard", hex: "#d1a12f", family: "yellow" },
  { id: "yellow", name: "Yellow", hex: "#f2d24b", family: "yellow" },

  { id: "pink", name: "Pink", hex: "#e9a7b8", family: "pink" },
  { id: "dusty-rose", name: "Dusty rose", hex: "#c48b8f", family: "pink" },

  { id: "lavender", name: "Lavender", hex: "#b8a9d9", family: "purple" },
  { id: "purple", name: "Purple", hex: "#5b3a8a", family: "purple" },
] as const;

const byId = new Map(PALETTE.map((c) => [c.id, c]));

export function getPaletteColor(id: string): PaletteColor | undefined {
  return byId.get(id);
}

export function paletteToBlockColor(id: string): BlockColor {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown palette color: ${id}`);
  return { name: c.name, hex: c.hex, family: c.family, paletteId: c.id };
}

export function paletteByFamily(): Record<ColorFamily, PaletteColor[]> {
  const out = {} as Record<ColorFamily, PaletteColor[]>;
  for (const c of PALETTE) (out[c.family] ??= []).push(c);
  return out;
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(hex: string): string | null {
  const m = HEX_RE.exec(hex.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

/** Rough family classification for user-entered custom colors. */
export function familyForHex(hex: string): ColorFamily {
  const n = normalizeHex(hex);
  if (!n) return "neutral";
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.12) return "neutral";
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  if (h < 15 || h >= 340) return l > 0.75 ? "pink" : "red";
  if (h < 45) return s < 0.5 || l < 0.45 ? "brown" : "red";
  if (h < 70) return l < 0.4 ? "green" : "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue";
  if (h < 300) return "purple";
  return "pink";
}

export function customColor(name: string, hex: string): BlockColor | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const trimmed = name.trim();
  return { name: trimmed || "Custom", hex: n, family: familyForHex(n) };
}

/** True for very light colors where a swatch needs a visible border. */
export function isLightHex(hex: string): boolean {
  const n = normalizeHex(hex);
  if (!n) return false;
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.82;
}
