/**
 * Watches, face on: a case on its strap, the strap running up to a buckle
 * and down to a tip. The strap and case carry the color, the dial is the
 * second color. Leather strap: stitched, buckled, with holes. Metal
 * bracelet: links. Minimal: a slim case on a slim plain strap. Digital: a
 * rectangular case and screen on a ridged resin strap. Sport: a thick bezel
 * on a wide rubber strap.
 */
import { button, C, CX, FILL2, fill, ink, L, path, piece, polyline, Q, seam, shade, stroke, symmetric } from "../draw";
import type { KitPiece } from "../types";
import { buckle, disc, METAL, ring, roundRect } from "../parts-feet";

const CY = 100;
const TOP = 16;
const BOTTOM = 184;

interface WatchSpec {
  /** Case radius (round) or half size (square). */
  r: number;
  square?: boolean;
  /** Strap width at the lugs. */
  strapW: number;
  /** Bezel ring width. */
  bezel: number;
  /** Strap details: stitched edges, links, holes, ridges. */
  stitched?: boolean;
  links?: boolean;
  ridges?: boolean;
  holes?: boolean;
  /** A buckle at the top end; otherwise the strap just ends (a bracelet clasp). */
  buckled?: boolean;
  /** Bezel tick marks. */
  ticks?: boolean;
  /** Dial: hands or a digital readout. */
  digital?: boolean;
  /** Dial markers: a small bar at 12 (and 6). */
  markers?: boolean;
}

/** The strap: one closed shape above the case and one below, tapering a little. */
function straps(r: number, w: number, taper: number): { top: string; bottom: string } {
  const top = symmetric([CX, TOP], [L([CX + w / 2 - taper, TOP]), L([CX + w / 2, CY - r + 4]), L([CX, CY - r + 4])]);
  const bottom = symmetric([CX, CY + r - 4], [L([CX + w / 2, CY + r - 4]), L([CX + w / 2 - taper, BOTTOM - 8]), Q([CX + w / 2 - taper, BOTTOM], [CX, BOTTOM])]);
  return { top, bottom };
}

