import { getPieceType, isGarment } from "./catalog";
import { normalizeHex } from "./colors";
import { isMaterialId } from "./materials";
import {
  COLOR_FAMILIES,
  PATTERNS,
  WEIGHTS,
  type BlockColor,
  type BlockInput,
  type Pattern,
  type Weight,
} from "./types";

export type ValidationResult =
  | { ok: true; value: BlockInput }
  | { ok: false; errors: string[] };

function validateColor(raw: unknown, field: string, errors: string[]): BlockColor | undefined {
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${field}: expected an object`);
    return undefined;
  }
  const c = raw as Record<string, unknown>;
  const hex = typeof c.hex === "string" ? normalizeHex(c.hex) : null;
  if (!hex) errors.push(`${field}.hex: expected #rrggbb`);
  const name = typeof c.name === "string" ? c.name.trim().slice(0, 40) : "";
  if (!name) errors.push(`${field}.name: required`);
  const family = c.family;
  if (typeof family !== "string" || !(COLOR_FAMILIES as readonly string[]).includes(family)) {
    errors.push(`${field}.family: invalid`);
  }
  if (!hex || !name) return undefined;
  const out: BlockColor = { name, hex, family: family as BlockColor["family"] };
  if (typeof c.paletteId === "string") out.paletteId = c.paletteId;
  return out;
}

/**
 * Validates untrusted input (form data, JSON) into a BlockInput.
 * Enforces the catalog's per-type vocabularies so the closet stays consistent.
 */
export function validateBlockInput(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, errors: ["expected an object"] };
  const r = raw as Record<string, unknown>;

  const type = typeof r.typeId === "string" ? getPieceType(r.typeId) : undefined;
  if (!type) errors.push("typeId: unknown piece type");

  const color = validateColor(r.color, "color", errors);
  const secondaryColor =
    r.secondaryColor === undefined || r.secondaryColor === null
      ? undefined
      : validateColor(r.secondaryColor, "secondaryColor", errors);

  let fit: string | undefined;
  let variant: string | undefined;
  if (type) {
    if (isGarment(type)) {
      if (typeof r.fit !== "string" || !type.fitOptions!.includes(r.fit)) {
        errors.push(`fit: must be one of ${type.fitOptions!.join(", ")}`);
      } else fit = r.fit;
    } else {
      if (typeof r.variant !== "string" || !type.variantOptions!.includes(r.variant)) {
        errors.push(`variant: must be one of ${type.variantOptions!.join(", ")}`);
      } else variant = r.variant;
    }
  }

  let material: BlockInput["material"];
  if (r.material !== undefined && r.material !== null && r.material !== "") {
    if (typeof r.material !== "string" || !isMaterialId(r.material)) {
      errors.push("material: unknown material");
    } else if (type && !type.materialOptions.includes(r.material)) {
      errors.push(`material: not valid for ${type.label}`);
    } else material = r.material;
  }

  const pattern: Pattern = typeof r.pattern === "string" && (PATTERNS as readonly string[]).includes(r.pattern)
    ? (r.pattern as Pattern)
    : "solid";
  if (type && pattern !== "solid" && !type.patternOptions.includes(pattern)) {
    errors.push(`pattern: not valid for ${type.label}`);
  }

  let weight: Weight | undefined;
  if (r.weight !== undefined && r.weight !== null) {
    if (typeof r.weight !== "string" || !(WEIGHTS as readonly string[]).includes(r.weight)) {
      errors.push("weight: must be light, mid or heavy");
    } else weight = r.weight as Weight;
  }

  let quantity = 1;
  if (r.quantity !== undefined && r.quantity !== null) {
    const q = Number(r.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 99) errors.push("quantity: must be an integer from 1 to 99");
    else quantity = q;
  }

  const nickname = typeof r.nickname === "string" && r.nickname.trim() ? r.nickname.trim().slice(0, 60) : undefined;
  const notes = typeof r.notes === "string" && r.notes.trim() ? r.notes.trim().slice(0, 500) : undefined;

  if (errors.length || !type || !color) return { ok: false, errors };

  const value: BlockInput = { typeId: type.id, color, pattern, quantity };
  if (secondaryColor) value.secondaryColor = secondaryColor;
  if (fit) value.fit = fit;
  if (variant) value.variant = variant;
  if (material) value.material = material;
  if (weight) value.weight = weight;
  if (nickname) value.nickname = nickname;
  if (notes) value.notes = notes;
  return { ok: true, value };
}
