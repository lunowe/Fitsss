import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as {
  fitsssSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.fitsssSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.fitsssSql = sql;
}

export const db = drizzle(sql, { schema });
export { sql };
