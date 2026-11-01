import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The native app reaches the closet only through `/api/v1`. These run the real
 * route handlers against the real database (the dev one from `.env.local`)
 * with two throwaway users and check what a silent bug would cost most:
 * one user reading or changing the other's data, edits that store something
 * other than what they report, and retried saves that store pieces twice.
 *
 * Only the session lookup is faked, to choose who is asking. Skipped when no
 * database is configured.
 */

config({ path: ".env.local", quiet: true });

type TestUser = { id: string; email: string; name: string };
const asking = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; name: string },
  /** Set to simulate another user's request swapping its catalog in while a read waits. */
  swapCatalogMidRequest: false,
  /** Whether the owner's custom type was in the catalog when each closet match ran. */
  ringKnownAtMatch: [] as boolean[],
  /** The weather service down, for trips. */
  weatherDown: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// The taste refresh runs after the response; here there is no response, and
// no model should be called from a test.
vi.mock("next/server", () => ({ after: () => {} }));
// Another tenant's request applying its own catalog during an await, the
// race a process-global catalog registry invites.
vi.mock("@/server/settings-queries", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/settings-queries")>();
  return {
    ...real,
    getLlmSettingsForUser: async (userId: string) => {
      const settings = await real.getLlmSettingsForUser(userId);
      if (asking.swapCatalogMidRequest) (await import("@/domain")).clearCatalogExtension();
      return settings;
    },
  };
});
vi.mock("@/lib/inspo", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/inspo")>();
  const { getPieceType } = await import("@/domain");
  return {
    ...real,
    matchInspoToCloset: (...args: Parameters<typeof real.matchInspoToCloset>) => {
      asking.ringKnownAtMatch.push(getPieceType("v1-ring") !== undefined);
      return real.matchInspoToCloset(...args);
    },
  };
});
// Trips read the weather and search places over the network; tests never do.
vi.mock("@/server/trip-weather", () => ({
  tripWeather: async (_place: unknown, dates: string[]) =>
    asking.weatherDown
      ? { ok: false, error: "The weather is down." }
      : {
          ok: true,
          days: dates.map((date) => ({ date, tempC: 18, lowC: 11, condition: "cloudy", precipitationChance: 20, source: "typical" })),
        },
}));
vi.mock("@/server/places", () => ({
  searchPlaces: async () => ({
    ok: true,
    places: [{ name: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.72, lon: -9.14, timezone: "Europe/Lisbon" }],
  }),
}));
vi.mock("@/lib/session", () => ({
  getSession: async () => (asking.user ? { user: asking.user } : null),
  isAdmin: async () => false,
}));

const run = Boolean(process.env.DATABASE_URL);
const stamp = Date.now();
const owner: TestUser = { id: `v1-owner-${stamp}`, email: `v1-owner-${stamp}@fitsss.test`, name: "Owner" };
const intruder: TestUser = { id: `v1-intruder-${stamp}`, email: `v1-intruder-${stamp}@fitsss.test`, name: "Intruder" };
/** Owns only what the trip tests give them, so the suitcase is predictable. */
const traveler: TestUser = { id: `v1-traveler-${stamp}`, email: `v1-traveler-${stamp}@fitsss.test`, name: "Traveler" };

const white = { name: "White", hex: "#ffffff", family: "neutral", paletteId: "white" };
const navy = { name: "Navy", hex: "#1f2a44", family: "blue", paletteId: "navy" };
const tee = { typeId: "t-shirt", color: white, fit: "regular", pattern: "solid", quantity: 1 };

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

let item: typeof import("./blocks/[id]/route");
let archive: typeof import("./blocks/[id]/archive/route");
let collection: typeof import("./blocks/route");
let catalog: typeof import("./catalog/route");
let looksRoute: typeof import("./looks/route");
let lookRoute: typeof import("./looks/[id]/route");
let wearRoute: typeof import("./looks/[id]/wear/route");
let stylesRoute: typeof import("./styles/route");
let styleRoute: typeof import("./styles/[id]/route");
let orderRoute: typeof import("./styles/order/route");
let latestRoute: typeof import("./generations/latest/route");
let swapRoute: typeof import("./generations/[id]/swap/route");
let savesRoute: typeof import("./blocks/saves/[key]/route");
let abandonRoute: typeof import("./blocks/saves/[key]/abandon/route");
let eventsRoute: typeof import("./outfit-events/route");
let weatherRoute: typeof import("./weather/route");
let generationsRoute: typeof import("./generations/route");
let insposRoute: typeof import("./inspos/route");
let inspoRoute: typeof import("./inspos/[id]/route");
let inspoImageRoute: typeof import("./inspos/[id]/image/route");
let analyzeRoute: typeof import("./inspos/[id]/analyze/route");
let restyleRoute: typeof import("./inspos/[id]/restyle/route");
let tasteRoute: typeof import("./taste/route");
let tasteRefreshRoute: typeof import("./taste/refresh/route");
let tasteLinesRoute: typeof import("./taste/lines/route");
let tasteLineRoute: typeof import("./taste/lines/[lineId]/route");
let llmRoute: typeof import("./settings/llm/route");
let llmTestRoute: typeof import("./settings/llm/test/route");
let tripsRoute: typeof import("./trips/route");
let tripRoute: typeof import("./trips/[id]/route");
let tripPlanRoute: typeof import("./trips/[id]/plan/route");
let tripSwapRoute: typeof import("./trips/[id]/swap/route");
let placesRoute: typeof import("./places/route");

/** A real PNG, `seed` making each one's bytes (and so its hash) different. */
function png(seed: number, width = 2, height = 3): Uint8Array<ArrayBuffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { crc32, deflateSync } = require("node:zlib") as typeof import("node:zlib");
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed) >>> 0);
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolor
  const rows = Buffer.alloc(height * (1 + width * 3), seed % 256);
  for (let y = 0; y < height; y++) rows[y * (1 + width * 3)] = 0; // filter: none
  return Uint8Array.from(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("tEXt", Buffer.from(`seed\0${seed}-${stamp}`, "latin1")),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

async function upload(as: TestUser, bytes: Uint8Array<ArrayBuffer>, type = "image/png", query = "") {
  asking.user = as;
  return insposRoute.POST(
    new Request(`http://test/api/v1/inspos${query}`, { method: "POST", headers: { "content-type": type }, body: bytes }),
    undefined as never,
  );
}

async function onInspo<P extends Record<string, string>>(
  handler: (request: Request, context: { params: Promise<P> }) => Promise<Response>,
  as: TestUser,
  path: string,
  params: P,
  method = "GET",
  body?: unknown,
) {
  asking.user = as;
  return handler(request(path, method, body), { params: Promise.resolve(params) });
}

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://test${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function onPiece(handler: Handler, as: TestUser | null, id: string, method: string, body?: unknown) {
  asking.user = as;
  return handler(request(`/api/v1/blocks/${id}`, method, body), { params: Promise.resolve({ id }) });
}

async function save(as: TestUser, body: unknown, headers: Record<string, string> = {}) {
  asking.user = as;
  return collection.POST(request("/api/v1/blocks", "POST", body, headers), undefined as never);
}

async function countPieces(userId: string) {
  const { db } = await import("@/db");
  const { blocks } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  return (await db.select({ id: blocks.id }).from(blocks).where(eq(blocks.userId, userId))).length;
}

