import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Shirt } from "lucide-react";

import { ClosetBrowser } from "@/components/closet/ClosetBrowser";
import { BottomBar, EmptyState, LargeTitleHeader, Screen } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { listBlocks } from "@/server/blocks-queries";

export const metadata: Metadata = {
  title: "Closet",
};

export default async function ClosetPage() {
  const all = await listBlocks({ includeArchived: true });
  const blocks = all.filter((block) => block.archivedAt === null);
  const archivedCount = all.length - blocks.length;

  if (blocks.length === 0) {
    return (
      <Screen>
        <LargeTitleHeader title="Closet" subtitle="No pieces yet" />
        <EmptyState
          icon={Shirt}
          title="Your closet is empty"
          body="Add what you own as simple building blocks: a white relaxed tee, black chelsea boots. No photos needed."
          action={
            <Button className="w-full" asChild>
              <Link href="/closet/add">
                <Plus size={20} aria-hidden /> Add pieces
              </Link>
            </Button>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen hasBottomBar>
      <ClosetBrowser blocks={blocks} archivedCount={archivedCount} />
      <BottomBar>
        <Button className="w-full" asChild>
          <Link href="/closet/add">
            <Plus size={20} aria-hidden /> Add pieces
          </Link>
        </Button>
      </BottomBar>
    </Screen>
  );
}
