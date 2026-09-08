import { describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { inspoAnalysisSchema } from "@/lib/inspo/analyze-prompt";
import { tasteOutputSchema } from "@/lib/taste/summarize-prompt";
import { extractJson, stripNulls, toStrictJsonSchema } from "./json-schema";
import { outfitsOutputSchema } from "./outfit-prompt";

type ObjectSchema = {
  type: string;
  properties: Record<string, { type?: unknown; enum?: unknown; anyOf?: unknown }>;
  required: string[];
  additionalProperties: boolean;
};

describe("toStrictJsonSchema", () => {
  it("requires every property and forbids extras", () => {
    const schema = toStrictJsonSchema(
      z.object({ a: z.string(), b: z.number().optional() }),
    ) as unknown as ObjectSchema;

    expect(schema.required).toEqual(["a", "b"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.a.type).toBe("string");
    expect(schema.properties.b.type).toEqual(["number", "null"]);
  });

  it("drops the $schema key strict mode has no use for", () => {
    expect(toStrictJsonSchema(z.object({ a: z.string() }))).not.toHaveProperty("$schema");
  });

  it("makes an optional enum nullable through anyOf, not through its type", () => {
    const schema = toStrictJsonSchema(
      z.object({ kind: z.enum(["one", "two"]).optional() }),
    ) as unknown as ObjectSchema;

    expect(schema.properties.kind.anyOf).toEqual([
      { type: "string", enum: ["one", "two"] },
      { type: "null" },
    ]);
  });

  it("reaches into arrays and nested objects", () => {
    const schema = toStrictJsonSchema(
      z.object({ rows: z.array(z.object({ id: z.string(), note: z.string().optional() })) }),
    ) as unknown as { properties: { rows: { items: ObjectSchema } } };

    const item = schema.properties.rows.items;
    expect(item.required).toEqual(["id", "note"]);
    expect(item.additionalProperties).toBe(false);
    expect(item.properties.note.type).toEqual(["string", "null"]);
  });

  it("converts the three real app schemas without leaving an optional behind", () => {
    for (const schema of [outfitsOutputSchema, tasteOutputSchema, inspoAnalysisSchema]) {
      const converted = toStrictJsonSchema(schema);
      const seen: ObjectSchema[] = [];
      const walk = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== "object" || node === null) return;
        const record = node as Record<string, unknown>;
        if (record.properties) seen.push(record as unknown as ObjectSchema);
        Object.values(record).forEach(walk);
      };
      walk(converted);

      expect(seen.length).toBeGreaterThan(0);
      for (const object of seen) {
        expect(object.additionalProperties).toBe(false);
        expect([...object.required].sort()).toEqual(Object.keys(object.properties).sort());
      }
    }
  });
});

describe("stripNulls", () => {
  it("removes null-valued keys so an optional field reads as absent", () => {
    expect(stripNulls({ a: "x", b: null, c: { d: null, e: 1 } })).toEqual({ a: "x", c: { e: 1 } });
  });

  it("leaves nulls inside arrays alone, for zod to complain about", () => {
    expect(stripNulls({ rows: [null, { a: null, b: 2 }] })).toEqual({ rows: [null, { b: 2 }] });
  });

  it("round-trips a strict answer back into the zod shape", () => {
    const stripped = stripNulls({
      outfits: [
        {
          name: "Quiet Monday",
          top: "t1",
          layer: null,
          outerwear: null,
          bottom: "b1",
          fullbody: null,
          footwear: "f1",
          accessories: [],
          why: "Because.",
          tip: null,
        },
      ],
    });
    const parsed = outfitsOutputSchema.safeParse(stripped);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.outfits[0].tip).toBeUndefined();
  });
});

describe("extractJson", () => {
  it("parses a bare object", () => {
    expect(extractJson('{"ok": true}')).toEqual({ ok: true });
  });

  it("survives a ```json fence", () => {
    expect(extractJson('```json\n{"ok": true}\n```')).toEqual({ ok: true });
    expect(extractJson('```\n{"ok": true}\n```')).toEqual({ ok: true });
  });

  it("survives a sentence in front of the object", () => {
    expect(extractJson('Here you go:\n{"ok": true}\nHope that helps.')).toEqual({ ok: true });
  });

  it("throws when there is no object at all", () => {
    expect(() => extractJson("")).toThrow();
    expect(() => extractJson("sorry, I cannot help with that")).toThrow();
  });
});
