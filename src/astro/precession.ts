// Long-term precession: Vondrák, Capitaine & Wallace (2011), "New precession expressions, valid for
// long time intervals", A&A 534, A22 (with the 2012 erratum). Valid for ±200,000 years around J2000.
// Coefficients and structure follow the IAU SOFA / ERFA routines LTPEQU, LTPECL and LTP; the tests
// check against their published test values.
//
// The older IAU 1976 polynomials (Meeus ch. 21) are only good for a few centuries: by ±10,000 years
// they put the pole tens of degrees from where it really is. See README.md.

import { normalize, type Mat3, type Vec3 } from './math';

const ARCSEC = Math.PI / (180 * 3600);
const TAU = 2 * Math.PI;

/** Julian epoch (years) from a Julian Date. */
export function julianEpoch(jd: number): number {
  return 2000 + (jd - 2451545.0) / 365.25;
}

// Equator pole: polynomial and periodic terms for X and Y (arcseconds).
const EQ_POL = [
  [5453.282155, 0.4252841, -0.00037173, -0.000000152],
  [-73750.93035, -0.7675452, -0.00018725, 0.000000231],
];
// [period (centuries), cos X, cos Y, sin X, sin Y]
const EQ_PER = [
  [256.75, -819.940624, 75004.344875, 81491.287984, 1558.515853],
  [708.15, -8444.676815, 624.033993, 787.163481, 7774.939698],
  [274.2, 2600.009459, 1251.136893, 1251.296102, -2219.534038],
  [241.45, 2755.17563, -1102.212834, -1257.950837, -2523.969396],
  [2309.0, -167.659835, -2660.66498, -2966.79973, 247.850422],
  [492.2, 871.855056, 699.291817, 639.744522, -846.485643],
  [396.1, 44.769698, 153.16722, 131.600209, -1393.124055],
  [288.9, -512.313065, -950.865637, -445.040117, 368.526116],
  [231.1, -819.415595, 499.754645, 584.522874, 749.045012],
  [1610.0, -538.071099, -145.18821, -89.756563, 444.704518],
  [620.0, -189.793622, 558.116553, 524.42963, 235.934465],
  [157.87, -402.922932, -23.923029, -13.549067, 374.049623],
  [220.3, 179.516345, -165.405086, -210.157124, -171.33018],
  [1200.0, -9.814756, 9.344131, -44.919798, -22.899655],
];

// Ecliptic pole: polynomial and periodic terms for P_A and Q_A (arcseconds).
const ECL_POL = [
  [5851.607687, -0.1189, -0.00028913, 0.000000101],
  [-1600.8863, 1.1689818, -0.0000002, -0.000000437],
];
// [period (centuries), cos P, cos Q, sin P, sin Q]
const ECL_PER = [
  [708.15, -5486.751211, -684.66156, 667.66673, -5523.863691],
  [2309.0, -17.127623, 2446.28388, -2354.886252, -549.74745],
  [1620.0, -617.517403, 399.671049, -428.152441, -310.998056],
  [492.2, 413.44294, -356.652376, 376.202861, 421.535876],
  [1183.0, 78.614193, -186.387003, 184.778874, -36.776172],
  [622.0, -180.732815, -316.80007, 335.321713, -145.278396],
  [882.0, -87.676083, 198.296701, -185.138669, -34.74445],
  [547.0, 46.140315, 101.135679, -120.97283, 22.885731],
];

/** Obliquity of the ecliptic at J2000.0, radians. */
const EPS0 = 84381.406 * ARCSEC;

function series(epj: number, pol: number[][], per: number[][]): [number, number] {
  const t = (epj - 2000) / 100;
  let a = 0;
  let b = 0;
  const w = TAU * t;
  for (const [period, ca, cb, sa, sb] of per) {
    const ang = w / period;
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    a += c * ca + s * sa;
    b += c * cb + s * sb;
  }
  let p = 1;
  for (let i = 0; i < pol[0].length; i++) {
    a += pol[0][i] * p;
    b += pol[1][i] * p;
    p *= t;
  }
  return [a * ARCSEC, b * ARCSEC];
}

/** Mean pole of the equator of date, as a unit vector in the J2000 frame (LTPEQU). */
export function equatorPole(epj: number): Vec3 {
  const [x, y] = series(epj, EQ_POL, EQ_PER);
  const w = 1 - x * x - y * y;
  return [x, y, w < 0 ? 0 : Math.sqrt(w)];
}

/** Pole of the ecliptic of date, as a unit vector in the J2000 frame (LTPECL). */
export function eclipticPole(epj: number): Vec3 {
  const [p, q] = series(epj, ECL_POL, ECL_PER);
  const w0 = 1 - p * p - q * q;
  const w = w0 < 0 ? 0 : Math.sqrt(w0);
  const s = Math.sin(EPS0);
  const c = Math.cos(EPS0);
  return [p, -q * c - w * s, -q * s + w * c];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Precession matrix from the J2000 mean equator and equinox to the mean equator and equinox of
 * date (LTP). Rows: equinox of date, the equator's 90° point, the pole of date.
 */
export function precessionMatrix(epj: number): Mat3 {
  const pole = equatorPole(epj);
  const equinox = normalize(cross(pole, eclipticPole(epj)));
  const mid = cross(pole, equinox);
  return Float64Array.from([...equinox, ...mid, ...pole]);
}

/** Mean obliquity of the ecliptic of date, degrees: the angle between the two poles. */
export function obliquity(epj: number): number {
  const a = equatorPole(epj);
  const b = eclipticPole(epj);
  return (Math.atan2(Math.hypot(...cross(a, b)), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * 180) / Math.PI;
}
