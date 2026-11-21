// Pure functions that decide how things look: star colours, star sizes, sky colour by Sun altitude,
// the faintest visible magnitude, and dimming near the horizon. No DOM here, so all of it is tested.

export type RGB = [number, number, number];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Effective temperature from B−V colour index (Ballesteros 2012). */
export function bvToTemperature(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Approximate sRGB colour of a black body (Tanner Helland's fit, good from 1000 K to 40000 K). */
export function temperatureToRgb(kelvin: number): RGB {
  const t = clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)];
}

/**
 * Display colour for a star. Star colours look pale to the eye, so the black-body colour is mixed
 * halfway towards white. Stars with no B−V are drawn white.
 */
export function starColor(bv: number | null, saturation = 0.55): RGB {
  if (bv === null) return [255, 255, 255];
  const c = temperatureToRgb(bvToTemperature(clamp(bv, -0.4, 2.0)));
  return [lerp(255, c[0], saturation), lerp(255, c[1], saturation), lerp(255, c[2], saturation)].map(
    Math.round,
  ) as RGB;
}

/** Piecewise-linear lookup in a table of [x, y] rows sorted by x; clamps at the ends. */
function table(rows: [number, number][], x: number): number {
  if (x <= rows[0][0]) return rows[0][1];
  for (let i = 1; i < rows.length; i++) {
    if (x <= rows[i][0]) {
      const [x0, y0] = rows[i - 1];
      const [x1, y1] = rows[i];
      return lerp(y0, y1, (x - x0) / (x1 - x0));
    }
  }
  return rows[rows.length - 1][1];
}

/** Faintest magnitude shown, by the Sun's altitude: 6.5 in full darkness, nothing in daylight. */
export function limitingMagnitude(sunAlt: number): number {
  return table(
    [
      [-18, 6.5],
      [-12, 4.6],
      [-9, 3.2],
      [-6, 1.6],
      [-3, 0.2],
      [0, -1.6],
    ],
    sunAlt,
  );
}

/** 0 in daylight, 1 in full night. Used to fade constellation lines and labels. */
export function darkness(sunAlt: number): number {
  return clamp((-sunAlt - 2) / 12, 0, 1);
}

/**
 * Relative airmass at a given altitude (Kasten & Young 1989). 1 at the zenith, ~38 at the horizon.
 */
export function airmass(altDeg: number): number {
  const h = Math.max(altDeg, -1);
  return 1 / (Math.sin((h * Math.PI) / 180) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

/** Atmospheric extinction in magnitudes for a typical dark site (0.2 mag per airmass). */
export function extinction(altDeg: number, k = 0.2): number {
  return k * (airmass(altDeg) - 1);
}

/** Radius in CSS pixels of a star's bright core, for a dome of radius 500 px. */
export function starRadius(mag: number): number {
  return 0.5 + 1.35 * Math.pow(10, -0.2 * (mag - 1));
}

/**
 * Opacity of a star given its magnitude and the current limit. Stars fade in over the last two
 * magnitudes above the limit, so the faintest ones stay a dim background and bright stars stand out.
 */
export function starAlpha(mag: number, limit: number): number {
  return clamp((limit - mag + 0.3) / 2.3, 0, 1);
}

interface SkyKey {
  sunAlt: number;
  zenith: RGB;
  horizon: RGB;
}

const SKY_KEYS: SkyKey[] = [
  { sunAlt: -18, zenith: [2, 4, 12], horizon: [7, 11, 28] },
  { sunAlt: -12, zenith: [5, 9, 28], horizon: [16, 26, 60] },
  { sunAlt: -6, zenith: [12, 24, 64], horizon: [38, 54, 104] },
  { sunAlt: -2, zenith: [30, 56, 118], horizon: [92, 116, 166] },
  { sunAlt: 3, zenith: [52, 102, 176], horizon: [170, 192, 222] },
  { sunAlt: 15, zenith: [48, 112, 200], horizon: [160, 198, 236] },
];

/** Sky colours at the zenith and at the horizon for the given Sun altitude. */
export function skyColors(sunAlt: number): { zenith: RGB; horizon: RGB } {
  const k = SKY_KEYS;
  if (sunAlt <= k[0].sunAlt) return { zenith: k[0].zenith, horizon: k[0].horizon };
  const last = k[k.length - 1];
  if (sunAlt >= last.sunAlt) return { zenith: last.zenith, horizon: last.horizon };
  let i = 1;
  while (sunAlt > k[i].sunAlt) i++;
  const a = k[i - 1];
  const b = k[i];
  const t = (sunAlt - a.sunAlt) / (b.sunAlt - a.sunAlt);
  const mix = (p: RGB, q: RGB) => p.map((v, j) => Math.round(lerp(v, q[j], t))) as RGB;
  return { zenith: mix(a.zenith, b.zenith), horizon: mix(a.horizon, b.horizon) };
}

/** Strength (0–1) of the warm glow around the Sun's position: peaks around sunrise/sunset. */
export function twilightGlow(sunAlt: number): number {
  return table(
    [
      [-18, 0],
      [-12, 0.3],
      [-6, 0.85],
      [-1, 1],
      [6, 0.5],
      [15, 0.15],
    ],
    sunAlt,
  );
}

export const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
