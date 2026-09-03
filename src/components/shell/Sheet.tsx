"use client";

import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/**
 * Bottom sheet with grabber, left-aligned title, scrollable body and a sticky
 * footer for the primary action. Use for pickers, item detail, cart review.
 */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  headerTrailing,
  children,
  footer,
  className,
  bodyClassName,
  dismissible = true,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the header row, e.g. a Close or Done text button. */
  headerTrailing?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  dismissible?: boolean;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent className={cn("mx-auto max-w-[480px]", className)}>
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0">
            {title ? <DrawerTitle className="text-title-2">{title}</DrawerTitle> : <DrawerTitle className="sr-only">Sheet</DrawerTitle>}
            {description ? <DrawerDescription className="mt-0.5">{description}</DrawerDescription> : null}
          </div>
          {headerTrailing ? <div className="shrink-0">{headerTrailing}</div> : null}
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 pb-4", bodyClassName)}>{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-separator bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            {footer}
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)]" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
