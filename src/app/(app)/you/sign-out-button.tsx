"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InsetGroup, Row } from "@/components/shell";
import { authClient } from "@/lib/auth-client";

/** Destructive, centered sign-out row in its own group. */
export function SignOutRow() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <InsetGroup>
      <Row
        destructive
        chevron={false}
        className="text-center"
        title={pending ? "Signing out…" : "Sign out"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await authClient.signOut();
          router.push("/login");
          router.refresh();
        }}
      />
    </InsetGroup>
  );
}
