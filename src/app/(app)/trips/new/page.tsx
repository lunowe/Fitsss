import type { Metadata } from "next";

import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";
import { PlanTripForm } from "@/components/trips/PlanTripForm";
import { listStyles } from "@/server/styles-queries";

export const metadata: Metadata = {
  title: "Plan a trip",
};

export default async function PlanTripPage() {
  const styles = await listStyles();

  return (
    <Screen hasBottomBar>
      <LargeTitleHeader title="Plan a trip" leading={<BackButton href="/looks?tab=trips" label="Trips" />} />
      <PlanTripForm styles={styles.map((style) => ({ id: style.id, name: style.name }))} />
    </Screen>
  );
}
