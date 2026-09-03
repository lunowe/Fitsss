import type { ReactNode } from "react";
import { TabBar } from "@/components/shell";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return (
    <>
      <main className="min-h-dvh w-full">{children}</main>
      <TabBar />
    </>
  );
}