function watch(spec: WatchSpec): KitPiece {
  const { r, strapW, bezel } = spec;
  const taper = 3;
  const s = straps(r, strapW, taper);
  const caseD = spec.square ? roundRect(CX - r, CY - r, 2 * r, 2 * r, 7) : "";
  const dialR = r - bezel;
  const dial = spec.square ? roundRect(CX - dialR, CY - dialR + 2, 2 * dialR, 2 * dialR - 4, 3) : "";
  const crown = roundRect(CX + r - 1, CY - 4, 4, 8, 1.5);
  const lines: string[] = [];
  // Strap details.
  if (spec.stitched) {
    const inset = 2.5;
    lines.push(seam(polyline([CX - strapW / 2 + taper + inset, TOP + 4], [CX - strapW / 2 + inset, CY - r])), seam(polyline([CX + strapW / 2 - taper - inset, TOP + 4], [CX + strapW / 2 - inset, CY - r])));
    lines.push(seam(polyline([CX - strapW / 2 + inset, CY + r], [CX - strapW / 2 + taper + inset, BOTTOM - 8])), seam(polyline([CX + strapW / 2 - inset, CY + r], [CX + strapW / 2 - taper - inset, BOTTOM - 8])));
  }
  if (spec.links) {
    for (let y = TOP + 9; y < CY - r; y += 9) lines.push(seam(polyline([CX - strapW / 2 + 1, y], [CX + strapW / 2 - 1, y])));
    for (let y = CY + r + 5; y < BOTTOM - 6; y += 9) lines.push(seam(polyline([CX - strapW / 2 + 1, y], [CX + strapW / 2 - 1, y])));
  }
  if (spec.ridges) {
    for (let y = TOP + 10; y < CY - r - 4; y += 8) lines.push(seam(polyline([CX - strapW / 2 + 4, y], [CX + strapW / 2 - 4, y])));
    for (let y = CY + r + 8; y < BOTTOM - 10; y += 8) lines.push(seam(polyline([CX - strapW / 2 + 4, y], [CX + strapW / 2 - 4, y])));
  }
  const extras: string[] = [];
  if (spec.holes) for (let y = CY + r + 14; y < BOTTOM - 12; y += 10) extras.push(ring(CX, y, 1.6));
  let bk: ReturnType<typeof buckle> | undefined;
  if (spec.buckled) {
    bk = buckle(CX, TOP + 7, strapW - taper * 2 + 6, 12, 2.6);
    extras.push(bk.fills, bk.lines);
    lines.push(seam(polyline([CX - strapW / 2 + taper + 3, TOP + 20], [CX + strapW / 2 - taper - 3, TOP + 20])));
  }
  // Bezel and dial.
  const caseFills = spec.square
    ? fill(caseD) + fill(dial, FILL2)
    : disc(CX, CY, r, "var(--icon-fill, #b3b3b3)") + disc(CX, CY, dialR, FILL2);
  const caseInk = spec.square ? stroke(caseD) + stroke(dial) : ring(CX, CY, r) + ring(CX, CY, dialR);
  const ticks: string[] = [];
  if (spec.ticks) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const len = i % 3 === 0 ? 3.2 : 1.8;
      ticks.push(seam(polyline([CX + Math.sin(a) * (r - 1.5), CY - Math.cos(a) * (r - 1.5)], [CX + Math.sin(a) * (r - 1.5 - len), CY - Math.cos(a) * (r - 1.5 - len)])));
    }
  }
  const face: string[] = [];
  if (spec.digital) {
    const screen = roundRect(CX - dialR + 5, CY - 9, 2 * dialR - 10, 18, 1.5);
    face.push(shade(screen, 0.16));
    face.push(ink(stroke(screen), stroke(polyline([CX - 10, CY - 3], [CX - 10, CY + 3])), stroke(polyline([CX - 4, CY - 3], [CX - 4, CY + 3])), stroke(polyline([CX + 3, CY - 3], [CX + 3, CY + 3])), stroke(polyline([CX + 9, CY - 3], [CX + 9, CY + 3]))));
    face.push(ink(seam(polyline([CX - dialR + 5, CY - 15], [CX + dialR - 5, CY - 15]))));
  } else {
    face.push(ink(stroke(polyline([CX, CY], [CX, CY - dialR * 0.62])), stroke(polyline([CX, CY], [CX + dialR * 0.5, CY + dialR * 0.3]))));
    face.push(button(CX, CY, 1.4));
    if (spec.markers) face.push(ink(seam(polyline([CX, CY - dialR + 2.5], [CX, CY - dialR + 6])), seam(polyline([CX, CY + dialR - 2.5], [CX, CY + dialR - 6]))));
  }
  return piece({
    base: [fill(s.top), fill(s.bottom)],
    lines: [
      ink(stroke(s.top), stroke(s.bottom), ...lines),
      fill(crown),
      shade(crown, METAL),
      ink(stroke(crown)),
      caseFills,
      ...(spec.square ? [] : [shade(path([CX - dialR, CY], [C([CX - dialR, CY - dialR * 1.33], [CX + dialR, CY - dialR * 1.33], [CX + dialR, CY])], true), 0.07)]),
      ink(caseInk, ...ticks),
      ...face,
      ...extras,
    ],
    clip: s.top + s.bottom,
    extent: [s.top, s.bottom, spec.square ? caseD : path([CX - r, CY], [C([CX - r, CY - r * 1.33], [CX + r, CY - r * 1.33], [CX + r, CY]), C([CX + r, CY + r * 1.33], [CX - r, CY + r * 1.33], [CX - r, CY])], true), crown],
  });
}

export const WATCH: Record<string, KitPiece> = {
  "watch~leather-strap": watch({ r: 40, strapW: 34, bezel: 4.5, stitched: true, holes: true, buckled: true, markers: true }),
  "watch~metal-bracelet": watch({ r: 40, strapW: 36, bezel: 6, links: true, markers: true }),
  "watch~minimal": watch({ r: 38, strapW: 26, bezel: 2.5, markers: false }),
  "watch~digital": watch({ r: 34, square: true, strapW: 34, bezel: 6, ridges: true, digital: true, buckled: true }),
  "watch~sport": watch({ r: 44, strapW: 38, bezel: 8, ticks: true, holes: true, buckled: true, markers: true }),
};
WATCH["watch"] = WATCH["watch~leather-strap"];
