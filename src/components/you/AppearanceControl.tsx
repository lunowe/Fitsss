"use client";

import { useSyncExternalStore } from "react";
import { SegmentedControl } from "@/components/shell";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  writeThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const satisfies readonly { value: ThemePreference; label: string }[];

/**
 * localStorage is the source of truth, so it is read through
 * useSyncExternalStore: the server snapshot is the default (matching the
 * pre-hydration markup) and the client snapshot is whatever the no-flash
 * script already applied.
 */
const listeners = new Set<() => void>();
let snapshot: ThemePreference | null = null;

function emit() {
  snapshot = null;
  for (const listener of listeners) listener();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ThemePreference {
  snapshot ??= readThemePreference();
  return snapshot;
}

function getServerSnapshot(): ThemePreference {
  return DEFAULT_THEME_PREFERENCE;
}

/** Segmented System / Light / Dark switch, persisted in localStorage. */
export function AppearanceControl() {
  const preference = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <SegmentedControl
      label="Appearance"
      value={preference}
      options={OPTIONS}
      className="w-full"
      onValueChange={(next) => {
        writeThemePreference(next);
        applyThemePreference(next);
        emit();
      }}
    />
  );
}
