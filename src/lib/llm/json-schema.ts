import * as z from "zod/v4";

/**
 * Zod → the JSON Schema dialect that OpenAI-compatible `strict` structured
 * output accepts.
 *
 * `z.toJSONSchema` already emits `additionalProperties: false`, but it also
 * emits an honest `required` list — and strict mode refuses any object whose
 * properties are not *all* required. The accepted way round that is to keep
 * every key required and let the optional ones be null, so this walks the tree
 * and does exactly that. `stripNulls` then undoes it on the way back, which is
 * what lets the same zod schema (with `.optional()`) validate the answer.
 */

export type JsonSchema = Record<string, unknown>;

const SIMPLE_TYPES = new Set(["string", "number", "integer", "boolean"]);

/** `{ type: "string" }` → `{ type: ["string", "null"] }`; anything else → anyOf. */
function nullable(node: unknown): unknown {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return { anyOf: [node, { type: "null" }] };
  }
  const schema = node as JsonSchema;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return schema;
  // An enum cannot simply gain "null" as a type: the enum list would still
  // exclude it, so those go through anyOf like every other composite.
  if (typeof schema.type === "string" && SIMPLE_TYPES.has(schema.type) && !("enum" in schema)) {
    return { ...schema, type: [schema.type, "null"] };
  }
  return { anyOf: [schema, { type: "null" }] };
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk);
  if (typeof node !== "object" || node === null) return node;

  const schema = { ...(node as JsonSchema) };
  delete schema.$schema;

  if (schema.properties && typeof schema.properties === "object") {
    const properties = schema.properties as Record<string, unknown>;
    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as unknown[]).filter((k) => typeof k === "string") : [],
    );

    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      const converted = walk(value);
      next[key] = required.has(key) ? converted : nullable(converted);
    }

    schema.properties = next;
    schema.required = Object.keys(next);
    schema.additionalProperties = false;
    // Strict mode has no use for these and some providers reject them outright.
    delete schema.default;
  }

  for (const key of ["items", "$defs", "definitions", "anyOf", "oneOf", "allOf", "prefixItems"]) {
    if (key in schema) schema[key] = walk(schema[key]);
  }

  return schema;
}

/**
 * The `schema` half of `response_format.json_schema`. Always an object at the
 * root, because that is all strict mode accepts.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const raw = z.toJSONSchema(schema, {
    io: "output",
    // `.optional()` on an output type is what we are rewriting below, so the
    // converter must hand it to us rather than refuse it.
    unrepresentable: "any",
  }) as JsonSchema;
  return walk(raw) as JsonSchema;
}

/**
 * Deletes every null-valued property, recursively.
 *
 * The strict schema above asks for `"tip": null` where the zod schema says
 * `tip?: string`. Dropping the key turns the answer back into the shape the
 * zod schema describes. Nulls inside arrays are left alone — an array of nulls
 * is a real answer, and zod is the one that should complain about it.
 */
export function stripNulls<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => stripNulls(entry)) as unknown as T;
  if (typeof value !== "object" || value === null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null) continue;
    out[key] = stripNulls(entry);
  }
  return out as T;
}

/**
 * Pulls the JSON object out of a model's answer.
 *
 * Most models honour `response_format` and return bare JSON, but a fenced
 * ```json block or a sentence in front of the object is common enough from the
 * smaller ones that it is worth surviving rather than failing the generation.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty answer");

  const fenced = /^```(?:json|JSON)?\s*\n([\s\S]*?)\n?```\s*$/.exec(trimmed);
  const body = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(body);
  } catch {
    // Fall through to the brace scan below.
  }

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1));

  throw new Error("no JSON object in the answer");
}
