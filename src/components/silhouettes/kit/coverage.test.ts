import { describe, expect, it } from "vitest";

import { CATALOG } from "@/domain/catalog";

import { KIT, kitKey } from ".";

// Every built-in piece draws from the kit: the type itself, each variant as
// its own object, and each fit (fits may share a drawing).
describe("kit coverage", () => {
  for (const type of CATALOG) {
    it(type.id, () => {
      expect(kitKey(type.id), "bare type").toBeDefined();
      for (const variant of type.variantOptions ?? []) {
        expect(KIT[`${type.id}~${variant}`], `variant ${variant}`).toBeDefined();
      }
      for (const fit of type.fitOptions ?? []) {
        expect(kitKey(type.id, undefined, fit), `fit ${fit}`).toBeDefined();
      }
    });
  }
});
