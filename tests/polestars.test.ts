// Pole stars across the supported range (13,000 BC – AD 17,000).
//
// These pin the long-term model: precession (Vondrák, Capitaine & Wallace 2011) plus each star's
// own motion. With the old IAU 1976 polynomials and no proper motion the app showed Vega only
// 82.4° up from the North Pole in AD 14,000 and put Thuban back near the pole in AD 20,000.
//
// Published reference points:
// - Polaris comes closest to the pole around AD 2100, at about 0.45° (27′).
// - Thuban was the pole star around 2800 BC, within about 10′ of the pole (2830 BC is often quoted;
//   2787 BC in other sources, which leave out its proper motion).
// - Vega was the pole star around 12,000 BC and will be again around AD 13,700.
//
// Vega's distance at that time is often quoted as "4–5°". That figure assumes today's tilt of the
// Earth's axis (23.4°). The tilt will be near its minimum then (~22.6°, from the same precession
// model), and the closest approach is 90° − (Vega's ecliptic latitude, 61.7°) − 22.6° ≈ 5.7°.
// The last test checks that relation directly, so the figure is explained, not just pinned.

import { describe, expect, it } from 'vitest';
import { apply, separation } from '../src/astro/math';
import { eclipticPole, equatorPole, obliquity } from '../src/astro/precession';
import { horizonVecToAltAz, skyFrame } from '../src/astro/coords';
import { utcMs } from '../src/astro/time';
import { loadCatalog } from '../src/sky/catalog';
import { positionAt } from '../src/sky/motion';
import { parseHash } from '../src/app/state';
import { MAX_TIME_MS, MIN_TIME_MS } from '../src/astro/time';

const catalog = loadCatalog();
const star = (key: string) => catalog.find(key)!;

/** Distance (degrees) of a star from the mean celestial pole at a Julian epoch, with its own motion. */
function polarDistance(key: string, epoch: number): number {
  return separation(positionAt(star(key), epoch - 2000).vec, equatorPole(epoch));
}

/** Closest approach to the pole between two epochs, searched year by year. */
function closest(key: string, from: number, to: number) {
  let best = { year: from, deg: Infinity };
  for (let y = from; y <= to; y++) {
    const d = polarDistance(key, y);
    if (d < best.deg) best = { year: y, deg: d };
  }
  return best;
}

/** Altitude seen from the North Pole through the full app pipeline (any time of day). */
function altitudeFromNorthPole(key: string, year: number): number {
  const f = skyFrame(utcMs(year, 6, 1, 0), 90, 0);
  return horizonVecToAltAz(apply(f.j2000ToHorizon, positionAt(star(key), f.epoch - 2000).vec)).alt;
}

describe('pole stars', () => {
  it('Polaris: closest around AD 2100, about 0.45° from the pole', () => {
    const c = closest('Alp UMi', 2050, 2150);
    expect(c.year).toBeGreaterThanOrEqual(2095);
    expect(c.year).toBeLessThanOrEqual(2110);
    expect(c.deg).toBeGreaterThan(0.44);
    expect(c.deg).toBeLessThan(0.47);
  });

  it('Thuban: the pole star around 2800 BC, within 10′ of the pole', () => {
    const c = closest('Alp Dra', -4000, -1500);
    expect(c.year).toBeGreaterThanOrEqual(-2900); // 2901 BC
    expect(c.year).toBeLessThanOrEqual(-2700); // 2701 BC
    expect(c.deg).toBeLessThan(10 / 60);
    expect(altitudeFromNorthPole('Alp Dra', -2999)).toBeGreaterThan(88.5); // 3000 BC
  });

  it('Vega: the pole star around AD 13,700, closest about 5.7° from the pole', () => {
    const c = closest('Alp Lyr', 12000, 15500);
    expect(c.year).toBeGreaterThanOrEqual(13000);
    expect(c.year).toBeLessThanOrEqual(14200);
    expect(c.deg).toBeGreaterThan(5.0);
    expect(c.deg).toBeLessThan(6.5);
    // The reported bug: from the North Pole in AD 14,000 Vega is now ~83.8° up, not 82.4°.
    const alt = altitudeFromNorthPole('Alp Lyr', 14000);
    expect(alt).toBeGreaterThan(83.3);
    expect(alt).toBeLessThan(84.3);
  });

  it('Vega: also the pole star around 12,000 BC', () => {
    const c = closest('Alp Lyr', -12999, -9000);
    expect(c.year).toBeGreaterThanOrEqual(-12700); // 12,701 BC
    expect(c.year).toBeLessThanOrEqual(-11300); // 11,301 BC
    expect(c.deg).toBeLessThan(5);
  });

  it("Vega's closest approach is 90° − its ecliptic latitude − the obliquity, both of that date", () => {
    const c = closest('Alp Lyr', 12000, 15500);
    const vega = positionAt(star('Alp Lyr'), c.year - 2000).vec;
    const eclipticLatitude = 90 - separation(vega, eclipticPole(c.year));
    expect(c.deg).toBeCloseTo(90 - eclipticLatitude - obliquity(c.year), 2);
    expect(obliquity(c.year)).toBeLessThan(23); // well below today's 23.44°
  });

  it('Thuban does not return to the pole within the range (it did with IAU 1976 extrapolated)', () => {
    expect(polarDistance('Alp Dra', 17000)).toBeGreaterThan(10);
  });
});

describe('supported range', () => {
  it('URLs beyond the range are pulled to its ends', () => {
    expect(parseHash('#t=+020000-06-01T00:00:00Z').t).toBe(MAX_TIME_MS);
    expect(parseHash('#t=-20000-06-01T00:00Z').t).toBe(MIN_TIME_MS);
    expect(parseHash('#t=-2829-06-21T00:00Z').t).toBe(utcMs(-2829, 6, 21));
  });
});
