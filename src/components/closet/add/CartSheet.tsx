"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Silhouette } from "@/components/silhouettes";
import { SectionHeader, Sheet, SwatchDot } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, derive } from "@/domain";
import { createBlocks } from "@/server/blocks";
import { cn } from "@/lib/utils";
import { cartInputs, groupByCategory, type CartLine } from "./cart";
import { useCart } from "./CartProvider";
import { QuantityStepper } from "./QuantityStepper";

/** How long a removed row fades before it leaves the list. */
const REMOVE_MS = 150;

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Cart review: everything queued up, grouped by category, before it is written. */
export function CartSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { lines, count, setQuantity, keepOnly, clear } = useCart();
  const [removing, setRemoving] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const running = timers.current;
    return () => running.forEach(clearTimeout);
  }, []);

  function change(line: CartLine, quantity: number) {
    if (quantity >= 1) {
      setQuantity(line.key, quantity);
      return;
    }
    setRemoving((current) => [...current, line.key]);
    timers.current.push(
      setTimeout(() => {
        setQuantity(line.key, 0);
        setRemoving((current) => current.filter((key) => key !== line.key));
      }, REMOVE_MS),
    );
  }

  function commit() {
    const snapshot = lines;
    startTransition(async () => {
      const result = await createBlocks(cartInputs(snapshot));
      const added = result.created.reduce((sum, block) => sum + block.quantity, 0);

      if (result.failed.length) {
        // Put back only what the server rejected, so nothing silently vanishes.
        keepOnly(result.failed.map((f) => snapshot[f.index]?.key).filter((key) => key !== undefined));
        toast.error(result.failed[0].errors[0] ?? "Some pieces could not be added");
        if (added > 0) router.refresh();
        return;
      }

      clear();
      onOpenChange(false);
      toast.success(`${plural(added, "piece")} added`);
      router.push("/closet");
      router.refresh();
    });
  }

  const groups = groupByCategory(lines);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Cart"
      description={plural(count, "piece")}
      bodyClassName="pb-2"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              clear();
              onOpenChange(false);
            }}
            disabled={pending}
            className="h-11 shrink-0 px-1 text-body text-tint transition-opacity duration-150 active:opacity-60 disabled:opacity-40"
          >
            Clear
          </button>
          <Button className="min-w-0 flex-1" disabled={pending || count === 0} onClick={commit}>
            {pending ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden /> Adding…
              </>
            ) : (
              `Add ${plural(count, "piece")} to closet`
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {groups.map((group) => (
          <section key={group.category}>
            <SectionHeader className="px-0">{CATEGORY_LABELS[group.category]}</SectionHeader>
            <ul className="overflow-hidden rounded-xl bg-card-2">
              {group.lines.map((line, i) => {
                const derived = derive({ ...line.input, quantity: line.quantity });
                return (
                  <li
                    key={line.key}
                    className={cn(
                      "transition-opacity duration-150 ease-out",
                      i > 0 && "border-t border-separator",
                      removing.includes(line.key) && "opacity-0",
                    )}
                  >
                    <div className="flex min-h-11 items-center gap-3 py-2 pl-3 pr-2">
                      <Silhouette
                        typeId={line.input.typeId}
                        variant={line.input.variant}
                        color={line.input.color.hex}
                        size={36}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body capitalize text-label">{derived.label}</div>
                        <div className="flex items-center gap-1.5 text-subhead text-label-2">
                          <SwatchDot hex={line.input.color.hex} />
                          <span className="truncate">{line.input.color.name}</span>
                        </div>
                      </div>
                      <QuantityStepper
                        quantity={line.quantity}
                        onChange={(quantity) => change(line, quantity)}
                        label={derived.label}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}
