import { describe, expect, it } from 'vitest';
import {
  apply,
  mul,
  norm180,
  norm360,
  separation,
  sphericalToVec,
  vecToSpherical,
} from '../src/astro/math';
import {
  MAX_TIME_MS,
  MIN_TIME_MS,
  clampTime,
  deltaT,
  earthRotationAngle,
  formatYear,
  julianDate,
  unixMsFromJulianDate,
  utcMs,
  utcYear,
} from '../src/astro/time';
import {
  eclipticPole,
  equatorPole,
  julianEpoch,
  obliquity,
  precessionMatrix,
} from '../src/astro/precession';
import { celestialToIntermediate, cioLocator } from '../src/astro/cio';
import {
  equatorialToHorizontal,
  equatorialToHorizontalMatrix,
  horizonVecToAltAz,
  skyFrame,
} from '../src/astro/coords';
import { skyPhase, sunJ2000 } from '../src/astro/sun';
import {
  greenwichMeanSiderealTime,
  localSiderealTime,
  precess as precess1976,
  precessionMatrix as precessionMatrix1976,
} from './reference/iau1976';

const hms = (h: number, m: number, s: number) => (h + m / 60 + s / 3600) * 15;
const dms = (sign: 1 | -1, d: number, m: number, s: number) => sign * (d + m / 60 + s / 3600);
const DAY = 86_400_000;
const ARCSEC = 1 / 3600;

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

  it('builds dates for any year, including 0–99 and BC (astronomical numbering)', () => {
    expect(utcYear(utcMs(50, 1, 1))).toBe(50); // Date.UTC would give 1950
    expect(utcYear(utcMs(-2829, 6, 21))).toBe(-2829);
    // Meeus example 7.b uses the Julian calendar; in the proleptic Gregorian calendar
    // JD 0 (−4712 January 1.5, Julian) is −4713 November 24.5.
    expect(julianDate(utcMs(-4713, 11, 24, 12))).toBeCloseTo(0, 9);
  });

  it('Earth rotation angle matches the ERFA/SOFA test value', () => {
    // eraEra00(2400000.5, 54388.0) = 0.4022837240028158102 rad
    expect(earthRotationAngle(2400000.5 + 54388.0)).toBeCloseTo((0.4022837240028158102 * 180) / Math.PI, 8);
  });

  it('ΔT is about a minute now and grows to hours far from today', () => {
    expect(deltaT(julianDate(Date.UTC(1820, 0, 1)))).toBeCloseTo(-20, 0);
    const now = deltaT(julianDate(Date.UTC(2026, 0, 1)));
    expect(now).toBeGreaterThan(30);
    expect(now).toBeLessThan(200); // true value ~69 s; the long-term parabola gives ~116 s
    expect(deltaT(julianDate(utcMs(-2999))) / 3600).toBeGreaterThan(15);
  });

  it('clamps to the supported range and names the years', () => {
    expect(utcYear(MIN_TIME_MS)).toBe(-12999);
    expect(utcYear(MAX_TIME_MS)).toBe(17000);
    expect(clampTime(utcMs(-20000))).toBe(MIN_TIME_MS);
    expect(clampTime(utcMs(20000))).toBe(MAX_TIME_MS);
    expect(clampTime(Date.UTC(2027, 0, 1))).toBe(Date.UTC(2027, 0, 1));
    expect(formatYear(-12999)).toBe('13,000 BC');
    expect(formatYear(17000)).toBe('AD 17,000');
    expect(formatYear(0)).toBe('1 BC');
    expect(formatYear(2027)).toBe('2027');
  });
});

describe('reference: IAU 1982 sidereal time (the old model, kept for cross-checks)', () => {
  it('Meeus example 12.a: GMST at 1987 April 10, 0h UT', () => {
    const jd = julianDate(Date.UTC(1987, 3, 10));
    expect(greenwichMeanSiderealTime(jd)).toBeCloseTo(hms(13, 10, 46.3668), 5);
  });

  it('Meeus example 12.b: GMST at 1987 April 10, 19h21m UT', () => {
    const jd = julianDate(Date.UTC(1987, 3, 10, 19, 21, 0));
    expect(greenwichMeanSiderealTime(jd)).toBeCloseTo(128.7378734, 5);
  });
});

