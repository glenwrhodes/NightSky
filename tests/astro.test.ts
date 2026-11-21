import { describe, expect, it } from 'vitest';
import {
  apply,
  norm180,
  norm360,
  separation,
  sphericalToVec,
  vecToSpherical,
} from '../src/astro/math';
import {
  greenwichMeanSiderealTime,
  julianDate,
  localSiderealTime,
  unixMsFromJulianDate,
} from '../src/astro/time';
import { precess, precessionMatrix } from '../src/astro/precession';
import {
  equatorialToHorizontal,
  equatorialToHorizontalMatrix,
  horizonVecToAltAz,
  skyFrame,
} from '../src/astro/coords';
import { skyPhase, sunPosition } from '../src/astro/sun';

const hms = (h: number, m: number, s: number) => (h + m / 60 + s / 3600) * 15;
const dms = (sign: 1 | -1, d: number, m: number, s: number) => sign * (d + m / 60 + s / 3600);
const DAY = 86_400_000;

describe('angle helpers', () => {
  it('wraps angles', () => {
    expect(norm360(-10)).toBeCloseTo(350);
    expect(norm360(725)).toBeCloseTo(5);
    expect(norm180(190)).toBeCloseTo(-170);
    expect(norm180(-180)).toBeCloseTo(-180);
  });

  it('round-trips spherical coordinates', () => {
    const [lon, lat] = vecToSpherical(sphericalToVec(123.4, -56.7));
    expect(lon).toBeCloseTo(123.4, 10);
    expect(lat).toBeCloseTo(-56.7, 10);
  });

  it('measures separations', () => {
    expect(separation(sphericalToVec(0, 0), sphericalToVec(90, 0))).toBeCloseTo(90, 10);
    expect(separation(sphericalToVec(10, 89.9), sphericalToVec(190, 89.9))).toBeCloseTo(0.2, 8);
  });
});

describe('time', () => {
  it('J2000.0 is JD 2451545.0', () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBe(2451545.0);
  });

  it('Meeus example 7.a: 1957 October 4.81 UT = JD 2436116.31', () => {
    expect(julianDate(Date.UTC(1957, 9, 4) + 0.81 * DAY)).toBeCloseTo(2436116.31, 6);
  });

  it('round-trips Unix time', () => {
    const ms = Date.UTC(2026, 10, 21, 3, 4, 5);
    expect(unixMsFromJulianDate(julianDate(ms))).toBeCloseTo(ms, 0);
  });

  it('Meeus example 12.a: GMST at 1987 April 10, 0h UT', () => {
    const jd = julianDate(Date.UTC(1987, 3, 10));
    expect(greenwichMeanSiderealTime(jd)).toBeCloseTo(hms(13, 10, 46.3668), 5);
  });

  it('Meeus example 12.b: GMST at 1987 April 10, 19h21m UT', () => {
    const jd = julianDate(Date.UTC(1987, 3, 10, 19, 21, 0));
    expect(greenwichMeanSiderealTime(jd)).toBeCloseTo(128.7378734, 5);
  });

  it('local sidereal time adds east longitude', () => {
    const jd = julianDate(Date.UTC(1987, 3, 10, 19, 21, 0));
    expect(localSiderealTime(jd, -77.0655556)).toBeCloseTo(128.7378734 - 77.0655556, 5);
    expect(localSiderealTime(jd, 270)).toBeCloseTo(norm360(128.7378734 + 270), 5);
  });

  it('sidereal time gains 3m56.56s (sidereal) per solar day', () => {
    const jd = julianDate(Date.UTC(2026, 0, 1));
    const gain = norm360(greenwichMeanSiderealTime(jd + 1) - greenwichMeanSiderealTime(jd));
    expect(gain * 240).toBeCloseTo(236.555, 2); // seconds of sidereal time
  });
});

describe('precession', () => {
  // Meeus example 21.b: θ Persei, J2000 position (proper motion already applied by Meeus)
  // precessed to 2028 November 13.19 TD.
  const jd = 2462088.69;
  const ra0 = 41.054063;
  const dec0 = 49.22775;

  it('Meeus example 21.b (scalar form)', () => {
    const [ra, dec] = precess(ra0, dec0, jd);
    expect(ra).toBeCloseTo(41.547214, 5);
    expect(dec).toBeCloseTo(49.348483, 5);
  });

  it('the matrix form agrees with the scalar form', () => {
    const [ra, dec] = vecToSpherical(apply(precessionMatrix(jd), sphericalToVec(ra0, dec0)));
    expect(ra).toBeCloseTo(41.547214, 5);
    expect(dec).toBeCloseTo(49.348483, 5);
  });

  it('is the identity at J2000', () => {
    const [ra, dec] = precess(200, -30, 2451545.0);
    expect(ra).toBeCloseTo(200, 10);
    expect(dec).toBeCloseTo(-30, 10);
  });

  it('moves the pole by about 50 arcseconds a year', () => {
    // The J2000 pole, seen in the frame of date 100 years later, is ~0.557° from the new pole.
    const [, dec] = vecToSpherical(apply(precessionMatrix(2451545 + 36525), [0, 0, 1]));
    expect(90 - dec).toBeCloseTo(0.5567, 3);
  });
});

