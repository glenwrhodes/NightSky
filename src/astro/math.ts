// Small angle and 3x3 matrix helpers. Angles in degrees unless a name says otherwise.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

/** Wrap an angle into [0, 360). */
export function norm360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Wrap an angle into [-180, 180). */
export function norm180(deg: number): number {
  return norm360(deg + 180) - 180;
}

export type Vec3 = [number, number, number];
/** Row-major 3x3 matrix: [m00, m01, m02, m10, m11, m12, m20, m21, m22]. */
export type Mat3 = Float64Array;

/** Unit vector from a longitude-like angle (RA) and latitude-like angle (Dec), degrees. */
export function sphericalToVec(lonDeg: number, latDeg: number): Vec3 {
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const c = Math.cos(lat);
  return [c * Math.cos(lon), c * Math.sin(lon), Math.sin(lat)];
}

/** Inverse of sphericalToVec: [lonDeg in 0..360, latDeg]. */
export function vecToSpherical(v: Vec3): [number, number] {
  const [x, y, z] = v;
  const lat = Math.atan2(z, Math.hypot(x, y)) * RAD;
  const lon = norm360(Math.atan2(y, x) * RAD);
  return [lon, lat];
}

export function mat3(...m: number[]): Mat3 {
  return Float64Array.from(m);
}

/**
 * Frame rotations (the coordinate axes rotate by +angle, so a fixed vector appears to rotate by
 * -angle). These are the standard R1/R2/R3 matrices used in astrometry.
 */
export function rotX(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return mat3(1, 0, 0, 0, c, s, 0, -s, c);
}
export function rotY(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return mat3(c, 0, -s, 0, 1, 0, s, 0, c);
}
export function rotZ(deg: number): Mat3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return mat3(c, s, 0, -s, c, 0, 0, 0, 1);
}

/** a · b */
export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l === 0 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
}

/** Angular separation between two unit vectors, degrees. */
export function separation(a: Vec3, b: Vec3): number {
  const cross = Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  );
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.atan2(cross, dot) * RAD;
}
