// The dome: an azimuthal equidistant ("fisheye") projection centred on the zenith, the format
// planetarium projectors use. Distance from the centre is proportional to zenith distance, so the
// horizon is a circle of radius `radius` and points below the horizon fall outside it.
//
// Orientation is that of an all-sky chart held overhead: with South at the bottom of the screen,
// East is on the left and West on the right. `viewAz` is the azimuth shown at the bottom.

import { DEG, RAD, norm360, type Vec3 } from '../astro/math';

export interface DomeView {
  cx: number;
  cy: number;
  /** Radius of the horizon circle, in pixels. */
  radius: number;
  /** Azimuth at the bottom of the dome, degrees (180 = South at the bottom). */
  viewAz: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Project altitude/azimuth (degrees) to screen coordinates. */
export function project(alt: number, az: number, view: DomeView): Point {
  const r = (view.radius * (90 - alt)) / 90;
  const a = (az - view.viewAz) * DEG;
  return { x: view.cx + r * Math.sin(a), y: view.cy + r * Math.cos(a) };
}

/** Inverse of `project`. Returns altitude (may be below 0 outside the circle) and azimuth. */
export function unproject(x: number, y: number, view: DomeView): { alt: number; az: number } {
  const dx = x - view.cx;
  const dy = y - view.cy;
  const r = Math.hypot(dx, dy);
  const alt = 90 - (90 * r) / view.radius;
  const az = r === 0 ? view.viewAz : norm360(Math.atan2(dx, dy) * RAD + view.viewAz);
  return { alt, az };
}

/**
 * Per-frame projector for (north, east, up) unit vectors; avoids trig per star except one acos.
 * Writes into `out` and returns the altitude in degrees.
 */
export function makeVecProjector(view: DomeView) {
  const cosV = Math.cos(view.viewAz * DEG);
  const sinV = Math.sin(view.viewAz * DEG);
  const k = view.radius / 90;
  return (v: Vec3 | Float64Array, out: Point): number => {
    const n = v[0];
    const e = v[1];
    const u = Math.max(-1, Math.min(1, v[2]));
    const zenithDist = Math.acos(u) * RAD;
    const h = Math.hypot(n, e);
    const r = k * zenithDist;
    if (h < 1e-12) {
      // At the zenith or nadir azimuth is undefined; the nadir maps to the bottom.
      out.x = view.cx;
      out.y = view.cy + (u > 0 ? 0 : r);
    } else {
      // sin(az − V), cos(az − V) with sin az = e/h, cos az = n/h
      const s = (e * cosV - n * sinV) / h;
      const c = (n * cosV + e * sinV) / h;
      out.x = view.cx + r * s;
      out.y = view.cy + r * c;
    }
    return 90 - zenithDist;
  };
}

/** Radius of the dome that fits a canvas of the given size, leaving room for compass letters. */
export function fitDome(width: number, height: number, margin: number): Pick<DomeView, 'cx' | 'cy' | 'radius'> {
  return { cx: width / 2, cy: height / 2, radius: Math.max(10, Math.min(width, height) / 2 - margin) };
}
