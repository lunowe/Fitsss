import { CARDIGAN } from "../garments/cardigan";
import { SWEATER } from "../garments/crewneck-sweater";
import { DRESS } from "../garments/dress";
import { DRESS_SHIRT } from "../garments/dress-shirt";
import { FLEECE } from "../garments/fleece";
import { HENLEY } from "../garments/henley";
import { JUMPSUIT } from "../garments/jumpsuit";
import { LONG_SLEEVE_TEE } from "../garments/long-sleeve-tee";
import { OVERSHIRT } from "../garments/overshirt";
import { POLO } from "../garments/polo";
import { QUARTER_ZIP } from "../garments/quarter-zip";
import { SWEATSHIRT } from "../garments/sweatshirt";
import { TANK_TOP } from "../garments/tank-top";
import { TURTLENECK } from "../garments/turtleneck";
import { VEST } from "../garments/vest";
import { framedByType } from "../draw";
import type { KitPiece } from "../types";

/** Phase-2 drawings for this group; each garment module's table is spread in here, and every type's fits share one frame. */
export const GROUP: Record<string, KitPiece> = framedByType({
  ...LONG_SLEEVE_TEE,
  ...TANK_TOP,
  ...POLO,
  ...HENLEY,
  ...DRESS_SHIRT,
  ...SWEATER,
  ...SWEATSHIRT,
  ...CARDIGAN,
  ...TURTLENECK,
  ...QUARTER_ZIP,
  ...OVERSHIRT,
  ...FLEECE,
  ...VEST,
  ...DRESS,
  ...JUMPSUIT,
});
