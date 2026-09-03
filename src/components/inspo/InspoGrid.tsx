import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";

import { EmptyState } from "@/components/shell";
import { Button } from "@/components/ui/button";
import type { Inspo } from "@/domain";

export type InspoStyleName = { id: string; name: string };

/** One picture in the grid: the image, then the line the analysis gave it. */
function InspoTile({ inspo, styleName }: { inspo: Inspo; styleName?: string }) {
  const caption = inspo.analysis?.summary;

  return (
    <Link
      href={`/inspo/${inspo.id}`}
      className="block rounded-xl bg-card p-2 transition-transform duration-150 ease-out active:scale-[0.98]"
    >
      <div className="overflow-hidden rounded-[10px] bg-card-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- served by an authenticated route, not the image optimizer */}
        <img
          src={inspo.imageUrl}
          alt={caption ?? "Inspiration picture"}
          className="aspect-[4/5] w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="px-1 pb-0.5 pt-2">
        <p className="truncate text-footnote text-label-2">
          {caption ?? (inspo.analysis === null ? "Not analysed" : "Analysing…")}
        </p>
        {styleName ? (
          <p className="mt-0.5 truncate text-caption text-label-2">For {styleName}</p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * The wall of saved pictures. Shared by /inspo and the Inspo segment on Looks,
 * so both read as the same shelf.
 */
export function InspoGrid({
  inspos,
  styles = [],
  className,
}: {
  inspos: Inspo[];
  styles?: InspoStyleName[];
  className?: string;
}) {
  if (inspos.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title="Bring a look you like"
        body="Paste a Pinterest link or add a photo. Fitsss finds the closest pieces you own and styles the rest."
        action={
          <Button className="w-full" asChild>
            <Link href="/inspo/new">Add a picture</Link>
          </Button>
        }
      />
    );
  }

  const nameOf = new Map(styles.map((style) => [style.id, style.name]));

  return (
    <div className={className ?? "grid grid-cols-2 gap-3 px-4 pt-2"}>
      {inspos.map((inspo) => (
        <InspoTile
          key={inspo.id}
          inspo={inspo}
          styleName={inspo.styleId ? nameOf.get(inspo.styleId) : undefined}
        />
      ))}
    </div>
  );
}
