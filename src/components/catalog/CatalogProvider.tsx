"use client";

import { useMemo, type ReactNode } from "react";

import { applyCatalogExtension, type CatalogExtension } from "@/domain";

/**
 * Puts the user's custom categories, piece types and artwork into the catalog
 * registry on the client.
 *
 * The registry is a module-level singleton (see `src/domain/catalog.ts`), so
 * this is not React context: it is applied during render rather than in an
 * effect, because children read `getPieceType` while they render and an effect
 * would run a paint too late. `useMemo` keyed on the serialized extension makes
 * that a no-op on every render but the first after a change.
 */
export function CatalogProvider({
  extension,
  children,
}: {
  extension: CatalogExtension;
  children: ReactNode;
}) {
  const serialized = JSON.stringify(extension);

  useMemo(() => {
    applyCatalogExtension(JSON.parse(serialized) as CatalogExtension);
  }, [serialized]);

  return <>{children}</>;
}
