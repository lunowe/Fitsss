import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a text colour next to a type role", () => {
    expect(cn("text-subhead text-primary-foreground")).toBe("text-subhead text-primary-foreground");
    expect(cn("text-headline text-tint")).toBe("text-headline text-tint");
  });

  it("lets a later type role replace an earlier one", () => {
    expect(cn("text-headline", "text-subhead")).toBe("text-subhead");
  });

  it("still merges real conflicts", () => {
    expect(cn("px-4", "px-3")).toBe("px-3");
    expect(cn("text-label", "text-destructive")).toBe("text-destructive");
  });
});
