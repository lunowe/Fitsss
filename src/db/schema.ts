import { relations, sql } from "drizzle-orm";
import {
  customType,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BlockColor } from "@/domain";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    typeId: text("type_id").notNull(),
    category: text("category").notNull(),
    color: jsonb("color").$type<BlockColor>().notNull(),
    secondaryColor: jsonb("secondary_color").$type<BlockColor>(),
    fit: text("fit"),
    variant: text("variant"),
    material: text("material"),
    pattern: text("pattern").default("solid").notNull(),
    weight: text("weight"),
    effectiveWeight: text("effective_weight").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    nickname: text("nickname"),
    notes: text("notes"),
    warmth: integer("warmth").notNull(),
    formality: integer("formality").notNull(),
    seasons: text("seasons").array().notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("blocks_user_archived_idx").on(table.userId, table.archivedAt),
    index("blocks_user_category_idx").on(table.userId, table.category),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  blocks: many(blocks),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const blocksRelations = relations(blocks, ({ one }) => ({
  user: one(user, { fields: [blocks.userId], references: [user.id] }),
}));

/* ------------------------------------------------------------------ */
/* Phase 2: styles, generations, looks, feedback                        */
/* ------------------------------------------------------------------ */

/** A style the user actually wears, e.g. "Clean minimal", "Streetwear". */
export const styles = pgTable(
  "styles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** How it looks, in the user's words. Sent to the model verbatim. */
    description: text("description").notNull().default(""),
    /** Optional hard rules, one per line: "never tuck tees", "no logos". */
    rules: text("rules"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("styles_user_idx").on(table.userId, table.archivedAt)],
);

/** One generation call: request in, outfits out. Kept for history and learning. */
export const generations = pgTable(
  "generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** GenerationRequest from src/domain/outfit.ts */
    request: jsonb("request").notNull(),
    /** Outfit[] from src/domain/outfit.ts */
    outfits: jsonb("outfits").notNull(),
    filteredOutCount: integer("filtered_out_count").notNull().default(0),
    model: text("model").notNull(),
    usage: jsonb("usage"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("generations_user_created_idx").on(table.userId, table.createdAt)],
);

/** A saved outfit ("look"). */
export const looks = pgTable(
  "looks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** OutfitSlots from src/domain/outfit.ts */
    slots: jsonb("slots").notNull(),
    why: text("why").notNull().default(""),
    tip: text("tip"),
    styleId: uuid("style_id").references(() => styles.id, { onDelete: "set null" }),
    occasion: text("occasion"),
    /** WeatherSnapshot at save time, if any. */
    weather: jsonb("weather"),
    generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
    wornCount: integer("worn_count").notNull().default(0),
    lastWornAt: timestamp("last_worn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("looks_user_idx").on(table.userId, table.archivedAt)],
);

/** Feedback signal: saved, liked, disliked (+reason), worn, swapped. Feeds taste memory in phase 3. */
export const outfitEvents = pgTable(
  "outfit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** Snapshot of the outfit (Outfit from src/domain/outfit.ts) at event time. */
    outfit: jsonb("outfit").notNull(),
    reason: text("reason"),
    /** For swapped: { slot, fromId, toId } */
    detail: jsonb("detail"),
    styleId: uuid("style_id").references(() => styles.id, { onDelete: "set null" }),
    occasion: text("occasion"),
    generationId: uuid("generation_id").references(() => generations.id, { onDelete: "set null" }),
    lookId: uuid("look_id").references(() => looks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("outfit_events_user_created_idx").on(table.userId, table.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Phase 3: taste memory                                                */
/* ------------------------------------------------------------------ */

/**
 * Learned + user-stated taste notes. One row per (user, style) plus one
 * overall row with style_id null. Lines are TasteLine[] (src/lib/taste).
 */
export const tasteNotes = pgTable(
  "taste_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    styleId: uuid("style_id").references(() => styles.id, { onDelete: "cascade" }),
    /** Things this person tends to like. TasteLine[] */
    lines: jsonb("lines").notNull().default([]),
    /** Things to avoid. TasteLine[] */
    avoid: jsonb("avoid").notNull().default([]),
    /** Number of outfit_events that had been considered at the last refresh. */
    eventCount: integer("event_count").notNull().default(0),
    lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true }),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("taste_notes_user_style_idx").on(table.userId, sql`coalesce(${table.styleId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
  ],
);

/* ------------------------------------------------------------------ */
/* Phase 4: inspiration pictures                                        */
/* ------------------------------------------------------------------ */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/** A picture of an outfit, abstracted into blocks and matched to the closet. */
export const inspos = pgTable(
  "inspos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url"),
    /** Resized JPEG/WebP, max ~1024px long side. */
    image: bytea("image").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** InspoAnalysis from src/domain/inspo.ts, null until analysed. */
    analysis: jsonb("analysis"),
    /** InspoMatch from src/domain/inspo.ts. */
    match: jsonb("match"),
    styleId: uuid("style_id").references(() => styles.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("inspos_user_created_idx").on(table.userId, table.createdAt), index("inspos_style_idx").on(table.styleId)],
);
