import "server-only";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Read from the database rather than the session, because the session cookie
 * is cached for five minutes: a role granted or taken away should take effect
 * on the next request, not the next cache miss.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return row?.role === "admin";
}

/**
 * The content screen and its actions edit the catalog every other screen
 * reads, so they are admin only. Non-admins go back to You rather than to a
 * wall — the screen is simply not theirs.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const currentUser = await requireUser();

  if (!(await isAdmin(currentUser.id))) {
    redirect("/you");
  }

  return currentUser;
}
