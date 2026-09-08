/**
 * Bounding boxes for SVG geometry, without a browser.
 *
 * `scripts/import-icons.mjs` gets its boxes from Chrome's `getBBox()`. The
 * generator has to crop art on the server too, so this computes the same thing
 * in pure TypeScript: exact extrema for lines and Bézier segments, sampling
 * for elliptical arcs. Off by a fraction of a unit against Chrome, which is
 * well inside the 4% padding the crop adds anyway.
 */

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const boxWidth = (b: Box) => b.x2 - b.x1;
export const boxHeight = (b: Box) => b.y2 - b.y1;
export const boxArea = (b: Box) => Math.max(0, boxWidth(b)) * Math.max(0, boxHeight(b));

export function unionBox(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2),
  };
}

export function boxesOverlap(a: Box, b: Box, slack = 0): boolean {
  return a.x1 - slack <= b.x2 && b.x1 - slack <= a.x2 && a.y1 - slack <= b.y2 && b.y1 - slack <= a.y2;
}

/** Splits a path `d` into `[command, ...numbers]` steps. */
export function parsePath(d: string): Array<{ cmd: string; args: number[] }> {
  const out: Array<{ cmd: string; args: number[] }> = [];
  const token = /([MmZzLlHhVvCcSsQqTtAa])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  let cmd = "";
  let args: number[] = [];
  const flush = () => {
    if (cmd) out.push({ cmd, args });
  };
  let match: RegExpExecArray | null;
  while ((match = token.exec(d)) !== null) {
    if (match[1]) {
      flush();
      cmd = match[1];
      args = [];
    } else {
      args.push(Number(match[2]));
    }
  }
  flush();
  return out;
}

/** Number of arguments each path command consumes per repetition. */
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  const at = (t: number) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };
  const ts: number[] = [];
  const push = (t: number) => {
    if (t > 0 && t < 1) ts.push(at(t));
  };
  // derivative: 3(-p0+3p1-3p2+p3)t^2 + 6(p0-2p1+p2)t + 3(p1-p0)
  const da = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const db = 6 * (p0 - 2 * p1 + p2);
  const dc = 3 * (p1 - p0);
  if (Math.abs(da) < 1e-12) {
    if (Math.abs(db) > 1e-12) push(-dc / db);
  } else {
    const disc = db * db - 4 * da * dc;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      push((-db + root) / (2 * da));
      push((-db - root) / (2 * da));
    }
  }
  return [p0, p3, ...ts];
}

function quadExtrema(p0: number, p1: number, p2: number): number[] {
  const denom = p0 - 2 * p1 + p2;
  const out = [p0, p2];
  if (Math.abs(denom) > 1e-12) {
    const t = (p0 - p1) / denom;
    if (t > 0 && t < 1) {
      const u = 1 - t;
      out.push(u * u * p0 + 2 * u * t * p1 + t * t * p2);
    }
  }
  return out;
}

/** Samples an elliptical arc; endpoint parameterisation as in the SVG spec. */
function arcPoints(
  x0: number,
  y0: number,
  rx: number,
  ry: number,
  angle: number,
  largeArc: number,
  sweep: number,
  x: number,
  y: number,
): Array<[number, number]> {
  if (rx === 0 || ry === 0) {
    return [
      [x0, y0],
      [x, y],
    ];
  }
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx2 = (x0 - x) / 2;
  const dy2 = (y0 - y) / 2;
  const x1p = cos * dx2 + sin * dy2;
  const y1p = -sin * dx2 + cos * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den || 0));
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, dot / (len || 1))));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const theta = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const steps = 24;
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = theta + (delta * i) / steps;
    const ex = cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin;
    const ey = cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos;
    points.push([ex, ey]);
  }
  return points;
}

