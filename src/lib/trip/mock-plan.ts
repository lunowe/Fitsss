import { wearsPerPiece, type Block, type Category, type RawTripPlan } from "@/domain";
import type { WeatherGuidance } from "@/lib/llm/outfit-prompt";

/**
 * Deterministic stand-in for the model when `LLM_MOCK=1`. It plays by the
 * same rules a good answer would (a fresh top each day while one is left, the
 * day's weather, shoes every day) so tests and local runs exercise the real
 * checks. Its answer still goes through `checkTripPlan`.
 */
export function mockTripPlan(input: {
  dates: string[];
  wearableByDate: Map<string, Map<string, Block>>;
  guidanceByDate: Map<string, WeatherGuidance>;
  laundry: boolean;
}): RawTripPlan {
  const wearsLeft = new Map<string, number>();
  const left = (block: Block) => {
    if (!wearsLeft.has(block.id)) {
      const per = wearsPerPiece(block.category, input.laundry);
      wearsLeft.set(block.id, per === Number.POSITIVE_INFINITY ? Number.MAX_SAFE_INTEGER : per * block.quantity);
    }
    return wearsLeft.get(block.id)!;
  };
  // The piece with the most wear left, ties by id, so a ×4 tee lasts four days.
  const pick = (wearable: Map<string, Block>, category: Category): Block | undefined => {
    const options = [...wearable.values()].filter((b) => b.category === category);
    options.sort((a, b) => left(b) - left(a) || (a.id < b.id ? -1 : 1));
    return options[0];
  };
  const wear = (block: Block | undefined) => {
    if (block) wearsLeft.set(block.id, left(block) - 1);
    return block?.id;
  };

  const days = input.dates.map((date, i) => {
    const wearable = input.wearableByDate.get(date) ?? new Map<string, Block>();
    const guidance = input.guidanceByDate.get(date);
    const top = pick(wearable, "top");
    const bottom = pick(wearable, "bottom");
    const fullbody = pick(wearable, "fullbody");
    const useFullbody = !!fullbody && (!top || !bottom || left(top) <= 0);
    const slots = {
      top: useFullbody ? undefined : wear(top),
      bottom: useFullbody ? undefined : wear(bottom),
      fullbody: useFullbody ? wear(fullbody) : undefined,
      footwear: wear(pick(wearable, "footwear")),
      outerwear: guidance?.outerwear === "required" ? wear(pick(wearable, "outerwear")) : undefined,
      layer: guidance?.layer === "suggested" ? wear(pick(wearable, "layer")) : undefined,
      accessories: [] as string[],
    };
    return { date, name: `Mock day ${i + 1}`, slots, why: "Mock plan: LLM_MOCK is on." };
  });

  return { days, packing: [], tips: ["Mock plan: LLM_MOCK is on."] };
}
