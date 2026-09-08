/**
 * Written briefs for the drawings the imported set does not cover.
 *
 * Seven built-in piece types fall back to the hand-drawn glyphs today (see
 * DESIGN.md, "Silhouettes"); the last two show what a custom piece type the
 * owner adds later would look like.
 */

import type { ArtBrief } from "./types";

export const BRIEFS: Record<string, ArtBrief> = {
  skirt: {
    id: "skirt",
    label: "Skirt",
    role: "bottom",
    brief: "An A-line midi skirt, laid flat, front view.",
    features: [
      "straight waistband across the top, narrower than the hem",
      "body flares gently and evenly to a wide hem",
      "hem line slightly curved, not a straight cut",
      "one or two soft drape folds falling from the waist",
    ],
    aspect: "tall",
  },
  sandals: {
    id: "sandals",
    label: "Sandals",
    role: "shoes",
    brief: "A single flat two-strap slide sandal, seen from above at a slight angle, toe pointing up.",
    features: [
      "footbed outline, wider at the ball of the foot, narrow at the heel",
      "two straps crossing the front of the footbed",
      "a thin sole edge below the footbed in the detail colour",
      "no heel, no laces",
    ],
    aspect: "tall",
  },
  belt: {
    id: "belt",
    label: "Belt",
    role: "accessory",
    brief: "A leather belt coiled into one loose ring, seen from above, with the buckle at the front.",
    features: [
      "one continuous coiled strap forming a ring with the tail crossing over",
      "rectangular buckle with a centre prong, in the detail colour",
      "a short row of punched holes near the tip",
      "even strap width all the way round",
    ],
    aspect: "square",
  },
  sunglasses: {
    id: "sunglasses",
    label: "Sunglasses",
    role: "accessory",
    brief: "A pair of wayfarer sunglasses, front view, arms folded behind so only their ends show.",
    features: [
      "two lenses, slightly trapezoid, wider at the top",
      "a bridge between them and a brow bar across the top of the frame",
      "lenses in the detail colour, frame in the body colour",
      "hinge tabs at the outer corners",
    ],
    aspect: "wide",
  },
  watch: {
    id: "watch",
    label: "Watch",
    role: "accessory",
    brief: "A wristwatch laid flat, front view: round case in the middle, the strap running straight up and down.",
    features: [
      "round case with a slimmer inner dial ring",
      "two hands and small hour marks on the dial",
      "strap of even width above and below the case, buckle at the top end",
      "crown on the right edge of the case",
    ],
    aspect: "tall",
  },
  dress: {
    id: "dress",
    label: "Dress",
    role: "top",
    brief: "A knee-length shift dress with short sleeves, laid flat, front view.",
    features: [
      "round neckline",
      "two short set-in sleeves, hems level with each other",
      "body falls straight from the shoulders with a slight flare at the hem",
      "shoulder and side seams as thin open lines",
    ],
    aspect: "tall",
  },
  jumpsuit: {
    id: "jumpsuit",
    label: "Jumpsuit",
    role: "top",
    brief: "A relaxed long-sleeved jumpsuit with a waist tie, laid flat, front view.",
    features: [
      "one continuous garment: bodice and trousers joined at the waist",
      "two long sleeves with cuffs, hanging slightly away from the body",
      "a tie belt at the waist with two short ends",
      "two wide trouser legs with a gap between them and level hems",
    ],
    aspect: "tall",
  },
  kimono: {
    id: "kimono",
    label: "Kimono",
    role: "outer",
    brief: "A relaxed open-front kimono robe with wide sleeves, laid flat, front view.",
    features: [
      "open front: two front panels with a gap down the middle showing the back of the robe",
      "wide, straight, elbow-length-to-long sleeves held out to the sides",
      "a contrast band running down both front edges and round the neck, in the detail colour",
      "straight hem, roughly mid-thigh",
    ],
    aspect: "square",
  },
  necklace: {
    id: "necklace",
    label: "Necklace",
    role: "accessory",
    brief: "A simple chain necklace laid flat in a loop, with a small pendant hanging at the bottom.",
    features: [
      "a closed loop of chain, wider at the bottom than the top",
      "chain drawn as a repeating row of small links, even spacing",
      "a small teardrop pendant at the lowest point of the loop, in the detail colour",
      "a clasp at the top of the loop",
    ],
    aspect: "tall",
  },
};

export const BRIEF_IDS = Object.keys(BRIEFS);
