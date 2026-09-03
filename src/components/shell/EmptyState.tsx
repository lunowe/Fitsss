import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-8 py-16 text-center", className)}>
      <Icon size={44} strokeWidth={1.5} className="text-label-3" aria-hidden />
      <h2 className="mt-4 text-title-3">{title}</h2>
      {body ? <p className="mt-1.5 max-w-[28ch] text-callout text-label-2">{body}</p> : null}
      {action ? <div className="mt-6 w-full max-w-[240px]">{action}</div> : null}
    </div>
  );
}
