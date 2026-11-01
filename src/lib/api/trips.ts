import "server-only";

import { failure, invalid, notFound } from "@/lib/api/respond";
import type { TripResult } from "@/server/trips-core";

/** A trip core failure as the `/api/v1` envelope. */
export function tripFailure(result: Extract<TripResult, { ok: false }>): Response {
  switch (result.code) {
    case "invalid":
      return invalid(result.errors ?? [result.error]);
    case "not-found":
      return notFound(result.error);
    case "limit":
      return failure(409, "limit_reached", result.error);
    case "busy":
      return failure(409, "trip_busy", result.error);
    case "rate-limited":
      return failure(429, "rate_limited", result.error);
    case "weather":
      return failure(503, "weather_failed", result.error);
    case "not-configured":
      return failure(503, "not_configured", result.error);
    case "empty-closet":
      return failure(409, "empty_closet", result.error);
    case "too-few-pieces":
      return failure(409, "too_few_pieces", result.error);
    case "llm":
      return failure(502, "plan_failed", result.error);
  }
}
