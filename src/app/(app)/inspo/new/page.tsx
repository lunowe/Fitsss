import type { Metadata } from "next";

import { AddInspo } from "@/components/inspo/AddInspo";
import { BackButton, LargeTitleHeader, Screen } from "@/components/shell";

export const metadata: Metadata = {
  title: "Add a picture",
};

type Props = { searchParams: Promise<{ error?: string | string[] }> };

export default async function NewInspoPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const code = Array.isArray(error) ? error[0] : error;

  return (
    <Screen>
      <LargeTitleHeader title="Add a picture" leading={<BackButton href="/inspo" label="Inspo" />} />
      <AddInspo initialErrorCode={code} />
    </Screen>
  );
}
