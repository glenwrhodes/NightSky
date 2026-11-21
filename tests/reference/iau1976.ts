// REFERENCE ONLY (used by tests, not by the app).
// IAU 1976 precession (Lieske), as in Meeus, "Astronomical Algorithms", chapter 21 (eq. 21.2–21.4).
// This was the app's first precession model. It is accurate for a few centuries around J2000 but
// drifts badly over millennia; the tests use it to (a) cross-check the long-term model near J2000
// and (b) measure how far from 2000 it stays usable.

import { DEG, RAD, mul, norm360, rotY, rotZ, type Mat3 } from '../../src/astro/math';
import { J2000, centuriesSinceJ2000 } from '../../src/astro/time';

/** Greenwich mean sidereal time in degrees, IAU 1982 (Meeus eq. 12.4). Goes with IAU 1976. */
export function greenwichMeanSiderealTime(jd: number): number {
  const t = centuriesSinceJ2000(jd);
  return norm360(
    280.46061837 + 360.98564736629 * (jd - J2000) + 0.000387933 * t * t - (t * t * t) / 38710000,
  );
}

/** Local mean sidereal time in degrees. Longitude is east-positive. */
export function localSiderealTime(jd: number, longitudeDeg: number): number {
  return norm360(greenwichMeanSiderealTime(jd) + longitudeDeg);
}

interface PrecessionAngles {
  zeta: number;
  z: number;
  theta: number;
}

/** The three precession angles (degrees) from J2000.0 to the given Julian Date. */
export function precessionAngles(jd: number): PrecessionAngles {
  const t = (jd - J2000) / 36525;
  const t2 = t * t;
  const t3 = t2 * t;
  const arcsec = 1 / 3600;
  return {
    zeta: (2306.2181 * t + 0.30188 * t2 + 0.017998 * t3) * arcsec,
    z: (2306.2181 * t + 1.09468 * t2 + 0.018203 * t3) * arcsec,
    theta: (2004.3109 * t - 0.42665 * t2 - 0.041833 * t3) * arcsec,
  };
}

/** Precess a single J2000 position to the equinox of date (scalar form, eq. 21.4). */
export function precess(raDeg: number, decDeg: number, jd: number): [number, number] {
  const { zeta, z, theta } = precessionAngles(jd);
  const a0 = (raDeg + zeta) * DEG;
  const d0 = decDeg * DEG;
  const th = theta * DEG;
  const A = Math.cos(d0) * Math.sin(a0);
  const B = Math.cos(th) * Math.cos(d0) * Math.cos(a0) - Math.sin(th) * Math.sin(d0);
  const C = Math.sin(th) * Math.cos(d0) * Math.cos(a0) + Math.cos(th) * Math.sin(d0);
  return [norm360(Math.atan2(A, B) * RAD + z), Math.asin(C) * RAD];
}

/**
 * Matrix taking a J2000 equatorial unit vector to the equatorial frame of date.
 * P = R3(−z) · R2(θ) · R3(−ζ); equivalent to `precess` but cheap to apply to thousands of stars.
 */
export function precessionMatrix(jd: number): Mat3 {
  const { zeta, z, theta } = precessionAngles(jd);
  return mul(rotZ(-z), mul(rotY(theta), rotZ(-zeta)));
}
