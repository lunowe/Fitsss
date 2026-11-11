import { CircleAlert, Clock, CloudSun, Power, Shirt, WifiOff, type LucideIcon } from "lucide-react";

import type { Trip } from "@/domain";

/**
 * Packing from the page. It goes through `POST /api/v1/trips/:id/plan` (the
 * cookie session works there) rather than a server action: Next.js runs a
 * client's actions one at a time, and a minute of packing would hold every
 * tick and search behind it. See `src/server/trips.ts`.
 */

export type PackFailureKind = "closet" | "busy" | "weather" | "not-configured" | "retry" | "offline" | "gone";

export interface PackFailure {
  kind: PackFailureKind;
  message: string;
}

export type PackOutcome = { ok: true; trip: Trip } | { ok: false; failure: PackFailure };

/** The API's error code, in the terms the page acts on. */
function kindOf(status: number, code: string | undefined): PackFailureKind {
  switch (code) {
    case "empty_closet":
    case "too_few_pieces":
      return "closet";
    case "trip_busy":
    case "rate_limited":
      return "busy";
    case "weather_failed":
      return "weather";
    case "not_configured":
      return "not-configured";
    case "not_found":
      return "gone";
  }
  return status === 401 ? "gone" : "retry";
}

export async function packTrip(id: string, steer?: string): Promise<PackOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/trips/${encodeURIComponent(id)}/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(steer === undefined ? {} : { steer }),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, failure: { kind: "offline", message: "Check your connection and try again." } };
  }

  const body = (await response.json().catch(() => null)) as
    | { data?: Trip; error?: { code?: string; message?: string; errors?: string[] } }
    | null;
  if (response.ok && body?.data) return { ok: true, trip: body.data };

  const error = body?.error;
  if (response.status === 401) {
    return { ok: false, failure: { kind: "gone", message: "You were signed out. Sign in again to pack." } };
  }
  const message = error?.errors?.[0] ?? error?.message ?? "Something went wrong. Try again.";
  return { ok: false, failure: { kind: kindOf(response.status, error?.code), message } };
}

export const FAILURE_COPY: Record<PackFailureKind, { title: string; icon: LucideIcon }> = {
  closet: { title: "Can’t dress every day", icon: Shirt },
  busy: { title: "Not right now", icon: Clock },
  weather: { title: "No weather for these dates", icon: CloudSun },
  "not-configured": { title: "Packing is off", icon: Power },
  retry: { title: "The stylist got stuck", icon: CircleAlert },
  offline: { title: "You’re offline", icon: WifiOff },
  gone: { title: "This trip is gone", icon: CircleAlert },
};

export function failureDetail(failure: PackFailure): string {
  return failure.kind === "not-configured"
    ? `This server has no outfit model set up yet, so it can’t pack a bag. ${failure.message}`
    : failure.message;
}
