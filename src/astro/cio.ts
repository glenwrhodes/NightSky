// From the J2000 frame to the celestial intermediate frame: the frame whose pole is the (mean)
// celestial pole of date and whose origin is the celestial intermediate origin (CIO). The Earth
// rotation angle is measured from the CIO, so
//
//   terrestrial = R3(ERA) · R3(−s) · Mᵀ(X, Y) · J2000
//
// (IERS Conventions 2010, ch. 5, without nutation or polar motion: both are under 20" here).
// X, Y are the pole's coordinates from the long-term precession model. The CIO locator s keeps the
// origin from rotating about the pole; over millennia it grows to many degrees, so we integrate it
// numerically:  ds = −(X dY − Y dX) / (1 + Z).

import { mul, rotZ, type Mat3 } from './math';
import { equatorPole } from './precession';
import { MAX_YEAR, MIN_YEAR } from './time';

const RAD = 180 / Math.PI;
/** Table of s (degrees) on a one-year grid of Julian epochs, built on first use. */
let table: { start: number; values: Float64Array } | null = null;

function buildTable() {
  const start = MIN_YEAR - 2;
  const end = MAX_YEAR + 3;
  const n = end - start + 1;
  const values = new Float64Array(n);
  const poles = Array.from({ length: n }, (_, i) => equatorPole(start + i));
  const i0 = 2000 - start; // s(J2000) ≈ 0 (it is 94 microarcseconds)
  const step = (a: number, b: number) => {
    const [xa, ya, za] = poles[a];
    const [xb, yb, zb] = poles[b];
    const xm = (xa + xb) / 2;
    const ym = (ya + yb) / 2;
    const zm = (za + zb) / 2;
    return (-(xm * (yb - ya) - ym * (xb - xa)) / (1 + zm)) * RAD;
  };
  for (let i = i0 + 1; i < n; i++) values[i] = values[i - 1] + step(i - 1, i);
  for (let i = i0 - 1; i >= 0; i--) values[i] = values[i + 1] - step(i, i + 1);
  return { start, values };
}

/** CIO locator s in degrees at a Julian epoch within the supported range. */
export function cioLocator(epj: number): number {
  table ??= buildTable();
  const { start, values } = table;
  const x = Math.min(values.length - 1.000001, Math.max(0, epj - start));
  const i = Math.floor(x);
  const f = x - i;
  return values[i] * (1 - f) + values[i + 1] * f;
}

/** Matrix from the J2000 frame to the celestial intermediate frame of date. */
export function celestialToIntermediate(epj: number): Mat3 {
  const [x, y, z] = equatorPole(epj);
  const a = 1 / (1 + z);
  const mT = Float64Array.from([
    1 - a * x * x, -a * x * y, -x,
    -a * x * y, 1 - a * y * y, -y,
    x, y, 1 - a * (x * x + y * y),
  ]);
  return mul(rotZ(-cioLocator(epj)), mT);
}