describe('long-term precession (Vondrák, Capitaine & Wallace 2011)', () => {
  it('matches the ERFA/SOFA test values for the equator pole, ecliptic pole and matrix', () => {
    const veq = equatorPole(-2500);
    expect(veq[0]).toBeCloseTo(-0.3586652560237326659, 13);
    expect(veq[1]).toBeCloseTo(-0.1996978910771128475, 13);
    expect(veq[2]).toBeCloseTo(0.9118552442250819624, 13);

    const vec = eclipticPole(-1500);
    expect(vec[0]).toBeCloseTo(0.4768625676477096525e-3, 13);
    expect(vec[1]).toBeCloseTo(-0.4052259533091875112, 13);
    expect(vec[2]).toBeCloseTo(0.9142164401096448012, 13);

    const rp = precessionMatrix(1666.666);
    const expected = [
      0.9967044141159213819, 0.743780189319321084e-1, 0.3237624409345603401e-1,
      -0.7437802731819618167e-1, 0.997229389445453307, -0.1205768842723593346e-2,
      -0.3237622482766575399e-1, -0.1206286039697609008e-2, 0.9994750246704010914,
    ];
    expected.forEach((v, i) => expect(rp[i]).toBeCloseTo(v, 13));
  });

  it('Meeus example 21.b (θ Persei to 2028 Nov 13) agrees with IAU 1976 to under an arcsecond', () => {
    const jd = 2462088.69;
    const [ra, dec] = vecToSpherical(apply(precessionMatrix(julianEpoch(jd)), sphericalToVec(41.054063, 49.22775)));
    expect(Math.abs(ra - 41.547214) * Math.cos((dec * Math.PI) / 180)).toBeLessThan(ARCSEC);
    expect(Math.abs(dec - 49.348483)).toBeLessThan(ARCSEC);
    // and the reference implementation reproduces Meeus exactly
    const [ra76, dec76] = precess1976(41.054063, 49.22775, jd);
    expect(ra76).toBeCloseTo(41.547214, 5);
    expect(dec76).toBeCloseTo(49.348483, 5);
  });

  it('obliquity: 23°26′21.406″ at J2000, falling 47″ a century, between 22° and 24.5° over the range', () => {
    expect(obliquity(2000) * 3600).toBeCloseTo(84381.406, 2);
    expect(((obliquity(2100) - obliquity(1900)) / 2) * 3600).toBeCloseTo(-46.8, 0);
    let min = { y: 0, e: 99 };
    let max = 0;
    for (let y = -13000; y <= 17000; y += 10) {
      const e = obliquity(y);
      if (y > 2000 && e < min.e) min = { y, e };
      if (y < 2000) max = Math.max(max, e);
    }
    // Next minimum around AD 11,800 (Laskar); the model gives ~22.6° near AD 12,000.
    expect(min.y).toBeGreaterThan(10800);
    expect(min.y).toBeLessThan(12800);
    expect(min.e).toBeGreaterThan(22.1);
    expect(min.e).toBeLessThan(22.8);
    expect(max).toBeGreaterThan(24.0);
    expect(max).toBeLessThan(24.5);
  });

  it('pins how far the old IAU 1976 model stays accurate (compared with the long-term model)', () => {
    const worstError = (year: number) => {
      const a = precessionMatrix1976(2451545 + (year - 2000) * 365.25);
      const b = precessionMatrix(year);
      let worst = 0;
      for (let ra = 0; ra < 360; ra += 30) {
        for (let dec = -80; dec <= 80; dec += 20) {
          const v = sphericalToVec(ra, dec);
          worst = Math.max(worst, separation(apply(a, v), apply(b, v)));
        }
      }
      return worst;
    };
    // Within AD 1000–3000 the two agree to a few arcseconds...
    for (const y of [1000, 1500, 2100, 2500, 3000]) expect(worstError(y)).toBeLessThan(5 * ARCSEC);
    // ...by 3000 BC / AD 6000 they are about an arcminute apart...
    expect(worstError(-3000)).toBeLessThan(2 / 60);
    expect(worstError(6000)).toBeLessThan(4 / 60);
    // ...and by the ends of the range IAU 1976 is degrees off.
    expect(worstError(14000)).toBeGreaterThan(3);
    expect(worstError(-13000)).toBeGreaterThan(5);
  });
});

