import { notFound } from "@/lib/api/respond";
import { withUser } from "@/lib/api/route";
import { loadInspoImage } from "@/server/inspo-queries";

type Ctx = RouteContext<"/api/v1/inspos/[id]/image">;

/**
 * GET /api/v1/inspos/:id/image — the stored bytes. They never change (the
 * same picture added again is the same inspo), so they may be cached hard,
 * but privately: it is the person's own picture.
 */
export const GET = withUser<Ctx>(async (_request, user, ctx) => {
  const { id } = await ctx.params;
  const image = await loadInspoImage(user.id, id);
  // Another person's picture is a 404, not a 403: the id itself is not news.
  if (!image) return notFound("That picture is gone.");

  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
});
