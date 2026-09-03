"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return <Sonner theme="system" className="toaster group" toastOptions={{ classNames: { toast: "bg-card text-label border-separator", description: "text-label-2", actionButton: "bg-ink text-ink-fg", cancelButton: "bg-fill text-label" } }} {...props} />;
}

export { Toaster };