describe.skipIf(!run)("/api/v1", () => {
  beforeAll(async () => {
    const { db } = await import("@/db");
    const { customCategories, customPieceTypes, user } = await import("@/db/schema");
    await db.insert(user).values([owner, intruder, traveler]);
    // The owner has a catalog of their own; the intruder must never see it.
    await db.insert(customCategories).values({ userId: owner.id, slug: "v1-jewelry", label: "V1 Jewelry", role: "accessory" });
    await db.insert(customPieceTypes).values({
      userId: owner.id,
      slug: "v1-ring",
      categoryId: "v1-jewelry",
      role: "accessory",
      label: "V1 Ring",
      plural: "V1 Rings",
      variantOptions: ["band"],
      materialOptions: ["metal"],
      patternOptions: ["solid"],
      suggestedColors: ["grey"],
      defaultWeight: "light",
      baseWarmth: 1,
      baseFormality: 3,
    });

    item = await import("./blocks/[id]/route");
    archive = await import("./blocks/[id]/archive/route");
    collection = await import("./blocks/route");
    catalog = await import("./catalog/route");
    looksRoute = await import("./looks/route");
    lookRoute = await import("./looks/[id]/route");
    wearRoute = await import("./looks/[id]/wear/route");
    stylesRoute = await import("./styles/route");
    styleRoute = await import("./styles/[id]/route");
    orderRoute = await import("./styles/order/route");
    latestRoute = await import("./generations/latest/route");
    swapRoute = await import("./generations/[id]/swap/route");
    savesRoute = await import("./blocks/saves/[key]/route");
    abandonRoute = await import("./blocks/saves/[key]/abandon/route");
    eventsRoute = await import("./outfit-events/route");
    weatherRoute = await import("./weather/route");
    generationsRoute = await import("./generations/route");
    insposRoute = await import("./inspos/route");
    inspoRoute = await import("./inspos/[id]/route");
    inspoImageRoute = await import("./inspos/[id]/image/route");
    analyzeRoute = await import("./inspos/[id]/analyze/route");
    restyleRoute = await import("./inspos/[id]/restyle/route");
    tasteRoute = await import("./taste/route");
    tasteRefreshRoute = await import("./taste/refresh/route");
    tasteLinesRoute = await import("./taste/lines/route");
    tasteLineRoute = await import("./taste/lines/[lineId]/route");
    llmRoute = await import("./settings/llm/route");
    llmTestRoute = await import("./settings/llm/test/route");
    tripsRoute = await import("./trips/route");
    tripRoute = await import("./trips/[id]/route");
    tripPlanRoute = await import("./trips/[id]/plan/route");
    tripSwapRoute = await import("./trips/[id]/swap/route");
    placesRoute = await import("./places/route");
  }, 120_000);

  afterAll(async () => {
    if (!run) return;
    const { db } = await import("@/db");
    const { user } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    // Blocks, custom catalog and idempotency rows cascade with the users.
    await db.delete(user).where(inArray(user.id, [owner.id, intruder.id, traveler.id]));
  }, 60_000);

  describe("tenant isolation", () => {
    let pieceId = "";

    beforeAll(async () => {
      const created = await save(owner, tee);
      expect(created.status).toBe(201);
      pieceId = (await created.json()).data.created[0].id;
    }, 60_000);

    it("answers 401 without a session", async () => {
      asking.user = null;
      expect((await collection.GET(request("/api/v1/blocks"), undefined as never)).status).toBe(401);
    });

    it("does not list another user's pieces", async () => {
      asking.user = intruder;
      const response = await collection.GET(request("/api/v1/blocks?includeArchived=true"), undefined as never);
      const { data } = await response.json();
      expect(data.map((b: { id: string }) => b.id)).not.toContain(pieceId);
    });

    it("refuses every per-piece operation from another user with 404", async () => {
      expect((await onPiece(item.GET, intruder, pieceId, "GET")).status).toBe(404);
      expect((await onPiece(item.PATCH, intruder, pieceId, "PATCH", { ...tee, fit: "relaxed" })).status).toBe(404);
      expect((await onPiece(archive.POST, intruder, pieceId, "POST")).status).toBe(404);
      expect((await onPiece(archive.DELETE, intruder, pieceId, "DELETE")).status).toBe(404);
      expect((await onPiece(item.DELETE, intruder, pieceId, "DELETE")).status).toBe(404);

      const response = await onPiece(item.GET, owner, pieceId, "GET");
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.fit).toBe("regular");
      expect(data.archivedAt).toBeNull();
    });

    // The catalog registry is process-global; requests for two users that
    // interleave must still each get their own catalog.
    it("keeps custom catalogs apart under concurrent requests", async () => {
      const ask = async (as: TestUser) => {
        asking.user = as;
        const response = await catalog.GET(request("/api/v1/catalog"), undefined as never);
        const { data } = await response.json();
        return { as, ids: data.types.map((t: { id: string }) => t.id) as string[] };
      };
      const answers = await Promise.all(
        Array.from({ length: 24 }, (_, index) => ask(index % 2 ? intruder : owner)),
      );
      for (const { as, ids } of answers) {
        expect(ids.includes("v1-ring")).toBe(as === owner);
      }
    }, 60_000);
  });

  describe("control characters", () => {
    // Postgres refuses NUL in text; it used to surface as a 500, which the
    // app has to treat as "outcome unknown".
    it("strips NUL from piece text instead of failing", async () => {
      const response = await save(owner, { ...tee, nickname: "Nul\u0000nick", notes: "a\u0000b", color: { ...white, name: "Wh\u0000ite" } });
      expect(response.status).toBe(201);
      const stored = (await response.json()).data.created[0];
      expect(stored.nickname).toBe("Nulnick");
      expect(stored.notes).toBe("ab");
      expect(stored.color.name).toBe("White");
    });

    it("strips NUL from styles and look names", async () => {
      asking.user = owner;
      const style = await stylesRoute.POST(
        request("/api/v1/styles", "POST", { name: "N\u0000ul", description: "d\u0000", rules: "r\u0000" }),
        undefined as never,
      );
      expect(style.status).toBe(201);
      expect((await style.json()).data.name).toBe("Nul");
    });
  });

  describe("PATCH replaces the whole piece", () => {
    it("clears every optional attribute that is left out, and derives from what is stored", async () => {
      const full = {
        ...tee,
        secondaryColor: navy,
        material: "linen",
        weight: "heavy",
        nickname: "Holiday",
        notes: "Slightly see-through",
        quantity: 2,
      };
      const created = await save(owner, full);
      const id = (await created.json()).data.created[0].id;

      const patched = await onPiece(item.PATCH, owner, id, "PATCH", tee);
      expect(patched.status).toBe(200);
      const reported = (await patched.json()).data;

      const stored = (await (await onPiece(item.GET, owner, id, "GET")).json()).data;
      for (const field of ["secondaryColor", "material", "weight", "nickname", "notes"]) {
        expect(stored[field], field).toBeUndefined();
      }
      expect(stored.quantity).toBe(1);
      expect(stored.label).toBe(reported.label);
      expect(stored.label).not.toContain("linen");
      expect(stored.effectiveWeight).toBe("light");
    });
  });

  describe("idempotent saves", () => {
    it("replays a repeated save instead of storing it twice", async () => {
      const before = await countPieces(owner.id);
      const key = `test-${stamp}-replay`;
      const first = await save(owner, [tee, { ...tee, fit: "relaxed" }], { "Idempotency-Key": key });
      const second = await save(owner, [tee, { ...tee, fit: "relaxed" }], { "Idempotency-Key": key });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.headers.get("Idempotent-Replayed")).toBe("true");
      const ids = (r: { data: { created: { id: string }[] } }) => r.data.created.map((b) => b.id);
      expect(ids(await second.json())).toEqual(ids(await first.json()));
      expect(await countPieces(owner.id)).toBe(before + 2);
    });

    it("stores concurrent repeats once", async () => {
      const before = await countPieces(owner.id);
      const key = `test-${stamp}-race`;
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => save(owner, tee, { "Idempotency-Key": key })),
      );
      expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await countPieces(owner.id)).toBe(before + 1);
    }, 60_000);

    it("treats the same values in a different key order as the same save", async () => {
      const key = `test-${stamp}-order`;
      const reordered = { quantity: 1, pattern: "solid", fit: "regular", color: { paletteId: "white", family: "neutral", hex: "#ffffff", name: "White" }, typeId: "t-shirt" };
      expect((await save(owner, [tee], { "Idempotency-Key": key })).status).toBe(201);
      const again = await save(owner, [reordered], { "Idempotency-Key": key });
      expect(again.status).toBe(201);
      expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    });

    it("refuses a key reused for a different save", async () => {
      const key = `test-${stamp}-reuse`;
      expect((await save(owner, tee, { "Idempotency-Key": key })).status).toBe(201);
      // 409, not 422: a save with this key exists, so this is not "nothing was stored".
      expect((await save(owner, { ...tee, fit: "boxy" }, { "Idempotency-Key": key })).status).toBe(409);
    });

    it("replays a stored save even when its input no longer validates", async () => {
      const key = `test-${stamp}-catalog`;
      const ring = { typeId: "v1-ring", color: white, variant: "band", pattern: "solid", quantity: 1 };
      expect((await save(owner, ring, { "Idempotency-Key": key })).status).toBe(201);

      // The custom type is deleted after the save, so the same input is now invalid.
      const { db } = await import("@/db");
      const { customPieceTypes } = await import("@/db/schema");
      const { invalidateCatalogExtension } = await import("@/server/catalog-queries");
      const { and, eq } = await import("drizzle-orm");
      const [type] = await db
        .delete(customPieceTypes)
        .where(and(eq(customPieceTypes.userId, owner.id), eq(customPieceTypes.slug, "v1-ring")))
        .returning();
      invalidateCatalogExtension(owner.id);

      const again = await save(owner, ring, { "Idempotency-Key": key });
      expect(again.status).toBe(201);
      expect(again.headers.get("Idempotent-Replayed")).toBe("true");
      expect((await save(owner, ring)).status).toBe(422);

      await db.insert(customPieceTypes).values({ ...type, id: undefined, createdAt: undefined, updatedAt: undefined });
      invalidateCatalogExtension(owner.id);
    });

    it("answers whether a key was stored, per user", async () => {
      const key = `test-${stamp}-lookup`;
      const first = await (await save(owner, tee, { "Idempotency-Key": key })).json();
      const lookup = (as: TestUser, k: string) => {
        asking.user = as;
        return savesRoute.GET(request(`/api/v1/blocks/saves/${k}`), { params: Promise.resolve({ key: k }) });
      };

      const stored = await lookup(owner, key);
      expect(stored.status).toBe(200);
      expect((await stored.json()).data.created.map((b: { id: string }) => b.id)).toEqual(
        first.data.created.map((b: { id: string }) => b.id),
      );
      expect((await lookup(owner, `test-${stamp}-never-sent`)).status).toBe(404);
      expect((await lookup(intruder, key)).status).toBe(404);
    });

    async function abandon(as: TestUser, key: string) {
      asking.user = as;
      const response = await abandonRoute.POST(request(`/api/v1/blocks/saves/${key}/abandon`, "POST"), {
        params: Promise.resolve({ key }),
      });
      expect(response.status).toBe(200);
      return (await response.json()).data.stored as null | { created: { id: string }[] };
    }

    it("abandoning a key that never stored refuses every later send with it", async () => {
      const key = `test-${stamp}-abandoned`;
      const before = await countPieces(owner.id);
      expect(await abandon(owner, key)).toBeNull();

      const late = await save(owner, tee, { "Idempotency-Key": key });
      expect(late.status).toBe(409);
      expect(await countPieces(owner.id)).toBe(before);
    });

    it("abandoning a key that stored answers with what it stored", async () => {
      const key = `test-${stamp}-abandon-stored`;
      const first = await (await save(owner, tee, { "Idempotency-Key": key })).json();
      const stored = await abandon(owner, key);
      expect(stored?.created.map((b) => b.id)).toEqual(first.data.created.map((b: { id: string }) => b.id));
    });

    // Regression: put back used to read a plain lookup's 404 as "never
    // stored" while the save was still on its way, and the piece was stored
    // twice. A save and an abandon of one key now have exactly one outcome.
    it("a save racing an abandon of its key stores at most once, and the abandon knows which", async () => {
      for (let round = 0; round < 6; round++) {
        const key = `test-${stamp}-race-${round}`;
        const before = await countPieces(owner.id);
        const sending = save(owner, tee, { "Idempotency-Key": key });
        const stored = await abandon(owner, key);
        await sending;
        expect(await countPieces(owner.id)).toBe(before + (stored ? 1 : 0));
      }
    }, 60_000);

    it("treats null and a missing field as the same save", async () => {
      const key = `test-${stamp}-null`;
      expect((await save(owner, { ...tee, notes: null }, { "Idempotency-Key": key })).status).toBe(201);
      const again = await save(owner, tee, { "Idempotency-Key": key });
      expect(again.headers.get("Idempotent-Replayed")).toBe("true");
    });

    it("refuses a body nested too deep instead of failing", async () => {
      let deep: unknown = tee;
      for (let i = 0; i < 40; i++) deep = { nested: deep };
      expect((await save(owner, deep, { "Idempotency-Key": `test-${stamp}-deep` })).status).toBe(422);
    });

    it("caps one save at 500 pieces", async () => {
      expect((await save(owner, Array.from({ length: 501 }, () => tee))).status).toBe(422);
    });

    it("keeps keys per user", async () => {
      const key = `test-${stamp}-shared`;
      expect((await save(owner, tee, { "Idempotency-Key": key })).status).toBe(201);
      const theirs = await save(intruder, tee, { "Idempotency-Key": key });
      expect(theirs.status).toBe(201);
      expect(theirs.headers.get("Idempotent-Replayed")).toBeNull();
      expect(await countPieces(intruder.id)).toBe(1);
    });
  });

  describe("outfits, looks and styles stay per user", () => {
    let generationId = "";
    let lookId = "";
    let styleId = "";
    let pieces: { top: string; bottom: string; footwear: string } = { top: "", bottom: "", footwear: "" };
    let intruderTee = "";

    async function call(handler: Handler, as: TestUser, path: string, id: string, method: string, body?: unknown) {
      asking.user = as;
      return handler(request(path, method, body), { params: Promise.resolve({ id }) });
    }

    beforeAll(async () => {
      const created = await save(owner, [
        tee,
        { typeId: "jeans", color: navy, fit: "straight", pattern: "solid", quantity: 1 },
        { typeId: "sneakers", color: white, variant: "low-top", pattern: "solid", quantity: 1 },
      ]);
      const [top, bottom, footwear] = (await created.json()).data.created.map((b: { id: string }) => b.id);
      pieces = { top, bottom, footwear };
      intruderTee = (await (await save(intruder, tee)).json()).data.created[0].id;

      // A stored generation, as the model would have left it (no model call in tests).
      const { db } = await import("@/db");
      const { generations } = await import("@/db/schema");
      const [row] = await db
        .insert(generations)
        .values({
          userId: owner.id,
          request: { occasion: "everyday", weather: { tempC: 18, condition: "clear", source: "manual" }, count: 1, pinned: [], excluded: [] },
          outfits: [{ id: "o1", name: "Test", slots: { ...pieces, accessories: [] }, why: "Because." }],
          model: "test",
        })
        .returning({ id: generations.id });
      generationId = row.id;

      asking.user = owner;
      const look = await looksRoute.POST(
        request("/api/v1/looks", "POST", {
          outfit: { id: "o1", name: "Test look", slots: { ...pieces, accessories: [] }, why: "Because." },
          occasion: "everyday",
          generationId,
        }),
        undefined as never,
      );
      expect(look.status).toBe(201);
      lookId = (await look.json()).data.id;

      const style = await stylesRoute.POST(
        request("/api/v1/styles", "POST", { name: "V1 Style", description: "Clean and simple" }),
        undefined as never,
      );
      expect(style.status).toBe(201);
      styleId = (await style.json()).data.id;
    }, 120_000);

    it("keeps looks to their owner", async () => {
      asking.user = intruder;
      const listed = await (await looksRoute.GET(request("/api/v1/looks"), undefined as never)).json();
      expect(listed.data.map((l: { id: string }) => l.id)).not.toContain(lookId);

      expect((await call(lookRoute.GET, intruder, `/api/v1/looks/${lookId}`, lookId, "GET")).status).toBe(404);
      expect((await call(lookRoute.PATCH, intruder, `/api/v1/looks/${lookId}`, lookId, "PATCH", { name: "Mine now" })).status).toBe(404);
      expect((await call(wearRoute.POST, intruder, `/api/v1/looks/${lookId}/wear`, lookId, "POST")).status).toBe(404);
      expect((await call(lookRoute.DELETE, intruder, `/api/v1/looks/${lookId}`, lookId, "DELETE")).status).toBe(404);

      const mine = await (await call(lookRoute.GET, owner, `/api/v1/looks/${lookId}`, lookId, "GET")).json();
      expect(mine.data.name).toBe("Test look");
      expect(mine.data.wornCount).toBe(0);
    });

    it("refuses a look built from someone else's pieces", async () => {
      asking.user = intruder;
      const response = await looksRoute.POST(
        request("/api/v1/looks", "POST", {
          outfit: { id: "x", name: "Borrowed", slots: { ...pieces, accessories: [] }, why: "." },
          occasion: "everyday",
        }),
        undefined as never,
      );
      expect(response.status).toBe(422);
    });

    it("keeps styles to their owner", async () => {
      expect((await call(styleRoute.GET, intruder, `/api/v1/styles/${styleId}`, styleId, "GET")).status).toBe(404);
      expect(
        (await call(styleRoute.PATCH, intruder, `/api/v1/styles/${styleId}`, styleId, "PATCH", { name: "Taken", description: "x" })).status,
      ).toBe(404);
      expect((await call(styleRoute.DELETE, intruder, `/api/v1/styles/${styleId}`, styleId, "DELETE")).status).toBe(404);

      asking.user = intruder;
      const reordered = await orderRoute.PUT(request("/api/v1/styles/order", "PUT", { ids: [styleId] }), undefined as never);
      expect((await reordered.json()).data).toEqual([]);

      const mine = await (await call(styleRoute.GET, owner, `/api/v1/styles/${styleId}`, styleId, "GET")).json();
      expect(mine.data.name).toBe("V1 Style");
    });

    it("records feedback with only the user's own references, and refuses junk instead of failing", async () => {
      const { db } = await import("@/db");
      const { outfitEvents } = await import("@/db/schema");
      const { eq, desc } = await import("drizzle-orm");
      const outfit = { id: "o1", name: "Fe\u0000edback \ud800", slots: { ...pieces, accessories: [] }, why: "Because." };
      const post = (as: TestUser, body: unknown) => {
        asking.user = as;
        return eventsRoute.POST(request("/api/v1/outfit-events", "POST", body), undefined as never);
      };

      // Someone else's style, a look deleted elsewhere, a made-up generation: all dropped, not stored.
      const theirs = await post(intruder, {
        type: "liked",
        outfit: { ...outfit, slots: { top: intruderTee, bottom: intruderTee, footwear: intruderTee, accessories: [] } },
        styleId,
        lookId: "00000000-0000-4000-8000-000000000000",
        generationId: "00000000-0000-4000-8000-000000000001",
      });
      expect(theirs.status).toBe(204);
      const [stored] = await db
        .select()
        .from(outfitEvents)
        .where(eq(outfitEvents.userId, intruder.id))
        .orderBy(desc(outfitEvents.createdAt))
        .limit(1);
      expect(stored.styleId).toBeNull();
      expect(stored.lookId).toBeNull();
      expect(stored.generationId).toBeNull();
      expect((stored.outfit as { name: string }).name).toBe("Feedback \uFFFD");

      expect((await post(owner, { type: "disliked", outfit })).status).toBe(422);
      expect((await post(owner, { type: "liked", outfit: { ...outfit, why: "x".repeat(40_000) } })).status).toBe(422);
      expect((await post(owner, { type: "liked", outfit: { ...outfit, slots: { footwear: "nope" } } })).status).toBe(422);
    });

    it("refuses bad coordinates with 422", async () => {
      asking.user = owner;
      for (const query of ["lat=abc&lon=1", "lat=1e999&lon=0", "lat=91&lon=0", "lat=0"]) {
        const response = await weatherRoute.GET(request(`/api/v1/weather?${query}`), undefined as never);
        expect(response.status, query).toBe(422);
      }
    });

    it("keeps generations to their owner, and swaps only own pieces", async () => {
      asking.user = intruder;
      const latest = await (await latestRoute.GET(request("/api/v1/generations/latest"), undefined as never)).json();
      expect(latest.data?.id).not.toBe(generationId);

      const theirs = await call(swapRoute.POST, intruder, `/api/v1/generations/${generationId}/swap`, generationId, "POST", {
        outfitId: "o1",
        slot: "top",
        toBlockId: intruderTee,
      });
      expect(theirs.status).toBe(422);

      const borrowed = await call(swapRoute.POST, owner, `/api/v1/generations/${generationId}/swap`, generationId, "POST", {
        outfitId: "o1",
        slot: "top",
        toBlockId: intruderTee,
      });
      expect(borrowed.status).toBe(422);

      const own = await call(swapRoute.POST, owner, `/api/v1/generations/${generationId}/swap`, generationId, "POST", {
        outfitId: "o1",
        slot: "top",
        toBlockId: pieces.top,
      });
      expect(own.status).toBe(200);
    });
  });

  // The races and retries GPT-6.1-sol's review reproduced; each held only
  // because nothing ran concurrently.
  describe("concurrent writes", () => {
    let top = "";
    let otherTop = "";
    let footwear = "";
    let bottom = "";

    beforeAll(async () => {
      const created = await save(owner, [
        { ...tee, nickname: "race-a" },
        { ...tee, nickname: "race-b" },
        { typeId: "jeans", color: navy, fit: "straight", pattern: "solid", quantity: 1 },
        { typeId: "sneakers", color: white, variant: "low-top", pattern: "solid", quantity: 1 },
      ]);
      [top, otherTop, bottom, footwear] = (await created.json()).data.created.map((b: { id: string }) => b.id);
    }, 60_000);

    async function generationWith(outfits: { id: string }[]) {
      const { db } = await import("@/db");
      const { generations } = await import("@/db/schema");
      const [row] = await db
        .insert(generations)
        .values({
          userId: owner.id,
          request: { occasion: "everyday", weather: { tempC: 18, condition: "clear", source: "manual" }, count: 2, pinned: [], excluded: [] },
          outfits: outfits.map((o) => ({ ...o, name: o.id, slots: { top, bottom, footwear, accessories: [] }, why: "." })),
          model: "test",
        })
        .returning({ id: generations.id });
      return row.id;
    }

    it("keeps both of two concurrent swaps on different cards", async () => {
      const id = await generationWith([{ id: "a" }, { id: "b" }]);
      const swap = (outfitId: string) => {
        asking.user = owner;
        return swapRoute.POST(
          request(`/api/v1/generations/${id}/swap`, "POST", { outfitId, slot: "top", toBlockId: otherTop }),
          { params: Promise.resolve({ id }) },
        );
      };
      const [a, b] = await Promise.all([swap("a"), swap("b")]);
      expect([a.status, b.status]).toEqual([200, 200]);

      const { db } = await import("@/db");
      const { generations } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const [row] = await db.select().from(generations).where(eq(generations.id, id));
      const tops = (row.outfits as { slots: { top: string } }[]).map((o) => o.slots.top);
      expect(tops).toEqual([otherTop, otherTop]);
    });

    it("saves one look for the same outfit sent twice at once, with one taste event", async () => {
      const id = await generationWith([{ id: "dup" }]);
      const body = { outfit: { id: "dup", name: "Dup", slots: { top, bottom, footwear, accessories: [] }, why: "." }, generationId: id };
      asking.user = owner;
      const responses = await Promise.all(
        [0, 1, 2].map(() => looksRoute.POST(request("/api/v1/looks", "POST", body), undefined as never)),
      );
      const ids = await Promise.all(responses.map(async (r) => (await r.json()).data.id));
      expect(new Set(ids).size).toBe(1);

      const { db } = await import("@/db");
      const { outfitEvents } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const events = await db
        .select()
        .from(outfitEvents)
        .where(and(eq(outfitEvents.lookId, ids[0]), eq(outfitEvents.type, "saved")));
      expect(events).toHaveLength(1);
    });

    it("counts one wear for concurrent or repeated wears", async () => {
      const id = await generationWith([{ id: "wear" }]);
      asking.user = owner;
      const saved = await looksRoute.POST(
        request("/api/v1/looks", "POST", { outfit: { id: "wear", name: "Wear", slots: { top, bottom, footwear, accessories: [] }, why: "." }, generationId: id }),
        undefined as never,
      );
      const lookId = (await saved.json()).data.id;
      const wear = () => {
        asking.user = owner;
        return wearRoute.POST(request(`/api/v1/looks/${lookId}/wear`, "POST"), { params: Promise.resolve({ id: lookId }) });
      };
      const results = await Promise.all([wear(), wear(), wear()]);
      expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
      await wear();

      const { db } = await import("@/db");
      const { looks, outfitEvents } = await import("@/db/schema");
      const { and, eq } = await import("drizzle-orm");
      const [look] = await db.select().from(looks).where(eq(looks.id, lookId));
      expect(look.wornCount).toBe(1);
      const events = await db.select().from(outfitEvents).where(and(eq(outfitEvents.lookId, lookId), eq(outfitEvents.type, "worn")));
      expect(events).toHaveLength(1);
    });

    it("never lets concurrent creates pass six styles", async () => {
      asking.user = intruder;
      const responses = await Promise.all(
        Array.from({ length: 9 }, (_, i) =>
          stylesRoute.POST(request("/api/v1/styles", "POST", { name: `Race ${i}`, description: "x" }), undefined as never),
        ),
      );
      expect(responses.filter((r) => r.status === 201)).toHaveLength(6);
      const listed = await (await stylesRoute.GET(request("/api/v1/styles"), undefined as never)).json();
      expect(listed.data).toHaveLength(6);
    });

    it("lets concurrent reorders both finish, the last one winning", async () => {
      asking.user = owner;
      const listed = await (await stylesRoute.GET(request("/api/v1/styles"), undefined as never)).json();
      const ids: string[] = listed.data.map((st: { id: string }) => st.id);
      const reorder = (order: string[]) => {
        asking.user = owner;
        return orderRoute.PUT(request("/api/v1/styles/order", "PUT", { ids: order }), undefined as never);
      };
      for (let round = 0; round < 5; round++) {
        const results = await Promise.all([reorder(ids), reorder([...ids].reverse())]);
        expect(results.map((r) => r.status)).toEqual([200, 200]);
      }
    }, 60_000);

    it("refuses swaps that would store a broken or odd outfit", async () => {
      const { db } = await import("@/db");
      const { blocks } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const id = await generationWith([{ id: "rules" }]);
      const swap = (body: Record<string, unknown>) => {
        asking.user = owner;
        return swapRoute.POST(request(`/api/v1/generations/${id}/swap`, "POST", { outfitId: "rules", ...body }), {
          params: Promise.resolve({ id }),
        });
      };

      // An archived piece can't be swapped in.
      const archived = (await (await save(owner, { ...tee, nickname: "archived-swap" })).json()).data.created[0].id;
      await db.update(blocks).set({ archivedAt: new Date() }).where(eq(blocks.id, archived));
      expect((await swap({ slot: "top", toBlockId: archived })).status).toBe(422);

      // Swapping the footwear for a top would leave the outfit without shoes.
      expect((await swap({ slot: "footwear", toBlockId: otherTop })).status).toBe(422);
    });

    it("refuses a generation with a pin that is no longer in the closet, before any model call", async () => {
      const { db } = await import("@/db");
      const { blocks } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const gone = (await (await save(owner, { ...tee, nickname: "gone-pin" })).json()).data.created[0].id;
      await db.update(blocks).set({ archivedAt: new Date() }).where(eq(blocks.id, gone));

      asking.user = owner;
      const response = await generationsRoute.POST(
        request("/api/v1/generations", "POST", {
          occasion: "everyday",
          weather: { tempC: 18, condition: "clear", source: "manual" },
          count: 1,
          pinned: [gone],
        }),
        undefined as never,
      );
      expect(response.status).toBe(422);
    });

    it("drops another user's style from a stored generation (mock model)", async () => {
      asking.user = intruder;
      const theirStyle = (await (await stylesRoute.GET(request("/api/v1/styles"), undefined as never)).json()).data[0]?.id;
      expect(theirStyle).toBeTruthy();

      asking.user = owner;
      const response = await generationsRoute.POST(
        request("/api/v1/generations", "POST", {
          occasion: "everyday",
          weather: { tempC: 18, condition: "clear", source: "manual" },
          count: 1,
          styleId: theirStyle,
        }),
        undefined as never,
      );
      expect(response.status).toBe(201);
      const generation = (await response.json()).data;
      expect(generation.model).toBe("mock");
      expect(generation.request.styleId).toBeUndefined();
    });

    it("treats a deleted style as gone and names nothing invisible", async () => {
      asking.user = owner;
      const created = await stylesRoute.POST(request("/api/v1/styles", "POST", { name: "Soon gone", description: "x" }), undefined as never);
      const goneId = (await created.json()).data.id;
      await styleRoute.DELETE(request(`/api/v1/styles/${goneId}`, "DELETE"), { params: Promise.resolve({ id: goneId }) });

      asking.user = owner;
      const generated = await generationsRoute.POST(
        request("/api/v1/generations", "POST", {
          occasion: "everyday",
          weather: { tempC: 18, condition: "clear", source: "manual" },
          count: 1,
          styleId: goneId.toUpperCase(),
        }),
        undefined as never,
      );
      expect(generated.status).toBe(201);
      expect((await generated.json()).data.request.styleId).toBeUndefined();

      const id = await generationWith([{ id: "blank" }]);
      asking.user = owner;
      const saved = await looksRoute.POST(
        request("/api/v1/looks", "POST", {
          outfit: { id: "blank", name: "\u200B\u2060", slots: { top, bottom, footwear, accessories: [] }, why: "." },
          generationId: id,
        }),
        undefined as never,
      );
      expect((await saved.json()).data.name).toBe("Look");
    });

    it("only lets clients send likes and dislikes", async () => {
      asking.user = owner;
      const outfit = { id: "o", name: "x", slots: { top, bottom, footwear, accessories: [] }, why: "." };
      for (const type of ["saved", "worn", "swapped", "unsaved"]) {
        const response = await eventsRoute.POST(request("/api/v1/outfit-events", "POST", { type, outfit }), undefined as never);
        expect(response.status, type).toBe(422);
      }
    });

    it("stores no weather it can't show", async () => {
      const id = await generationWith([{ id: "hot" }]);
      asking.user = owner;
      const saved = await looksRoute.POST(
        request("/api/v1/looks", "POST", {
          outfit: { id: "hot", name: "Hot", slots: { top, bottom, footwear, accessories: [] }, why: "." },
          generationId: id,
          weather: { tempC: 1e100, condition: "clear", source: "manual" },
        }),
        undefined as never,
      );
      expect((await saved.json()).data.weather).toBeNull();
    });
  });

  describe("inspo and taste stay per user", () => {
    let inspoId = "";
    let ownerStyle = "";
    let intruderStyle = "";
    let slots = { top: "", bottom: "", footwear: "", accessories: [] as string[] };

    beforeAll(async () => {
      const created = await save(owner, [
        tee,
        { typeId: "jeans", color: navy, fit: "straight", pattern: "solid", quantity: 1 },
        { typeId: "sneakers", color: white, variant: "low-top", pattern: "solid", quantity: 1 },
      ]);
      const [top, bottom, footwear] = (await created.json()).data.created.map((b: { id: string }) => b.id);
      slots = { top, bottom, footwear, accessories: [] };

      const added = await upload(owner, png(1), "image/png", "?sourceUrl=https%3A%2F%2Fpin.it%2Fabc");
      expect(added.status).toBe(201);
      inspoId = (await added.json()).data.id;

      // Earlier tests may have filled either user's six style slots.
      const { db } = await import("@/db");
      const { styles } = await import("@/db/schema");
      const [mine, theirs] = await db
        .insert(styles)
        .values([
          { userId: owner.id, name: "Inspo style", description: "x", sortOrder: 90 },
          { userId: intruder.id, name: "Theirs", description: "x", sortOrder: 90 },
        ])
        .returning({ id: styles.id });
      ownerStyle = mine.id;
      intruderStyle = theirs.id;
    }, 120_000);

    it("stores an upload unread, with a v1 picture URL", async () => {
      const got = await (await onInspo(inspoRoute.GET, owner, `/api/v1/inspos/${inspoId}`, { id: inspoId })).json();
      expect(got.data.analysis).toBeNull();
      expect(got.data.imageUrl).toBe(`/api/v1/inspos/${inspoId}/image`);
      expect(got.data.sourceUrl).toBe("https://pin.it/abc");
      expect([got.data.width, got.data.height]).toEqual([2, 3]);

      const image = await onInspo(inspoImageRoute.GET, owner, `/api/v1/inspos/${inspoId}/image`, { id: inspoId });
      expect(image.status).toBe(200);
      expect(image.headers.get("content-type")).toBe("image/png");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(png(1));
    });

    it("keeps pictures to their owner", async () => {
      asking.user = intruder;
      const listed = await (await insposRoute.GET(request("/api/v1/inspos"), undefined as never)).json();
      expect(listed.data.map((i: { id: string }) => i.id)).not.toContain(inspoId);

      const path = `/api/v1/inspos/${inspoId}`;
      expect((await onInspo(inspoRoute.GET, intruder, path, { id: inspoId })).status).toBe(404);
      expect((await onInspo(inspoImageRoute.GET, intruder, `${path}/image`, { id: inspoId })).status).toBe(404);
      expect((await onInspo(inspoRoute.PATCH, intruder, path, { id: inspoId }, "PATCH", { note: "mine" })).status).toBe(404);
      expect((await onInspo(analyzeRoute.POST, intruder, `${path}/analyze`, { id: inspoId }, "POST")).status).toBe(404);
      expect((await onInspo(restyleRoute.POST, intruder, `${path}/restyle`, { id: inspoId }, "POST", {})).status).toBe(404);
      expect((await onInspo(inspoRoute.DELETE, intruder, path, { id: inspoId }, "DELETE")).status).toBe(404);

      // The same picture is theirs to add too, as their own.
      const theirs = await upload(intruder, png(1));
      expect(theirs.status).toBe(201);
      expect((await theirs.json()).data.id).not.toBe(inspoId);

      const mine = await (await onInspo(inspoRoute.GET, owner, path, { id: inspoId })).json();
      expect(mine.data.note).toBeNull();
    });

    it("adds the same picture once, even sent at the same time", async () => {
      const again = await upload(owner, png(1));
      expect(again.status).toBe(200);
      expect((await again.json()).data.id).toBe(inspoId);

      const bytes = png(2);
      const answers = await Promise.all([1, 2, 3, 4].map(() => upload(owner, bytes)));
      const ids = await Promise.all(answers.map(async (a) => (await a.json()).data.id));
      expect(new Set(ids).size).toBe(1);
      expect(answers.map((a) => a.status).sort()).toEqual([200, 200, 200, 201]);
    });

    it("refuses what is not a picture, too big, or a private address", async () => {
      expect((await upload(owner, new TextEncoder().encode("not an image"))).status).toBe(422);
      expect((await upload(owner, new Uint8Array(0))).status).toBe(422);
      expect((await upload(owner, new Uint8Array(4 * 1024 * 1024 + 1))).status).toBe(413);
      expect((await upload(owner, png(3), "text/plain")).status).toBe(415);

      for (const url of [
        "http://127.0.0.1:3100/x.png",
        // The URL parser rewrites these to ::ffff:7f00:1, which once slipped past the guard.
        "http://[::ffff:127.0.0.1]:3100/api/v1/me",
        "http://[::ffff:7f00:1]:3100/",
        "http://[0:0:0:0:0:ffff:7f00:1]:3100/",
        "http://[::ffff:a9fe:a9fe]/latest/meta-data/",
        "http://[::7f00:1]:3100/",
        "http://[64:ff9b::7f00:1]:3100/",
      ]) {
        asking.user = owner;
        const local = await insposRoute.POST(request("/api/v1/inspos", "POST", { url }), undefined as never);
        expect(local.status, url).toBe(422);
        expect((await local.json()).error.errors[0], url).toMatch(/private network|not allowed|host/);
      }

      // A header that claims a size, with no picture after it.
      const header = png(6).slice(0, 33);
      expect((await upload(owner, header)).status).toBe(422);
      const javascript = await upload(owner, png(4), "image/png", "?sourceUrl=javascript%3Aalert(1)");
      expect((await javascript.json()).data.sourceUrl).toBeNull();
      const credentials = await upload(owner, png(7), "image/png", "?sourceUrl=http%3A%2F%2Fuser%3Apass%40evil.test%2Fx");
      expect((await credentials.json()).data.sourceUrl).toBeNull();
    });

    it("files a picture only under the user's own, current styles", async () => {
      const path = `/api/v1/inspos/${inspoId}`;
      const theirs = await onInspo(inspoRoute.PATCH, owner, path, { id: inspoId }, "PATCH", { styleId: intruderStyle });
      expect(theirs.status).toBe(422);

      const filed = await (await onInspo(inspoRoute.PATCH, owner, path, { id: inspoId }, "PATCH", { styleId: ownerStyle.toUpperCase(), note: "Proportions\u0000 only" })).json();
      expect(filed.data.styleId).toBe(ownerStyle);
      expect(filed.data.note).toBe("Proportions only");

      const { db } = await import("@/db");
      const { styles } = await import("@/db/schema");
      const [{ id: archived }] = await db
        .insert(styles)
        .values({ userId: owner.id, name: "Gone soon", description: "x", sortOrder: 91, archivedAt: new Date() })
        .returning({ id: styles.id });
      expect((await onInspo(inspoRoute.PATCH, owner, path, { id: inspoId }, "PATCH", { styleId: archived })).status).toBe(422);

      const invisible = await (await onInspo(inspoRoute.PATCH, owner, path, { id: inspoId }, "PATCH", { note: "\u200B\u200B\u2060" })).json();
      expect(invisible.data.note).toBeNull();

      const cleared = await (await onInspo(inspoRoute.PATCH, owner, path, { id: inspoId }, "PATCH", { styleId: null, note: "" })).json();
      expect(cleared.data.styleId).toBeNull();
      expect(cleared.data.note).toBeNull();
    });

    it("reads a picture, restyles it, and keeps the restyle off Today (mock model)", async () => {
      const path = `/api/v1/inspos/${inspoId}`;
      const early = await onInspo(restyleRoute.POST, owner, `${path}/restyle`, { id: inspoId }, "POST", {});
      expect(early.status).toBe(422);

      const [first, second] = await Promise.all([
        onInspo(analyzeRoute.POST, owner, `${path}/analyze`, { id: inspoId }, "POST"),
        onInspo(analyzeRoute.POST, owner, `${path}/analyze`, { id: inspoId }, "POST"),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const read = (await first.json()).data;
      expect(read.analysis.model).toBe("mock");
      expect(read.match).not.toBeNull();

      asking.user = owner;
      const before = (await (await latestRoute.GET(request("/api/v1/generations/latest"), undefined as never)).json()).data;
      const restyled = await onInspo(restyleRoute.POST, owner, `${path}/restyle`, { id: inspoId }, "POST", { count: 1 });
      expect(restyled.status).toBe(201);
      const result = (await restyled.json()).data;
      expect(result.request.inspoId).toBe(inspoId);
      expect(result.outfits.length).toBe(1);

      asking.user = owner;
      const after = (await (await latestRoute.GET(request("/api/v1/generations/latest"), undefined as never)).json()).data;
      expect(after?.id ?? null).toBe(before?.id ?? null);
    });

    it("reads a picture with its owner's catalog even when another request swapped it", async () => {
      // A piece of the owner's own custom type, so the match needs their catalog.
      await save(owner, { typeId: "v1-ring", color: white, variant: "band", pattern: "solid", quantity: 1 });
      const added = await upload(owner, png(5));
      const id = (await added.json()).data.id;

      asking.ringKnownAtMatch = [];
      asking.swapCatalogMidRequest = true;
      try {
        const read = await onInspo(analyzeRoute.POST, owner, `/api/v1/inspos/${id}/analyze`, { id }, "POST");
        expect(read.status).toBe(200);
      } finally {
        asking.swapCatalogMidRequest = false;
      }
      expect(asking.ringKnownAtMatch).toEqual([true]);
    });

    it("refuses JSON bodies too large to hold, declared or streamed", async () => {
      asking.user = owner;
      const declared = await tasteLinesRoute.POST(
        new Request("http://test/api/v1/taste/lines", {
          method: "POST",
          headers: { "content-type": "application/json", "content-length": String(64 * 1024 * 1024) },
          body: "{}",
        }),
        undefined as never,
      );
      expect(declared.status).toBe(413);

      const chunk = new TextEncoder().encode(`"${"x".repeat(1024 * 1024)}`);
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (sent++ < 64) controller.enqueue(chunk);
          else controller.close();
        },
      });
      asking.user = owner;
      const streamed = await restyleRoute.POST(
        new Request(`http://test/api/v1/inspos/${inspoId}/restyle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: stream,
          duplex: "half",
        } as RequestInit),
        { params: Promise.resolve({ id: inspoId }) },
      );
      expect(streamed.status).toBe(413);
      expect(sent).toBeLessThan(10);

      asking.user = owner;
      const bom = await tasteLinesRoute.POST(
        new Request("http://test/api/v1/taste/lines", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: `\uFEFF${JSON.stringify({ text: "Byte order mark", kind: "avoid" })}`,
        }),
        undefined as never,
      );
      expect(bom.status).toBe(201);
    });

    it("keeps taste notes to their owner and their own styles", async () => {
      asking.user = owner;
      const added = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { text: "Loose tops, slim bottoms", kind: "like" }), undefined as never);
      expect(added.status).toBe(201);
      const line = (await added.json()).data.lines[0];
      expect(line.source).toBe("user");

      asking.user = intruder;
      const theirs = (await (await tasteRoute.GET(request("/api/v1/taste"), undefined as never)).json()).data;
      expect(theirs.overall.lines).toEqual([]);
      const removed = await onInspo(tasteLineRoute.DELETE, intruder, `/api/v1/taste/lines/${line.id}`, { lineId: line.id }, "DELETE");
      expect(removed.status).toBe(200);

      asking.user = owner;
      const mine = (await (await tasteRoute.GET(request("/api/v1/taste"), undefined as never)).json()).data;
      expect(mine.overall.lines.map((l: { id: string }) => l.id)).toContain(line.id);

      asking.user = owner;
      const onTheirStyle = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { styleId: intruderStyle, text: "Sneaky", kind: "like" }), undefined as never);
      expect(onTheirStyle.status).toBe(422);
      asking.user = owner;
      const refreshTheirs = await tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", { styleId: intruderStyle }), undefined as never);
      expect(refreshTheirs.status).toBe(404);
      asking.user = owner;
      expect((await tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", { styleId: "not-an-id" }), undefined as never)).status).toBe(422);
    });

    it("refuses lines of nothing, and removing twice is fine", async () => {
      for (const text of ["\u200B\u200B\u200B\u200B", "ab", "x".repeat(121), "\u0000\u0000\u0000"]) {
        asking.user = owner;
        const response = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { text, kind: "avoid" }), undefined as never);
        expect(response.status, JSON.stringify(text)).toBe(422);
      }
      asking.user = owner;
      const emoji = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { text: "👍".repeat(120), kind: "avoid" }), undefined as never);
      expect(emoji.status).toBe(201);
      const id = (await emoji.json()).data.avoid[0].id;
      for (let i = 0; i < 2; i++) {
        const removed = await onInspo(tasteLineRoute.DELETE, owner, `/api/v1/taste/lines/${id}`, { lineId: id }, "DELETE");
        expect(removed.status).toBe(200);
        expect((await removed.json()).data.avoid.map((l: { id: string }) => l.id)).not.toContain(id);
      }
    });

    it("keeps one id to one line, and a deleted learned line deleted (mock model)", async () => {
      asking.user = owner;
      const liked = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { text: "Earth tones", kind: "like" }), undefined as never);
      expect(liked.status).toBe(201);
      asking.user = owner;
      const avoided = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { text: "earth  TONES", kind: "avoid" }), undefined as never);
      expect(avoided.status).toBe(422);
      expect((await avoided.json()).error.errors[0]).toMatch(/likes/);

      // Learned lines come from a refresh; delete one and refresh again.
      for (let i = 0; i < 3; i++) {
        asking.user = owner;
        await eventsRoute.POST(
          request("/api/v1/outfit-events", "POST", { type: "liked", outfit: { id: `d${i}`, name: "x", slots, why: "." } }),
          undefined as never,
        );
      }
      asking.user = owner;
      const refreshed = (await (await tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", {}), undefined as never)).json()).data;
      const learned = [...refreshed.lines, ...refreshed.avoid].find((l: { source: string }) => l.source === "learned");
      expect(learned, "the mock learned something").toBeTruthy();
      await onInspo(tasteLineRoute.DELETE, owner, `/api/v1/taste/lines/${learned.id}`, { lineId: learned.id }, "DELETE");

      asking.user = owner;
      const again = (await (await tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", {}), undefined as never)).json()).data;
      const ids = [...again.lines, ...again.avoid].map((l: { id: string }) => l.id);
      expect(ids).not.toContain(learned.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("caps the lines a person writes per list", async () => {
      const { db } = await import("@/db");
      const { styles } = await import("@/db/schema");
      const [{ id: scope }] = await db
        .insert(styles)
        .values({ userId: owner.id, name: "Cap style", description: "x", sortOrder: 92 })
        .returning({ id: styles.id });
      for (let i = 0; i < 30; i++) {
        asking.user = owner;
        const added = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { styleId: scope, text: `Line number ${i}`, kind: "avoid" }), undefined as never);
        expect(added.status).toBe(201);
      }
      asking.user = owner;
      const over = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { styleId: scope, text: "One too many", kind: "avoid" }), undefined as never);
      expect(over.status).toBe(422);
      asking.user = owner;
      const otherList = await tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { styleId: scope, text: "Still room here", kind: "like" }), undefined as never);
      expect(otherList.status).toBe(201);
    });

    it("loses no line to concurrent adds or a refresh (mock model)", async () => {
      asking.user = owner;
      const tooFew = await tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", { styleId: ownerStyle }), undefined as never);
      expect(tooFew.status).toBe(409);

      for (let i = 0; i < 3; i++) {
        asking.user = owner;
        const liked = await eventsRoute.POST(
          request("/api/v1/outfit-events", "POST", { type: "liked", outfit: { id: `t${i}`, name: "x", slots, why: "." } }),
          undefined as never,
        );
        expect(liked.status).toBe(204);
      }

      const texts = ["Earth tones", "No logos", "Chunky soles", "Rolled sleeves", "Wide collars"];
      asking.user = owner;
      const work = [
        ...texts.map((text) => tasteLinesRoute.POST(request("/api/v1/taste/lines", "POST", { styleId: ownerStyle, text, kind: "like" }), undefined as never)),
        tasteRefreshRoute.POST(request("/api/v1/taste/refresh", "POST", {}), undefined as never),
      ];
      const answers = await Promise.all(work);
      expect(answers.map((a) => a.status)).toEqual([201, 201, 201, 201, 201, 200]);

      asking.user = owner;
      const taste = (await (await tasteRoute.GET(request("/api/v1/taste"), undefined as never)).json()).data;
      const lines = taste.byStyle[ownerStyle].lines.map((l: { text: string }) => l.text);
      expect(lines.sort()).toEqual([...texts].sort());
      expect(taste.overall.lines.some((l: { source: string }) => l.source === "user")).toBe(true);
    });
  });
  describe("AI model settings", () => {
    async function llm(as: TestUser, method = "GET", body?: unknown) {
      asking.user = as;
      const handler = method === "GET" ? llmRoute.GET : llmRoute.PATCH;
      return handler(request("/api/v1/settings/llm", method, body), undefined as never);
    }

    it("keeps a person's model choice to them, and changes only what is named", async () => {
      const before = (await (await llm(intruder)).json()).data;

      const saved = await llm(owner, "PATCH", { models: { vision: "google/gemini-3.8-flash" } });
      expect(saved.status).toBe(200);
      const owned = (await saved.json()).data;
      expect(owned.chosen.models.vision).toBe("google/gemini-3.8-flash");
      expect(owned.chosen.models.outfits).toBe(before.chosen.models.outfits);
      expect(owned.chosen.provider).toBe(before.chosen.provider);

      const theirs = (await (await llm(intruder)).json()).data;
      expect(theirs.chosen).toEqual(before.chosen);
      expect((await llm(intruder, "PATCH", { effort: "high" })).status).toBe(200);
      const mine = (await (await llm(owner)).json()).data;
      expect(mine.chosen.effort).toBe(owned.chosen.effort);
      expect(mine.chosen.models.vision).toBe("google/gemini-3.8-flash");
    });

    it("refuses what is not a setting, and stores nothing from it", async () => {
      const before = (await (await llm(owner)).json()).data.chosen;
      for (const body of [
        { provider: "openai" },
        { effort: "max" },
        { models: { outfits: "has spaces in it" } },
        { models: { taste: "" } },
        { models: "anthropic/claude-opus-5" },
        { models: { bogus: "a/b" } },
        { models: { taste: "." } },
        { provider: "anthropic", models: { vision: "x".repeat(121) } },
        ["provider", "anthropic"],
        "anthropic",
      ]) {
        expect((await llm(owner, "PATCH", body)).status, JSON.stringify(body).slice(0, 40)).toBe(422);
      }
      expect((await (await llm(owner)).json()).data.chosen).toEqual(before);
    });

    it("keeps every one of several changes sent at once", async () => {
      asking.user = owner;
      const changes = [
        { provider: "anthropic" },
        { effort: "low" },
        { models: { outfits: "anthropic/claude-sonnet-5" } },
        { models: { taste: "openai/gpt-5.6-luna" } },
        { models: { vision: "openai/gpt-5.6-sol" } },
      ];
      const answers = await Promise.all(
        changes.map((body) => llmRoute.PATCH(request("/api/v1/settings/llm", "PATCH", body), undefined as never)),
      );
      expect(answers.map((a) => a.status)).toEqual([200, 200, 200, 200, 200]);
      const chosen = (await (await llm(owner)).json()).data.chosen;
      expect(chosen).toEqual({
        provider: "anthropic",
        effort: "low",
        models: {
          outfits: "anthropic/claude-sonnet-5",
          taste: "openai/gpt-5.6-luna",
          vision: "openai/gpt-5.6-sol",
        },
      });
    });

    it("tests no model under the mock provider, and refuses an unknown task", async () => {
      const mocked = process.env.LLM_MOCK;
      process.env.LLM_MOCK = "1";
      try {
        const payload = (await (await llm(owner)).json()).data;
        expect(payload.settings.provider).toBe("mock");
        expect(payload.pinned.provider).toBe("LLM_MOCK");

        asking.user = owner;
        const mock = await llmTestRoute.POST(request("/api/v1/settings/llm/test", "POST", { task: "outfits" }), undefined as never);
        expect(mock.status).toBe(503);
        asking.user = owner;
        const unknown = await llmTestRoute.POST(request("/api/v1/settings/llm/test", "POST", { task: "dreams" }), undefined as never);
        expect(unknown.status).toBe(422);
        asking.user = null;
        const anonymous = await llmTestRoute.POST(request("/api/v1/settings/llm/test", "POST", { task: "outfits" }), undefined as never);
        expect(anonymous.status).toBe(401);
      } finally {
        if (mocked === undefined) delete process.env.LLM_MOCK;
        else process.env.LLM_MOCK = mocked;
      }
    });
  });
  describe("trips", () => {
    const place = { name: "Lisbon", country: "Portugal", countryCode: "PT", lat: 38.72, lon: -9.14, timezone: "Europe/Lisbon" };
    /** A date `days` from today, as the API takes it. */
    const day = (days: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    let teeId = "";
    let jeansId = "";
    let intruderPiece = "";

    async function trips(as: TestUser | null, method = "GET", body?: unknown) {
      asking.user = as;
      const handler = method === "GET" ? tripsRoute.GET : tripsRoute.POST;
      return handler(request("/api/v1/trips", method, body), undefined as never);
    }
    async function onTrip(
      handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>,
      as: TestUser,
      id: string,
      method: string,
      body?: unknown,
    ) {
      return onInspo(handler, as, `/api/v1/trips/${id}`, { id }, method, body);
    }
    async function newTrip(as: TestUser, days: [number, number], extra: Record<string, unknown> = {}) {
      const created = await trips(as, "POST", { place, startDate: day(days[0]), endDate: day(days[1]), ...extra });
      expect(created.status).toBe(201);
      return (await created.json()).data as { id: string; options: { luggage: string } };
    }

    beforeAll(async () => {
      const made = await save(traveler, [
        { ...tee, quantity: 2 },
        { typeId: "jeans", color: navy, fit: "straight", material: "denim", pattern: "solid", quantity: 1 },
        { typeId: "sneakers", color: white, variant: "low-top", pattern: "solid", quantity: 1 },
      ]);
      expect(made.status).toBe(201);
      const created = (await made.json()).data.created as { id: string; typeId: string }[];
      teeId = created.find((b) => b.typeId === "t-shirt")!.id;
      jeansId = created.find((b) => b.typeId === "jeans")!.id;
      const theirs = await save(intruder, { ...tee, quantity: 3 });
      intruderPiece = (await theirs.json()).data.created[0].id;
    }, 60_000);

    it("keeps trips to their owner", async () => {
      const trip = await newTrip(traveler, [3, 4]);
      const listed = (await (await trips(intruder)).json()).data as { id: string }[];
      expect(listed.map((t) => t.id)).not.toContain(trip.id);
      expect((await onTrip(tripRoute.GET, intruder, trip.id, "GET")).status).toBe(404);
      expect((await onTrip(tripRoute.PATCH, intruder, trip.id, "PATCH", { name: "Mine now" })).status).toBe(404);
      expect((await onTrip(tripPlanRoute.POST, intruder, trip.id, "POST", {})).status).toBe(404);
      expect((await onTrip(tripSwapRoute.POST, intruder, trip.id, "POST", { date: day(3), slot: "top", toBlockId: intruderPiece })).status).toBe(404);
      expect((await onTrip(tripRoute.DELETE, intruder, trip.id, "DELETE")).status).toBe(404);
      const mine = await onTrip(tripRoute.GET, traveler, trip.id, "GET");
      expect((await mine.json()).data.name).toBe("Lisbon");
      expect((await trips(null)).status).toBe(401);
      asking.user = null;
      expect((await placesRoute.GET(request("/api/v1/places?q=Lis"), undefined as never)).status).toBe(401);
    });

    it("refuses trips that make no sense, and picks the bag by length", async () => {
      for (const body of [
        { place, startDate: day(5), endDate: day(3) },
        { place, startDate: day(-5), endDate: day(-3) },
        { place, startDate: day(1), endDate: day(30) },
        { place: { ...place, timezone: "" }, startDate: day(1), endDate: day(2) },
        { place, startDate: day(1), endDate: day(2), activities: ["skydiving"] },
        [place],
      ]) {
        expect((await trips(traveler, "POST", body)).status, JSON.stringify(body).slice(0, 60)).toBe(422);
      }
      expect((await newTrip(traveler, [2, 4])).options.luggage).toBe("carry-on");
      expect((await newTrip(traveler, [2, 7])).options.luggage).toBe("checked");

      asking.weatherDown = true;
      try {
        const before = ((await (await trips(traveler)).json()).data as unknown[]).length;
        const down = await trips(traveler, "POST", { place, startDate: day(2), endDate: day(3) });
        expect(down.status).toBe(503);
        expect(((await (await trips(traveler)).json()).data as unknown[]).length).toBe(before);
      } finally {
        asking.weatherDown = false;
      }
    });

    it("packs every day from what the person owns, never more than they have (mock model)", async () => {
      const trip = await newTrip(traveler, [10, 14]);
      const packed = await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {});
      expect(packed.status).toBe(200);
      const plan = (await packed.json()).data.plan as {
        days: { date: string; outfit: { slots: Record<string, unknown> } }[];
        packing: { blockId: string; count: number; packed: boolean }[];
        warnings: string[];
      };
      expect(plan.days.map((d) => d.date)).toEqual([10, 11, 12, 13, 14].map(day));
      // Two tees for five days and no laundry: two packed, and a plain warning.
      expect(plan.packing.find((p) => p.blockId === teeId)?.count).toBe(2);
      expect(plan.warnings.join(" ")).toMatch(/worn 5 days; you have 2/);
      // Everything worn is in the bag.
      const bag = new Set(plan.packing.map((p) => p.blockId));
      for (const d of plan.days) for (const id of Object.values(d.outfit.slots).flat()) if (typeof id === "string") expect(bag.has(id)).toBe(true);

      // Laundry halves what the tees have to cover.
      expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { laundry: true })).status).toBe(200);
      const again = (await (await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {})).json()).data.plan;
      expect(again.warnings.join(" ")).toMatch(/worn 5 days; you have 2\./);
    });

    it("ticks and counts within what is owned and what the days wear", async () => {
      const trip = await newTrip(traveler, [20, 21]);
      // Not packed yet: nothing to tick.
      expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { packed: { [teeId]: true } })).status).toBe(422);
      await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {});

      const ticked = await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { packed: { [teeId]: true } });
      expect(ticked.status).toBe(200);
      expect((await ticked.json()).data.plan.packing.find((p: { blockId: string }) => p.blockId === teeId).packed).toBe(true);

      for (const counts of [{ [teeId]: 3 }, { [teeId]: 1 }, { [jeansId]: 0 }, { [intruderPiece]: 1 }, { [teeId]: 1.5 }]) {
        expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { counts })).status, JSON.stringify(counts)).toBe(422);
      }
      // A repack keeps the tick on a piece that is still packed.
      const repacked = (await (await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", { steer: "Keep it simple" })).json()).data;
      expect(repacked.options.steer).toBe("Keep it simple");
      expect(repacked.plan.packing.find((p: { blockId: string }) => p.blockId === teeId).packed).toBe(true);
    });

    it("swaps only the person's own pieces into a day, and the bag follows", async () => {
      const trip = await newTrip(traveler, [25, 25]);
      await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {});
      const foreign = await onTrip(tripSwapRoute.POST, traveler, trip.id, "POST", { date: day(25), slot: "top", toBlockId: intruderPiece });
      expect(foreign.status).toBe(422);
      const wrongSlot = await onTrip(tripSwapRoute.POST, traveler, trip.id, "POST", { date: day(25), slot: "top", toBlockId: jeansId });
      expect(wrongSlot.status).toBe(422);
      const otherDay = await onTrip(tripSwapRoute.POST, traveler, trip.id, "POST", { date: day(26), slot: "bottom", toBlockId: jeansId });
      expect(otherDay.status).toBe(422);

      const deleted = await onTrip(tripRoute.DELETE, traveler, trip.id, "DELETE");
      expect(deleted.status).toBe(204);
      expect((await onTrip(tripRoute.GET, traveler, trip.id, "GET")).status).toBe(404);
    });

    it("reads a plan against the closet as it is now", async () => {
      const trip = await newTrip(traveler, [40, 44]);
      await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {});
      // The tees drop from two to one after packing.
      const lowered = await onPiece(item.PATCH, traveler, teeId, "PATCH", { ...tee, quantity: 1 });
      expect(lowered.status).toBe(200);
      try {
        const read = (await (await onTrip(tripRoute.GET, traveler, trip.id, "GET")).json()).data;
        expect(read.plan.packing.find((p: { blockId: string }) => p.blockId === teeId).count).toBe(1);
        expect(read.plan.warnings.join(" ")).toMatch(/you have one/);
        const listed = ((await (await trips(traveler)).json()).data as { id: string; plan: { packing: { blockId: string; count: number }[] } }[])
          .find((t) => t.id === trip.id)!;
        expect(listed.plan.packing.find((p) => p.blockId === teeId)?.count).toBe(1);
      } finally {
        await onPiece(item.PATCH, traveler, teeId, "PATCH", { ...tee, quantity: 2 });
      }
    });

    it("swaps a dress in and back out, takes an accessory off, and never wears one piece twice a day", async () => {
      const made = await save(traveler, [
        { typeId: "dress", color: navy, fit: "a-line", material: "cotton", pattern: "solid", quantity: 1 },
        { typeId: "scarf", color: white, variant: "wool-scarf", material: "wool", pattern: "solid", quantity: 1 },
      ]);
      const created = (await made.json()).data.created as { id: string; typeId: string }[];
      const dressId = created.find((b) => b.typeId === "dress")!.id;
      const scarfId = created.find((b) => b.typeId === "scarf")!.id;
      try {
        const trip = await newTrip(traveler, [50, 50]);
        await onTrip(tripPlanRoute.POST, traveler, trip.id, "POST", {});
        const swap = (body: Record<string, unknown>) => onTrip(tripSwapRoute.POST, traveler, trip.id, "POST", { date: day(50), ...body });

        const dressed = await swap({ slot: "fullbody", toBlockId: dressId });
        expect(dressed.status).toBe(200);
        expect((await dressed.json()).data.plan.days[0].outfit.slots).toMatchObject({ fullbody: dressId });
        expect((await swap({ slot: "top", toBlockId: teeId })).status).toBe(422);
        const back = await swap({ slot: "separates", top: teeId, bottom: jeansId });
        expect(back.status).toBe(200);
        const slots = (await back.json()).data.plan.days[0].outfit.slots;
        expect(slots.fullbody).toBeUndefined();
        expect(slots).toMatchObject({ top: teeId, bottom: jeansId });

        expect((await swap({ slot: "accessories", toBlockId: scarfId })).status).toBe(200);
        expect((await swap({ slot: "accessories", toBlockId: scarfId })).status).toBe(422);
        const off = await swap({ slot: "accessories", toBlockId: null, fromBlockId: scarfId });
        expect((await off.json()).data.plan.days[0].outfit.slots.accessories).toEqual([]);
        // Shoes and the top can't be taken off.
        expect((await swap({ slot: "footwear", toBlockId: null })).status).toBe(422);
        expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", {})).status).toBe(422);
        expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { foo: 1 })).status).toBe(422);
        expect((await onTrip(tripRoute.PATCH, traveler, trip.id, "PATCH", { counts: {} })).status).toBe(422);
        // Ids in any case.
        const upper = await swap({ slot: "accessories", toBlockId: scarfId.toUpperCase() });
        expect(upper.status).toBe(200);
        // Taken off the only day that wore it, the scarf leaves the bag.
        const offAgain = await swap({ slot: "accessories", toBlockId: null, fromBlockId: scarfId.toUpperCase() });
        expect((await offAgain.json()).data.plan.packing.some((p: { blockId: string }) => p.blockId === scarfId)).toBe(false);
      } finally {
        await onPiece(item.DELETE, traveler, dressId, "DELETE");
        await onPiece(item.DELETE, traveler, scarfId, "DELETE");
      }
    });

    it("packs a trip once when asked twice at the same time (mock model)", async () => {
      const trip = await newTrip(traveler, [30, 31]);
      asking.user = traveler;
      const [a, b] = await Promise.all([
        tripPlanRoute.POST(request(`/api/v1/trips/${trip.id}/plan`, "POST", {}), { params: Promise.resolve({ id: trip.id }) }),
        tripPlanRoute.POST(request(`/api/v1/trips/${trip.id}/plan`, "POST", {}), { params: Promise.resolve({ id: trip.id }) }),
      ]);
      const [ja, jb] = [(await a.json()).data, (await b.json()).data];
      expect(ja.updatedAt).toBe(jb.updatedAt);
    });
  });
});
