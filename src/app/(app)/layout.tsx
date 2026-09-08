import type { ReactNode } from "react";
import { CatalogProvider } from "@/components/catalog/CatalogProvider";
import { TabBar } from "@/components/shell";
import { requireUser } from "@/lib/session";
import { applyUserCatalog } from "@/server/catalog-queries";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  // Custom categories and piece types are data, so the catalog every screen
  // reads is assembled per request and handed to the client as one prop.
  const extension = await applyUserCatalog();

  return (
    <CatalogProvider extension={extension}>
      <main className="min-h-dvh w-full">{children}</main>
      <TabBar />
    </CatalogProvider>
  );
}
