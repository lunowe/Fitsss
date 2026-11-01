/**
 * The garment kit: Fitsss's own drawings, built from code so every piece
 * shares one visual language and can be drawn per fit and per pattern.
 *
 * A kit drawing is an `ArtPiece` (the same `{ viewBox, body }` every client
 * already renders) plus `layers`, which let a client lay a pattern between the
 * garment's fills and its lines. Clients that ignore `layers` still draw the
 * plain garment from `body`.
 *
 * Paint is CSS variables only, so one drawing serves every color:
 *   --icon-fill     the garment's color
 *   --icon-fill-2   collars, cuffs, soles, linings (the piece's second color, or a shade)
 *   --icon-stroke   outline and detail ink, chosen from the garment's lightness
 *   --icon-pattern  stripes, checks, prints, logos (the piece's pattern color)
 * Literal opacities are fine; literal colors are not.
 */

/** viewBox units: [x, y, width, height]. */
export type Box = readonly [number, number, number, number];

export interface ArtLayers {
  /** Fills of every garment area, drawn first. */
  base: string;
  /** Everything drawn above a pattern: outline, seams, trims, hardware, shading. */
  lines: string;
  /** Path data of the area a pattern may cover, in viewBox units. */
  clip: string;
  /** Bounds of `clip`; field patterns are laid out to cover it. */
  box: Box;
  /** Which way stripes run on this garment. Default "h". */
  stripe?: "h" | "v";
  /** Where a chest/front graphic sits: center x, center y, size (the motif's side). */
  graphic?: readonly [number, number, number];
  /** Where a small logo sits: center x, center y, size. */
  logo?: readonly [number, number, number];
  /** Path data of the colorblock panel (yoke, sleeves, toe cap...). */
  block?: string;
  /**
   * Areas where a field pattern runs at its own angle, so stripes and checks
   * follow a sleeve instead of cutting straight across it. Each is laid over
   * the main pattern: the panel is refilled with the garment color, then the
   * field tile (same density as the body) is drawn rotated by `angle` degrees
   * about the panel's center.
   */
  panels?: readonly ArtPanel[];
}

export interface ArtPanel {
  /** Path data of the panel, in viewBox units (inside `clip`). */
  clip: string;
  /** Bounds of the panel. */
  box: Box;
  /** Degrees, clockwise, that the pattern turns on this panel. */
  angle: number;
}

export interface KitPiece {
  viewBox: string;
  /** The plain (solid) drawing: `base` followed by `lines`. */
  body: string;
  layers: ArtLayers;
}
