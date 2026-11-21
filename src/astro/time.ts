// Time scales. Formulas from Meeus, "Astronomical Algorithms" (2nd ed.), chapters 7 and 12.
//
// We treat UTC as UT1 (they differ by under a second) and ignore ΔT (TT − UT, about a minute):
// both are far below what a naked-eye sky can show.

import { norm360 } from './math';

export const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86_400_000;

/** Julian Date for an instant given as Unix milliseconds (UTC). */
export function julianDate(unixMs: number): number {
  return unixMs / MS_PER_DAY + UNIX_EPOCH_JD;
}

/** Inverse of julianDate. */
export function unixMsFromJulianDate(jd: number): number {
  return (jd - UNIX_EPOCH_JD) * MS_PER_DAY;
}

/** Julian centuries since J2000.0. */
export function centuriesSinceJ2000(jd: number): number {
  return (jd - J2000) / 36525;
}

/** Greenwich mean sidereal time in degrees, Meeus eq. 12.4. */
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

/** Length of a sidereal day in SI seconds of mean solar time. */
export const SIDEREAL_DAY_SECONDS = 86164.0905;