describe('Earth orientation (Earth rotation angle + CIO)', () => {
  it('the CIO locator is negligible near J2000 and grows to degrees over millennia', () => {
    expect(Math.abs(cioLocator(2000))).toBeLessThan(1e-6);
    expect(Math.abs(cioLocator(2100)) * 3600).toBeLessThan(0.05);
    expect(Math.abs(cioLocator(-3000))).toBeGreaterThan(1);
    expect(Math.abs(cioLocator(14000))).toBeGreaterThan(5);
  });

  it('the intermediate frame has the precessed pole as its z axis', () => {
    for (const y of [-12000, -3000, 2000, 9000, 16000]) {
      const pole = apply(celestialToIntermediate(y), equatorPole(y));
      expect(pole[2]).toBeCloseTo(1, 12);
    }
  });

  it('agrees with the classical IAU 1976 + sidereal-time pipeline to 2″ from 1900 to 2100', () => {
    for (const ms of [Date.UTC(1900, 5, 1, 3), Date.UTC(1987, 3, 10, 19, 21), Date.UTC(2026, 10, 21, 8), Date.UTC(2100, 0, 1)]) {
      const jd = julianDate(ms);
      const old = mul(equatorialToHorizontalMatrix(40, localSiderealTime(jd, -75)), precessionMatrix1976(jd));
      const now = skyFrame(ms, 40, -75).j2000ToHorizon;
      for (let ra = 0; ra < 360; ra += 45) {
        for (let dec = -60; dec <= 60; dec += 30) {
          const v = sphericalToVec(ra, dec);
          expect(separation(apply(old, v), apply(now, v))).toBeLessThan(2 * ARCSEC);
        }
      }
    }
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
    const h = horizonVecToAltAz(apply(equatorialToHorizontalMatrix(lat, lst), sphericalToVec(ra, dec)));
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
      expect(equatorialToHorizontal(0, 90, latDeg, 123).alt).toBeCloseTo(latDeg, 8);
    }
    const v = apply(equatorialToHorizontalMatrix(51.5, 42), [0, 0, 1]);
    expect(horizonVecToAltAz(v).az).toBeCloseTo(0, 8);
  });

  it('a star rises in the east when on the celestial equator', () => {
    const h = equatorialToHorizontal(0, 0, 40, -90);
    expect(h.alt).toBeCloseTo(0, 8);
    expect(h.az).toBeCloseTo(90, 8);
  });

  it('the pole of date is at the zenith from the North Pole, at any date and time', () => {
    for (const year of [-12000, -2800, 2026, 13600]) {
      for (const h of [0, 7, 15]) {
        const f = skyFrame(utcMs(year, 3, 1, h), 90, 0);
        expect(horizonVecToAltAz(apply(f.j2000ToHorizon, equatorPole(f.epoch))).alt).toBeCloseTo(90, 6);
      }
    }
  });
});

describe('sun', () => {
  const ofDate = (jdTT: number) => vecToSpherical(apply(precessionMatrix(julianEpoch(jdTT)), sunJ2000(jdTT)));

  it('Meeus example 25.a: 1992 October 13.0 TD, within 0.01°', () => {
    // Meeus gives apparent α = 13h13m31.4s, δ = −7°47′06″ (including nutation, ~0.005° here).
    const [ra, dec] = ofDate(2448908.5);
    expect(Math.abs(ra - hms(13, 13, 31.4))).toBeLessThan(0.01);
    expect(Math.abs(dec - dms(-1, 7, 47, 6))).toBeLessThan(0.01);
  });

  it('crosses the equator at the March equinox 2026 (20 March, 14:46 UT)', () => {
    const jd = julianDate(Date.UTC(2026, 2, 20, 14, 46));
    const [, dec] = ofDate(jd + deltaT(jd) / 86400);
    expect(Math.abs(dec)).toBeLessThan(0.01);
  });

  it('is high at local noon in summer and below the horizon at midnight', () => {
    const lat = 43.65;
    const lon = -79.38;
    const noon = Date.UTC(2026, 5, 21, 17, 20); // Toronto solar noon
    const altAt = (ms: number) => {
      const f = skyFrame(ms, lat, lon);
      return horizonVecToAltAz(apply(f.j2000ToHorizon, sunJ2000(f.jd + deltaT(f.jd) / 86400))).alt;
    };
    expect(altAt(noon)).toBeCloseTo(90 - lat + 23.44, 0);
    expect(altAt(noon + 12 * 3600_000)).toBeLessThan(-20);
  });

  it('far from today it still stays on the ecliptic of date: solstice declination = obliquity', () => {
    for (const year of [-10000, -2800, 14000]) {
      let maxDec = 0;
      for (let d = 0; d < 366; d += 0.25) {
        const jd = julianDate(utcMs(year)) + d;
        maxDec = Math.max(maxDec, ofDate(jd)[1]);
      }
      expect(maxDec).toBeCloseTo(obliquity(year), 1);
    }
  });

  it('names twilight phases', () => {
    expect(skyPhase(10)).toBe('day');
    expect(skyPhase(-3)).toBe('civil twilight');
    expect(skyPhase(-9)).toBe('nautical twilight');
    expect(skyPhase(-15)).toBe('astronomical twilight');
    expect(skyPhase(-30)).toBe('night');
  });
});
