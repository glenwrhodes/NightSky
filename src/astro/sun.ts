// Low-precision apparent position of the Sun, Meeus chapter 25 (accurate to ~0.01°).
// Used for the sky colour (day, twilight, night) and to draw the Sun.

import { DEG, RAD, norm360 } from './math';
import { centuriesSinceJ2000 } from './time';

export interface SunPosition {
  /** Apparent right ascension of date, degrees. */
  ra: number;
  /** Apparent declination of date, degrees. */
  dec: number;
  /** Apparent ecliptic longitude, degrees. */
  lambda: number;
}

export function sunPosition(jd: number): SunPosition {
  const t = centuriesSinceJ2000(jd);
  const L0 = 280.46646 + 36000.76983 * t + 0.0003032 * t * t;
  const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * DEG;
  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const trueLong = L0 + C;
  const omega = (125.04 - 1934.136 * t) * DEG;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega);

  // Mean obliquity, Meeus eq. 22.2, plus the correction for apparent position (25.8).
  const eps0 = 23 + 26 / 60 + (21.448 - 46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 3600;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * DEG;

  const l = lambda * DEG;
  const ra = norm360(Math.atan2(Math.cos(eps) * Math.sin(l), Math.cos(l)) * RAD);
  const dec = Math.asin(Math.sin(eps) * Math.sin(l)) * RAD;
  return { ra, dec, lambda: norm360(lambda) };
}

export type SkyPhase = 'day' | 'civil twilight' | 'nautical twilight' | 'astronomical twilight' | 'night';

/** Standard twilight names by the Sun's altitude. */
export function skyPhase(sunAltDeg: number): SkyPhase {
  if (sunAltDeg >= -0.833) return 'day';
  if (sunAltDeg >= -6) return 'civil twilight';
  if (sunAltDeg >= -12) return 'nautical twilight';
  if (sunAltDeg >= -18) return 'astronomical twilight';
  return 'night';
}
