import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/shell";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Not found",
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center px-4">
      <EmptyState
        icon={SearchX}
        title="Page not found"
        body="That link doesn’t lead anywhere in Fitsss."
        action={
          <Button variant="secondary" className="w-full" asChild>
            <Link href="/closet">Go to your closet</Link>
          </Button>
        }
      />
    </main>
  );
}
