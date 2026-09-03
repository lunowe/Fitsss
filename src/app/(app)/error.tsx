"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { EmptyState, LargeTitleHeader, Screen } from "@/components/shell";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Screen>
      <LargeTitleHeader title="Something broke" />
      <EmptyState
        icon={TriangleAlert}
        title="That didn’t load"
        body="The screen hit an error on its way in. Trying again usually clears it."
        action={
          <Button variant="secondary" className="w-full" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </Screen>
  );
}
