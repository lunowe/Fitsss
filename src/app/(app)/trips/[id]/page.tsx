import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BackButton, Screen } from "@/components/shell";
import { TripDetail } from "@/components/trips/TripDetail";
import { listBlocks } from "@/server/blocks-queries";
import { listStyles } from "@/server/styles-queries";
import { getTripForPage } from "@/server/trips-queries";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pack?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const found = await getTripForPage(id);
  return { title: found ? found.trip.name : "Trip" };
}

export default async function TripPage({ params, searchParams }: Props) {
  const [{ id }, { pack }] = await Promise.all([params, searchParams]);
  const found = await getTripForPage(id);
  if (!found) notFound();

  // Archived pieces are included so a day keeps drawing a piece that has left
  // the closet since packing (the plan says to swap it).
  const [blocks, styles] = await Promise.all([listBlocks({ includeArchived: true }), listStyles()]);

  return (
    <Screen hasBottomBar={!found.trip.plan}>
      <TripDetail
        // A fresh page per trip: nothing from one trip's packing leaks into another's.
        key={found.trip.id}
        trip={found.trip}
        packingOnServer={found.isPacking}
        packOnArrival={pack === "1"}
        blocks={blocks}
        styles={styles.map((style) => ({ id: style.id, name: style.name }))}
        back={<BackButton href="/looks?tab=trips" label="Trips" />}
      />
    </Screen>
  );
}
