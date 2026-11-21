// Time scales and the supported date range.
//
// The app's clock is Universal Time (UT1: time kept by the Earth's rotation; we treat UTC as UT1).
// The Earth's rotation is computed from UT1 directly (Earth rotation angle), so star positions at a
// given clock time need no ΔT. The Sun moves in dynamical time (TT = UT1 + ΔT), so it does.

export const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86_400_000;

/** Julian Date for an instant given as Unix milliseconds (UT). */
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

/**
 * Unix ms for a UTC calendar date in the proleptic Gregorian calendar with astronomical year
 * numbering (year 0 = 1 BC, −1 = 2 BC). Unlike Date.UTC, years 0–99 are taken literally.
 */
export function utcMs(year: number, month = 1, day = 1, hour = 0, minute = 0, second = 0): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

/** Calendar year (astronomical numbering) of an instant, in UTC. */
export function utcYear(unixMs: number): number {
  return new Date(unixMs).getUTCFullYear();
}

/**
 * Earth rotation angle in degrees (IAU 2000): the Earth's rotation measured from the celestial
 * intermediate origin. It is exactly linear in UT1, so it holds for any date.
 */
export function earthRotationAngle(jdUt1: number): number {
  const t = jdUt1 - J2000;
  const f = t - Math.floor(t); // fraction of a day, for precision
  const turns = f + 0.779057273264 + 0.00273781191135448 * t;
  return (turns - Math.floor(turns)) * 360;
}

/**
 * ΔT = TT − UT1 in seconds: Morrison & Stephenson (2004) long-term parabola,
 * ΔT = −20 + 32·u², u = (year − 1820) / 100.
 * Within a minute or two of the true value today; far from today ΔT is genuinely uncertain
 * (by hours at ±10,000 years), because the slowing of the Earth's spin can't be predicted exactly.
 */
export function deltaT(jdUt1: number): number {
  const year = 2000 + (jdUt1 - J2000) / 365.25;
  const u = (year - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Terrestrial (dynamical) time as a Julian Date, from UT1. */
export function julianDateTT(jdUt1: number): number {
  return jdUt1 + deltaT(jdUt1) / 86400;
}

/** Length of a sidereal day in SI seconds of mean solar time. */
export const SIDEREAL_DAY_SECONDS = 86164.0905;

/**
 * The span of time the app shows: 13,000 BC (astronomical year −12999) to the end of AD 17,000.
 * The precession model holds far beyond this (±200,000 years); the limit comes from the stars'
 * own motions (straight-line motion from catalogue proper motions) and from the Sun, whose clock
 * time depends on ΔT. Within the range, star positions should stay within a few arcminutes for
 * most stars (an estimate from typical catalogue proper-motion errors). See README.md.
 */
export const MIN_YEAR = -12999;
export const MAX_YEAR = 17000;
export const MIN_TIME_MS = utcMs(MIN_YEAR, 1, 1);
export const MAX_TIME_MS = utcMs(MAX_YEAR, 12, 31, 23, 59, 59);

export function clampTime(unixMs: number): number {
  return Math.min(MAX_TIME_MS, Math.max(MIN_TIME_MS, unixMs));
}

/** "13,000 BC", "AD 17,000", "2027" for messages. */
export function formatYear(year: number): string {
  const n = (v: number) => v.toLocaleString('en-US');
  if (year <= 0) return `${n(1 - year)} BC`;
  if (year < 1000 || year > 9999) return `AD ${n(year)}`;
  return String(year);
}
