// Position of the Sun, for the sky colour (day, twilight, night) and to draw it.
//
// Low-precision theory from Meeus chapter 25 (mean longitude, mean anomaly, equation of centre),
// rewritten so it holds up over millennia: the longitude is measured in a frame that does not
// precess, and the Sun is placed on the ecliptic of date from the long-term precession model, so
// no present-era precession or obliquity polynomial is extrapolated. It is evaluated in dynamical
// time (TT); the caller converts from the clock with ΔT.
//
// Accuracy: about 0.01° near the present. Far from today the orbital elements are extrapolated and
// ΔT is uncertain by hours, so the Sun's place along the ecliptic can be off by up to a few degrees
// (a few days in the calendar) at the ends of the supported range. Stars are not affected.

import { DEG, normalize, type Vec3 } from './math';
import { eclipticPole, julianEpoch } from './precession';
import { centuriesSinceJ2000 } from './time';

/** The Sun's direction as a unit vector in the J2000 equatorial frame, at a TT Julian Date. */
export function sunJ2000(jdTT: number): Vec3 {
  const t = centuriesSinceJ2000(jdTT);
  // Mean longitude from a non-precessing origin: Meeus's L0 minus general precession (5028.796"/cy).
  const L = 280.46646 + 35999.37294 * t;
  const M = (357.52911 + 35999.05029 * t - 0.0001537 * t * t) * DEG;
  const C =
    (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(M) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M);
  const lambda = (L + C - 0.00569) * DEG; // − aberration

  // Ecliptic of date, with its longitude origin at the J2000 equinox projected onto it.
  const k = eclipticPole(julianEpoch(jdTT));
  const e1 = normalize([1 - k[0] * k[0], -k[0] * k[1], -k[0] * k[2]]);
  const e2: Vec3 = [k[1] * e1[2] - k[2] * e1[1], k[2] * e1[0] - k[0] * e1[2], k[0] * e1[1] - k[1] * e1[0]];
  const c = Math.cos(lambda);
  const s = Math.sin(lambda);
  return [c * e1[0] + s * e2[0], c * e1[1] + s * e2[1], c * e1[2] + s * e2[2]];
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
