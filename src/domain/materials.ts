import type { MaterialId } from "./types";

export interface Material {
  id: MaterialId;
  label: string;
  /** Added to a type's base warmth. */
  warmth: number;
  /** Added to a type's base formality. */
  formality: number;
}

export const MATERIALS: readonly Material[] = [
  { id: "cotton", label: "Cotton", warmth: 0, formality: 0 },
  { id: "linen", label: "Linen", warmth: -1, formality: 0 },
  { id: "jersey", label: "Jersey", warmth: 0, formality: -0.5 },
  { id: "twill", label: "Twill", warmth: 0, formality: 0.5 },
  { id: "denim", label: "Denim", warmth: 0, formality: -0.5 },
  { id: "corduroy", label: "Corduroy", warmth: 0.5, formality: 0 },
  { id: "canvas", label: "Canvas", warmth: 0, formality: -0.5 },
  { id: "knit", label: "Knit", warmth: 0.5, formality: 0 },
  { id: "wool", label: "Wool", warmth: 1, formality: 0.5 },
  { id: "cashmere", label: "Cashmere", warmth: 1, formality: 1 },
  { id: "fleece", label: "Fleece", warmth: 1, formality: -1 },
  { id: "silk", label: "Silk", warmth: -0.5, formality: 1 },
  { id: "leather", label: "Leather", warmth: 0.5, formality: 0.5 },
  { id: "suede", label: "Suede", warmth: 0.5, formality: 0.5 },
  { id: "nylon", label: "Nylon", warmth: 0, formality: -0.5 },
  { id: "polyester", label: "Polyester", warmth: 0, formality: -0.5 },
  { id: "tech", label: "Technical", warmth: 0, formality: -0.5 },
  { id: "mesh", label: "Mesh", warmth: -0.5, formality: -1 },
  { id: "rubber", label: "Rubber", warmth: 0, formality: -1 },
  { id: "metal", label: "Metal", warmth: 0, formality: 0.5 },
] as const;

const byId = new Map(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: MaterialId): Material {
  const m = byId.get(id);
  if (!m) throw new Error(`Unknown material: ${id}`);
  return m;
}

export function isMaterialId(value: string): value is MaterialId {
  return byId.has(value as MaterialId);
}
