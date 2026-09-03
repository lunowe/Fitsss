import { Screen } from "@/components/shell";

/** Skeleton closet: the real layout, drained of colour, pulsing as one. */
export default function ClosetLoading() {
  return (
    <Screen hasBottomBar>
      <div className="animate-pulse pt-[calc(env(safe-area-inset-top)+44px)]">
        <div className="px-4 pb-2 pt-1">
          <div className="h-[41px] w-40 rounded-lg bg-fill" />
          <div className="mt-1.5 h-4 w-20 rounded bg-fill" />
        </div>

        <div className="flex gap-2 px-4 pb-2.5 pt-1.5">
          {[44, 78, 92, 84].map((width) => (
            <div key={width} className="h-[34px] shrink-0 rounded-full bg-fill" style={{ width }} />
          ))}
        </div>

        <div className="space-y-6">
          {[0, 1].map((section) => (
            <section key={section}>
              <div className="mb-2 px-4">
                <div className="h-3 w-16 rounded bg-fill" />
              </div>
              <div className="grid grid-cols-2 gap-3 px-4">
                {[0, 1, 2, 3].map((tile) => (
                  <div key={tile} className="rounded-xl bg-card p-2">
                    <div className="aspect-square rounded-[10px] bg-card-2" />
                    <div className="px-1 pb-0.5 pt-2">
                      <div className="h-4 w-3/4 rounded bg-fill" />
                      <div className="mt-1.5 h-3 w-1/2 rounded bg-fill" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Screen>
  );
}