describe('equatorial to horizontal', () => {
  // Meeus example 13.b: Venus from the US Naval Observatory, 1987 April 10, 19h21m UT.
  const lat = dms(1, 38, 55, 17);
  const lon = -dms(1, 77, 3, 56);
  const ra = hms(23, 9, 16.641);
  const dec = dms(-1, 6, 43, 11.61);
  const apparentGst = hms(8, 34, 56.853);
  const lst = apparentGst + lon;

  it('Meeus example 13.b (scalar form)', () => {
    const h = equatorialToHorizontal(ra, dec, lat, lst);
    expect(h.alt).toBeCloseTo(15.1249, 3);
    expect(h.az).toBeCloseTo(68.0337 + 180, 3); // Meeus azimuth is from South
  });

  it('the matrix form agrees with the scalar form', () => {
    const h = horizonVecToAltAz(
      apply(equatorialToHorizontalMatrix(lat, lst), sphericalToVec(ra, dec)),
    );
    expect(h.alt).toBeCloseTo(15.1249, 3);
    expect(h.az).toBeCloseTo(248.0337, 3);
  });

  it('agrees with the scalar form across many random positions', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const r = rnd() * 360;
      const d = rnd() * 178 - 89;
      const la = rnd() * 178 - 89;
      const ls = rnd() * 360;
      const a = equatorialToHorizontal(r, d, la, ls);
      const b = horizonVecToAltAz(apply(equatorialToHorizontalMatrix(la, ls), sphericalToVec(r, d)));
      expect(b.alt).toBeCloseTo(a.alt, 8);
      if (Math.abs(a.alt) < 89.9) expect(norm180(b.az - a.az)).toBeCloseTo(0, 6);
    }
  });

  it('puts a star on the meridian due south at its culmination (northern observer)', () => {
    const h = equatorialToHorizontal(100, 10, 45, 100);
    expect(h.alt).toBeCloseTo(55, 10);
    expect(h.az).toBeCloseTo(180, 10);
  });

  it('puts the celestial pole at altitude = latitude, due north', () => {
    for (const latDeg of [10, 45, 80]) {
      const h = equatorialToHorizontal(0, 90, latDeg, 123);
      expect(h.alt).toBeCloseTo(latDeg, 8);
    }
    const v = apply(equatorialToHorizontalMatrix(51.5, 42), [0, 0, 1]);
    expect(horizonVecToAltAz(v).az).toBeCloseTo(0, 8);
  });

  it('a star rises in the east when on the celestial equator', () => {
    // Hour angle −90° (6 hours before transit): altitude 0, azimuth 90.
    const h = equatorialToHorizontal(0, 0, 40, -90);
    expect(h.alt).toBeCloseTo(0, 8);
    expect(h.az).toBeCloseTo(90, 8);
  });

  it('skyFrame includes precession', () => {
    // At J2000 the frame matrices coincide; a century later they differ by precession.
    const f2000 = skyFrame(Date.UTC(2000, 0, 1, 12), 40, 0);
    const v = sphericalToVec(10, 20);
    const a = apply(f2000.j2000ToHorizon, v);
    const b = apply(f2000.ofDateToHorizon, v);
    expect(separation(a, b)).toBeLessThan(1e-6);
    const f2100 = skyFrame(Date.UTC(2100, 0, 1, 12), 40, 0);
    expect(
      separation(apply(f2100.j2000ToHorizon, v), apply(f2100.ofDateToHorizon, v)),
    ).toBeGreaterThan(1);
  });
});

describe('sun', () => {
  it('Meeus example 25.a: 1992 October 13.0 TD', () => {
    const s = sunPosition(2448908.5);
    expect(s.lambda).toBeCloseTo(199.90895, 3);
    expect(s.ra).toBeCloseTo(hms(13, 13, 31.4), 3);
    expect(s.dec).toBeCloseTo(dms(-1, 7, 47, 6), 2);
  });

  it('crosses the equator near the March equinox', () => {
    const s = sunPosition(julianDate(Date.UTC(2026, 2, 20, 14, 46)));
    expect(Math.abs(s.dec)).toBeLessThan(0.02);
  });

  it('is high at local noon in summer and below the horizon at midnight', () => {
    // Toronto, 2026-06-21. Local solar noon is about 17:20 UTC.
    const lat = 43.65;
    const lon = -79.38;
    const noon = Date.UTC(2026, 5, 21, 17, 20);
    const f = skyFrame(noon, lat, lon);
    const s = sunPosition(f.jd);
    const h = equatorialToHorizontal(s.ra, s.dec, lat, f.lst);
    expect(h.alt).toBeCloseTo(90 - lat + 23.44, 0);
    const f2 = skyFrame(noon + 12 * 3600_000, lat, lon);
    const s2 = sunPosition(f2.jd);
    expect(equatorialToHorizontal(s2.ra, s2.dec, lat, f2.lst).alt).toBeLessThan(-20);
  });

  it('names twilight phases', () => {
    expect(skyPhase(10)).toBe('day');
    expect(skyPhase(-3)).toBe('civil twilight');
    expect(skyPhase(-9)).toBe('nautical twilight');
    expect(skyPhase(-15)).toBe('astronomical twilight');
    expect(skyPhase(-30)).toBe('night');
  });
});
