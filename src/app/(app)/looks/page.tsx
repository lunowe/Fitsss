import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";

import { InspoGrid } from "@/components/inspo/InspoGrid";
import { LooksTabs } from "@/components/looks/LooksTabs";
import { OutfitCard, outfitMeta } from "@/components/outfit";
import { EmptyState, Screen } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { listBlocks } from "@/server/blocks-queries";
import { listInspos } from "@/server/inspo-queries";
import { listLooks } from "@/server/looks-queries";
import { listStyles } from "@/server/styles-queries";

export const metadata: Metadata = {
  title: "Looks",
};

export default async function LooksPage() {
  const [looks, inspos, styles] = await Promise.all([listLooks(), listInspos(), listStyles()]);

  // Archived pieces are included so a look keeps rendering after a piece leaves the closet.
  const blocks = looks.length ? await listBlocks({ includeArchived: true }) : [];

  const saved =
    looks.length === 0 ? (
      <EmptyState
        icon={LayoutGrid}
        title="No saved looks"
        body="Outfits you save from Today land here."
        action={
          <Button variant="secondary" className="w-full" asChild>
            <Link href="/today">Go to Today</Link>
          </Button>
        }
      />
    ) : (
      <div className="grid grid-cols-2 gap-3 px-4 pt-2">
        {looks.map((look) => (
          <OutfitCard
            key={look.id}
            blocks={blocks}
            slots={look.slots}
            name={look.name}
            meta={outfitMeta({ occasion: look.occasion, weather: look.weather })}
            href={`/looks/${look.id}`}
          />
        ))}
      </div>
    );

  return (
    <Screen>
      <LooksTabs
        savedCount={looks.length}
        inspoCount={inspos.length}
        saved={saved}
        inspo={
          <InspoGrid
            inspos={inspos}
            styles={styles.map((style) => ({ id: style.id, name: style.name }))}
          />
        }
      />
    </Screen>
  );
}
