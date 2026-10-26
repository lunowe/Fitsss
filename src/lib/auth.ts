import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins/bearer";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  // A native client cannot carry the session cookie, so sign-in also returns
  // the token in `set-auth-token` and `Authorization: Bearer <token>` is
  // accepted on the way back in. The web app keeps using the cookie.
  plugins: [bearer()],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});
