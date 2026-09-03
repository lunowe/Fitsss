import type { Metadata } from "next";

import { LargeTitleHeader, Screen } from "@/components/shell";
import { StylesManager } from "@/components/styles/StylesManager";
import { listStyles } from "@/server/styles-queries";

export const metadata: Metadata = {
  title: "Styles",
};

export default async function StylesPage() {
  const styles = await listStyles();

  return (
    <Screen hasBottomBar={styles.length > 0}>
      <LargeTitleHeader title="Styles" subtitle="The looks you actually wear" />
      <StylesManager styles={styles} />
    </Screen>
  );
}