/** Bounding box of a path `d` in its own user space, or null if empty. */
export function pathBox(d: string): Box | null {
  const steps = parsePath(d);
  let box: Box | null = null;
  const seen = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    box = box
      ? { x1: Math.min(box.x1, x), y1: Math.min(box.y1, y), x2: Math.max(box.x2, x), y2: Math.max(box.y2, y) }
      : { x1: x, y1: y, x2: x, y2: y };
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;

  for (const step of steps) {
    const upper = step.cmd.toUpperCase();
    const rel = step.cmd !== upper;
    const arity = ARITY[upper];
    if (arity === undefined) continue;
    if (arity === 0) {
      cx = sx;
      cy = sy;
      lastC = lastQ = null;
      continue;
    }
    const runs = Math.max(1, Math.floor(step.args.length / arity));
    for (let run = 0; run < runs; run += 1) {
      const a = step.args.slice(run * arity, run * arity + arity);
      if (a.length < arity) break;
      const rx = (v: number) => (rel ? cx + v : v);
      const ry = (v: number) => (rel ? cy + v : v);
      let cmd = upper;
      // A repeated M is an implicit L.
      if (cmd === "M" && run > 0) cmd = "L";

      if (cmd === "M") {
        cx = rx(a[0]);
        cy = ry(a[1]);
        sx = cx;
        sy = cy;
        seen(cx, cy);
        lastC = lastQ = null;
      } else if (cmd === "L") {
        seen(cx, cy);
        cx = rx(a[0]);
        cy = ry(a[1]);
        seen(cx, cy);
        lastC = lastQ = null;
      } else if (cmd === "H") {
        seen(cx, cy);
        cx = rx(a[0]);
        seen(cx, cy);
        lastC = lastQ = null;
      } else if (cmd === "V") {
        seen(cx, cy);
        cy = ry(a[0]);
        seen(cx, cy);
        lastC = lastQ = null;
      } else if (cmd === "C" || cmd === "S") {
        const [c1x, c1y] =
          cmd === "C"
            ? [rx(a[0]), ry(a[1])]
            : lastC
              ? [2 * cx - lastC[0], 2 * cy - lastC[1]]
              : [cx, cy];
        const [c2x, c2y] = cmd === "C" ? [rx(a[2]), ry(a[3])] : [rx(a[0]), ry(a[1])];
        const [ex, ey] = cmd === "C" ? [rx(a[4]), ry(a[5])] : [rx(a[2]), ry(a[3])];
        const xs = cubicExtrema(cx, c1x, c2x, ex);
        const ys = cubicExtrema(cy, c1y, c2y, ey);
        seen(Math.min(...xs), Math.min(...ys));
        seen(Math.max(...xs), Math.max(...ys));
        cx = ex;
        cy = ey;
        lastC = [c2x, c2y];
        lastQ = null;
      } else if (cmd === "Q" || cmd === "T") {
        // `T` reflects the previous quadratic control point through the
        // current point; spelled out so the type does not chase its own tail.
        const reflected: [number, number] = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
        const c1x: number = cmd === "Q" ? rx(a[0]) : reflected[0];
        const c1y: number = cmd === "Q" ? ry(a[1]) : reflected[1];
        const [ex, ey] = cmd === "Q" ? [rx(a[2]), ry(a[3])] : [rx(a[0]), ry(a[1])];
        const xs = quadExtrema(cx, c1x, ex);
        const ys = quadExtrema(cy, c1y, ey);
        seen(Math.min(...xs), Math.min(...ys));
        seen(Math.max(...xs), Math.max(...ys));
        cx = ex;
        cy = ey;
        lastQ = [c1x, c1y];
        lastC = null;
      } else if (cmd === "A") {
        const ex = rel ? cx + a[5] : a[5];
        const ey = rel ? cy + a[6] : a[6];
        for (const [px, py] of arcPoints(cx, cy, a[0], a[1], a[2], a[3], a[4], ex, ey)) seen(px, py);
        cx = ex;
        cy = ey;
        lastC = lastQ = null;
      }
    }
  }
  return box;
}

/** Applies `matrix(a b c d e f)` / `translate` / `scale` to a box. */
export function transformBox(box: Box, transform: string | undefined): Box {
  if (!transform) return box;
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (n: number[]) => {
    m = [
      m[0] * n[0] + m[2] * n[1],
      m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4],
      m[1] * n[4] + m[3] * n[5] + m[5],
    ];
  };
  const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(transform)) !== null) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (match[1] === "matrix" && args.length === 6) mul(args);
    else if (match[1] === "translate") mul([1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]);
    else if (match[1] === "scale") mul([args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]);
    else if (match[1] === "rotate") {
      const t = ((args[0] ?? 0) * Math.PI) / 180;
      mul([Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0]);
    }
  }
  const pt = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const corners = [pt(box.x1, box.y1), pt(box.x2, box.y1), pt(box.x1, box.y2), pt(box.x2, box.y2)];
  return {
    x1: Math.min(...corners.map((c) => c[0])),
    y1: Math.min(...corners.map((c) => c[1])),
    x2: Math.max(...corners.map((c) => c[0])),
    y2: Math.max(...corners.map((c) => c[1])),
  };
}
