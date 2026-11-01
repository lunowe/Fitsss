import { framedByType } from "../draw";
import type { KitPiece } from "../types";
import { BLAZER } from "../garments/blazer";
import { BOMBER } from "../garments/bomber";
import { CARGO_PANTS } from "../garments/cargo-pants";
import { CHINOS } from "../garments/chinos";
import { CHORE_JACKET } from "../garments/chore-jacket";
import { DENIM_JACKET } from "../garments/denim-jacket";
import { DENIM_SHORTS } from "../garments/denim-shorts";
import { HARRINGTON } from "../garments/harrington";
import { LEATHER_JACKET } from "../garments/leather-jacket";
import { PARKA } from "../garments/parka";
import { PUFFER } from "../garments/puffer";
import { RAIN_JACKET } from "../garments/rain-jacket";
import { SHORTS } from "../garments/shorts";
import { SWEATPANTS } from "../garments/sweatpants";
import { TRENCH_COAT } from "../garments/trench-coat";
import { TROUSERS } from "../garments/trousers";
import { WOOL_COAT } from "../garments/wool-coat";

/** Phase-2 drawings for this group; each garment module's table is spread in here, and every type's fits share one frame. */
export const GROUP: Record<string, KitPiece> = framedByType({
  ...DENIM_JACKET,
  ...BOMBER,
  ...LEATHER_JACKET,
  ...BLAZER,
  ...HARRINGTON,
  ...CHORE_JACKET,
  ...TRENCH_COAT,
  ...WOOL_COAT,
  ...PUFFER,
  ...PARKA,
  ...RAIN_JACKET,
  ...CHINOS,
  ...TROUSERS,
  ...CARGO_PANTS,
  ...SWEATPANTS,
  ...SHORTS,
  ...DENIM_SHORTS,
});
