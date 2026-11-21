// The stars' own motions over time ("space motion").
//
// Each star moves in a straight line at constant velocity. Where the catalogue gives a parallax,
// the motion is in 3-D (proper motion plus radial velocity), so nearby stars show perspective
// effects and their brightness changes with distance. Without a parallax the star moves along a
// straight line across the sky at its proper motion. Over ±15,000 years this matters: Arcturus
// moves about 9°, Alpha Centauri about 15°, and Vega's pole-star approach shifts by about a degree.

import { DEG, type Vec3 } from '../astro/math';
import type { Star } from './catalog';

const ARCSEC = DEG / 3600;
/** 1 km/s in parsecs per Julian year. */
const KMS_TO_PC_PER_YEAR = (365.25 * 86400) / 3.0856775814913673e13;

export interface MotionStar {
  vec: Vec3;
  pmRA: number;
  pmDE: number;
  plx: number | null;
  rv: number | null;
}

/** Starting position (pc, or unit length without parallax) and velocity per year, J2000 frame. */
function spaceMotion(s: MotionStar): { r: Vec3; v: Vec3; hasDistance: boolean } {
  const [x, y, z] = s.vec;
  const cosDec = Math.hypot(x, y);
  // Unit vectors towards increasing RA and Dec at the star.
  const eRA: Vec3 = cosDec > 1e-12 ? [-y / cosDec, x / cosDec, 0] : [0, 1, 0];
  const eDE: Vec3 = cosDec > 1e-12 ? [(-z * x) / cosDec, (-z * y) / cosDec, cosDec] : [-1, 0, 0];
  const muA = s.pmRA * ARCSEC; // radians per year
  const muD = s.pmDE * ARCSEC;
  const hasDistance = s.plx !== null && s.plx > 0;
  const d = hasDistance ? 1 / s.plx! : 1;
  const radial = hasDistance ? (s.rv ?? 0) * KMS_TO_PC_PER_YEAR : 0;
  const v: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) v[k] = d * (muA * eRA[k] + muD * eDE[k]) + radial * s.vec[k];
  return { r: [x * d, y * d, z * d], v, hasDistance };
}

/** Direction (J2000 unit vector) and magnitude change of one star after `years` from J2000.0. */
export function positionAt(s: MotionStar, years: number): { vec: Vec3; dmag: number } {
  const { r, v, hasDistance } = spaceMotion(s);
  const p: Vec3 = [r[0] + v[0] * years, r[1] + v[1] * years, r[2] + v[2] * years];
  const len = Math.hypot(p[0], p[1], p[2]);
  const len0 = Math.hypot(r[0], r[1], r[2]);
  return {
    vec: [p[0] / len, p[1] / len, p[2] / len],
    dmag: hasDistance ? 5 * Math.log10(len / len0) : 0,
  };
}

/** Moves the whole catalogue at once into flat arrays, for the renderer. */
export class CatalogMotion {
  private readonly r: Float64Array;
  private readonly v: Float64Array;
  private readonly len0: Float64Array;
  private readonly hasDistance: Uint8Array;

  constructor(stars: Star[]) {
    const n = stars.length;
    this.r = new Float64Array(n * 3);
    this.v = new Float64Array(n * 3);
    this.len0 = new Float64Array(n);
    this.hasDistance = new Uint8Array(n);
    stars.forEach((s, i) => {
      const m = spaceMotion(s);
      this.r.set(m.r, i * 3);
      this.v.set(m.v, i * 3);
      this.len0[i] = Math.hypot(...m.r);
      this.hasDistance[i] = m.hasDistance ? 1 : 0;
    });
  }

  /** Fill `vecs` (3 per star) with unit directions and `dmag` with magnitude changes. */
  at(years: number, vecs: Float64Array, dmag: Float32Array): void {
    const { r, v } = this;
    for (let i = 0, j = 0; i < this.len0.length; i++, j += 3) {
      const x = r[j] + v[j] * years;
      const y = r[j + 1] + v[j + 1] * years;
      const z = r[j + 2] + v[j + 2] * years;
      const len = Math.sqrt(x * x + y * y + z * z);
      vecs[j] = x / len;
      vecs[j + 1] = y / len;
      vecs[j + 2] = z / len;
      dmag[i] = this.hasDistance[i] ? 5 * Math.log10(len / this.len0[i]) : 0;
    }
  }
}
