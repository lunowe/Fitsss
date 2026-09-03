import { beforeEach, describe, expect, it, vi } from "vitest";
import { paletteToBlockColor } from "@/domain";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  requireUser: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/session", () => ({ requireUser: mocks.requireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("server-only", () => ({}));

import { createBlocks } from "./blocks";
import { rowToBlock } from "./blocks-queries";

const now = new Date("2026-01-02T03:04:05.000Z");
const white = paletteToBlockColor("white");

const row = {
  id: "7a34c182-2d98-4472-9b49-2194175755de",
  userId: "user-1",
  typeId: "t-shirt",
  category: "top",
  color: white,
  secondaryColor: null,
  fit: "relaxed",
  variant: null,
  material: "cotton",
  pattern: "solid",
  weight: null,
  effectiveWeight: "light",
  quantity: 1,
  nickname: null,
  notes: null,
  warmth: 1,
  formality: 2,
  seasons: ["spring", "summer"],
  label: "white relaxed cotton t-shirt",
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
};

describe("rowToBlock", () => {
  it("maps nullable database columns to optional domain fields", () => {
    const block = rowToBlock(row);

    expect(block).toMatchObject({
      id: row.id,
      userId: "user-1",
      color: white,
      secondaryColor: undefined,
      variant: undefined,
      weight: undefined,
      archivedAt: null,
    });
    expect(block.createdAt).toBe(now);
  });
});

describe("createBlocks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({ id: "user-1", email: "dev@fitsss.local", name: "Dev" });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        insert: () => ({
          values: () => ({ returning: async () => [row] }),
        }),
      }),
    );
  });

  it("returns created blocks alongside indexed validation failures", async () => {
    const result = await createBlocks([
      {
        typeId: "t-shirt",
        color: white,
        fit: "relaxed",
        material: "cotton",
        pattern: "solid",
        quantity: 1,
      },
      { typeId: "not-real", color: white, fit: "regular" },
    ]);

    expect(result.created).toHaveLength(1);
    expect(result.failed).toEqual([
      {
        index: 1,
        errors: ["typeId: unknown piece type"],
      },
    ]);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/closet");
  });
});
