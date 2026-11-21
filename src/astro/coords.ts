// Equatorial → horizontal (alt-azimuth) coordinates. Meeus chapter 13.
//
// Azimuth convention throughout the app: degrees from North through East (N=0, E=90, S=180, W=270).
// (Meeus measures azimuth from the South; we convert.)
// The horizontal frame vector is (north, east, up).

import { DEG, RAD, mat3, mul, norm360, rotZ, type Mat3, type Vec3 } from './math';
import { celestialToIntermediate } from './cio';
import { julianEpoch } from './precession';
import { earthRotationAngle, julianDate } from './time';

export interface Horizontal {
  alt: number;
  az: number;
}

/** Scalar conversion for one position of date, using Meeus eq. 13.5 and 13.6. */
export function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  latDeg: number,
  lstDeg: number,
): Horizontal {
  const H = (lstDeg - raDeg) * DEG;
  const d = decDeg * DEG;
  const phi = latDeg * DEG;
  const azFromSouth = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi),
  );
  const alt = Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  return { alt: alt * RAD, az: norm360(azFromSouth * RAD + 180) };
}

/** Matrix taking an equatorial-of-date unit vector to the (north, east, up) horizontal frame. */
export function equatorialToHorizontalMatrix(latDeg: number, lstDeg: number): Mat3 {
  const s = Math.sin(latDeg * DEG);
  const c = Math.cos(latDeg * DEG);
  // After rotating by LST the x axis points at the meridian on the equator, y points East.
  const toHorizon = mat3(-s, 0, c, 0, 1, 0, c, 0, s);
  return mul(toHorizon, rotZ(lstDeg));
}

/** Everything needed to place J2000 positions on the sky for one instant and place. */
export interface SkyFrame {
  /** Julian Date (UT1). */
  jd: number;
  /** Julian epoch in years (2000.0 = J2000), for star motions and precession. */
  epoch: number;
  /** J2000 equatorial unit vector → (north, east, up), including long-term precession. */
  j2000ToHorizon: Mat3;
}

/**
 * The rotation from the J2000 frame to the local horizon: precession (Vondrák et al. 2011) and the
 * Earth's rotation, via the celestial intermediate origin. The rotation about the pole is
 * ERA + longitude in the intermediate frame, which takes the place of local sidereal time.
 */
export function skyFrame(unixMs: number, latDeg: number, lonDeg: number): SkyFrame {
  const jd = julianDate(unixMs);
  const epoch = julianEpoch(jd);
  const toLocal = equatorialToHorizontalMatrix(latDeg, earthRotationAngle(jd) + lonDeg);
  return { jd, epoch, j2000ToHorizon: mul(toLocal, celestialToIntermediate(epoch)) };
}

/** Altitude/azimuth of a (north, east, up) unit vector. */
export function horizonVecToAltAz(v: Vec3): Horizontal {
  const [n, e, u] = v;
  return {
    alt: Math.atan2(u, Math.hypot(n, e)) * RAD,
    az: norm360(Math.atan2(e, n) * RAD),
  };
}
