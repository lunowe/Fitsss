import type { KitPiece } from "../types";
import { BAG } from "../garments/bag";
import { BEANIE } from "../garments/beanie";
import { BELT } from "../garments/belt";
import { BOOTS } from "../garments/boots";
import { CAP } from "../garments/cap";
import { DRESS_SHOES } from "../garments/dress-shoes";
import { LOAFERS } from "../garments/loafers";
import { SANDALS } from "../garments/sandals";
import { SCARF } from "../garments/scarf";
import { SNEAKERS_FEET } from "../garments/sneakers-feet";
import { SUNGLASSES } from "../garments/sunglasses";
import { TOTE } from "../garments/tote";
import { TOTE_LEATHER } from "../garments/tote-leather";
import { WATCH } from "../garments/watch";

/** Footwear and accessories: every variant of each type, plus the type's default. */
export const GROUP: Record<string, KitPiece> = {
  ...SNEAKERS_FEET,
  ...BOOTS,
  ...LOAFERS,
  ...DRESS_SHOES,
  ...SANDALS,
  ...CAP,
  ...BEANIE,
  ...BELT,
  ...SCARF,
  ...SUNGLASSES,
  ...WATCH,
  ...BAG,
  ...TOTE_LEATHER,
  tote: TOTE["tote~canvas-tote"],
};
