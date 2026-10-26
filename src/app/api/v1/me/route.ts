import { data } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { isAdmin } from "@/lib/session";

/** GET /api/v1/me — who the token belongs to. A 401 here means "sign in again". */
export const GET = withUser(async (_request, user) => {
  return data({
    id: user.id,
    email: user.email,
    name: user.name,
    role: (await isAdmin(user.id)) ? "admin" : "user",
  });
});
