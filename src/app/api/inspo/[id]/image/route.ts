import type { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { loadInspoImage } from "@/server/inspo-queries";

/**
 * Serves the stored bytes of an inspiration picture.
 *
 * A route handler rather than a data URL on the page: the pictures are a few
 * hundred kilobytes each and would otherwise be inlined into every server
 * render of the grid. The bytes are immutable once stored — a re-import
 * creates a new row — so the response can be cached hard, but privately: this
 * is the person's own picture, not a public asset.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSession();
  if (!session) return new Response("Not found", { status: 404 });

  const { id } = await params;
  const image = await loadInspoImage(session.user.id, id);
  // Another person's picture is a 404, not a 403: the id itself is not news.
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "content-type": image.mime,
      "content-length": String(image.bytes.byteLength),
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
