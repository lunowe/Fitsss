import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Uppercase footnote label above a grouped list. */
export function SectionHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mb-2 px-4 text-footnote font-medium uppercase tracking-[0.4px] text-label-2", className)}>
      {children}
    </p>
  );
}

/** Footnote text under a grouped list. */
export function SectionFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-2 px-4 text-footnote text-label-2", className)}>{children}</p>;
}

/** iOS inset grouped list container. Put <Row> children inside. */
export function InsetGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl bg-card [&>*+*>div]:border-t [&>*+*>div]:border-separator",
        className,
      )}
    >
      {children}
    </div>
  );
}

type RowBase = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned value or control. */
  trailing?: ReactNode;
  /** Show a chevron. Defaults to true when href is set. */
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
};

type RowProps =
  | (RowBase & { href: string; onClick?: never })
  | (RowBase & { href?: never; onClick: () => void; disabled?: boolean })
  | (RowBase & { href?: never; onClick?: never });

/**
 * A single row of an InsetGroup. Renders as a link, a button, or a static row.
 * The hairline separator is inset 16px from the left, like iOS.
 */
export function Row(props: RowProps) {
  const { leading, title, subtitle, trailing, destructive, className } = props;
  const chevron = props.chevron ?? Boolean(props.href);
  const interactive = Boolean(props.href || props.onClick);

  const inner = (
    <div className="flex min-h-11 items-center gap-3 py-2.5 pr-4">
      {leading ? <div className="flex shrink-0 items-center">{leading}</div> : null}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-body", destructive ? "text-destructive" : "text-label")}>{title}</div>
        {subtitle ? <div className="truncate text-subhead text-label-2">{subtitle}</div> : null}
      </div>
      {trailing ? <div className="shrink-0 text-body text-label-2">{trailing}</div> : null}
      {chevron ? <ChevronRight size={18} className="shrink-0 text-label-3" aria-hidden /> : null}
    </div>
  );

  const base = cn(
    "block w-full pl-4 text-left",
    interactive && "transition-colors duration-100 active:bg-fill",
    className,
  );

  if (props.href) {
    return (
      <Link href={props.href} className={base}>
        {inner}
      </Link>
    );
  }
  if (props.onClick) {
    return (
      <button type="button" onClick={props.onClick} disabled={props.disabled} className={base}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

/** Small rounded square used as a Row leading icon slot. */
export function RowIcon({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex size-7 items-center justify-center rounded-md bg-fill text-label [&>svg]:size-4", className)}
      {...props}
    />
  );
}
