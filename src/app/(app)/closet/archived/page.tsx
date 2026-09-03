import type { Metadata } from "next";
import { Archive } from "lucide-react";

import { ArchivedList } from "@/components/closet/ArchivedList";
import { BackButton, EmptyState, LargeTitleHeader, Screen } from "@/components/shell";
import { listBlocks } from "@/server/blocks-queries";

export const metadata: Metadata = {
  title: "Archived",
};

export default async function ArchivedPage() {
  const all = await listBlocks({ includeArchived: true });
  const archived = all.filter((block) => block.archivedAt !== null);

  return (
    <Screen>
      <LargeTitleHeader
        leading={<BackButton href="/closet" label="Closet" />}
        title="Archived"
        subtitle={
          archived.length ? `${archived.length} ${archived.length === 1 ? "piece" : "pieces"}` : undefined
        }
      />
      {archived.length === 0 ? (
        <EmptyState
          icon={Archive}
          title="Nothing archived"
          body="Pieces you remove from your closet land here, so you can bring them back."
        />
      ) : (
        <div className="pt-2">
          <ArchivedList blocks={archived} />
        </div>
      )}
    </Screen>
  );
}
