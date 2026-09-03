import type { Metadata } from "next";
import Link from "next/link";

import { InspoGrid } from "@/components/inspo/InspoGrid";
import { BackButton, BottomBar, LargeTitleHeader, Screen } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { listInspos } from "@/server/inspo-queries";
import { listStyles } from "@/server/styles-queries";

export const metadata: Metadata = {
  title: "Inspo",
};

export default async function InspoPage() {
  const [inspos, styles] = await Promise.all([listInspos(), listStyles()]);

  // The empty state carries its own primary action; a second one under it would
  // just be the same button twice.
  const showBottomBar = inspos.length > 0;

  return (
    <Screen hasBottomBar={showBottomBar}>
      <LargeTitleHeader
        title="Inspo"
        subtitle={`${inspos.length} ${inspos.length === 1 ? "picture" : "pictures"}`}
        leading={<BackButton href="/looks" label="Looks" />}
      />

      <InspoGrid inspos={inspos} styles={styles.map((style) => ({ id: style.id, name: style.name }))} />

      {showBottomBar ? (
        <BottomBar>
          <Button className="w-full" asChild>
            <Link href="/inspo/new">Add a picture</Link>
          </Button>
        </BottomBar>
      ) : null}
    </Screen>
  );
}
