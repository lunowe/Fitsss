import "server-only";

import type { Inspo } from "@/domain";
import { failure, invalid, notFound } from "@/lib/api/respond";
import type { InspoError } from "@/server/inspo-core";

/**
 * Inspo over `/api/v1`: the picture's URL is the bearer-authenticated
 * `/api/v1/inspos/:id/image` (the web's `/api/inspo/:id/image` reads the
 * cookie), and each failure code has its own status.
 */

export function apiInspo(inspo: Inspo): Inspo {
  return { ...inspo, imageUrl: `/api/v1/inspos/${inspo.id}/image` };
}

export function inspoFailure(error: InspoError): Response {
  switch (error.code) {
    case "not-found":
      return notFound(error.error);
    case "invalid":
      return invalid([error.error]);
    case "fetch":
      return failure(422, "fetch_failed", error.error);
    case "too-large":
      return failure(413, "too_large", error.error);
    case "not-configured":
      return failure(503, "not_configured", error.error);
    case "llm":
      return failure(502, "analysis_failed", error.error);
  }
}
