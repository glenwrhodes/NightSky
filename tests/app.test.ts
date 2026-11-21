import { describe, expect, it } from 'vitest';
import { SimClock } from '../src/app/clock';
import { DEFAULT_STATE, parseHash, parseTime, toHash, type AppState } from '../src/app/state';
import { PLACES } from '../src/app/places';
import {
  isValidTimeZone,
  localToUnixMs,
  offsetMinutes,
  parseLocal,
  solarTimeZone,
  toLocalInputValue,
} from '../src/app/timezone';
import { apply } from '../src/astro/math';
import { horizonVecToAltAz, skyFrame } from '../src/astro/coords';
import { sunPosition } from '../src/astro/sun';
import { sphericalToVec } from '../src/astro/math';
import { loadCatalog } from '../src/sky/catalog';
import { RATE_PRESETS, rateLabel, stepRate } from '../src/app/rates';

describe('time-lapse speeds', () => {
  it('labels presets and other rates', () => {
    expect(rateLabel(600)).toBe('10 min / s');
    expect(rateLabel(-3600)).toBe('1 hour / s');
    expect(rateLabel(86164.0905)).toBe('1 sidereal day / s');
    expect(rateLabel(5)).toBe('5× real time');
    expect(rateLabel(7200)).toBe('2 hours / s');
    expect(rateLabel(172800)).toBe('2 days / s');
  });

  it('steps through presets, keeping direction and stopping at the ends', () => {
    expect(stepRate(600, 1)).toBe(1800);
    expect(stepRate(600, -1)).toBe(60);
    expect(stepRate(-600, 1)).toBe(-1800);
    expect(stepRate(1, -1)).toBe(1);
    const top = RATE_PRESETS[RATE_PRESETS.length - 1].value;
    expect(stepRate(top, 1)).toBe(top);
    expect(stepRate(1000, 1)).toBe(1800); // from a custom rate to the next preset up
  });
});

describe('time-lapse clock', () => {
  it('shows the start time on the first frame, whatever the page clock reads', () => {
    const c = new SimClock(1_000_000, 600, true);
    expect(c.now(123456.7)).toBe(1_000_000);
  });

  it('advances at the rate, off the page clock only', () => {
    const c = new SimClock(0, 600, true);
    c.now(1000);
    expect(c.now(2000)).toBe(600_000); // 1 real second = 10 simulated minutes
    expect(c.now(1500)).toBe(300_000);
  });

  it('is deterministic: the same timestamps give the same times', () => {
    const run = () => {
      const c = new SimClock(5e12, 3600, true);
      return [0, 16.7, 33.3, 50, 1000].map((t) => c.now(t));
    };
    expect(run()).toEqual(run());
  });

  it('holds still while paused and resumes without a jump', () => {
    const c = new SimClock(0, 60, true);
    c.now(0);
    c.setPlaying(false, 1000); // sim = 60 s
    expect(c.now(5000)).toBe(60_000);
    c.setPlaying(true, 5000);
    expect(c.now(5000)).toBe(60_000);
    expect(c.now(6000)).toBe(120_000);
  });

  it('changes rate without a jump, and runs backwards with a negative rate', () => {
    const c = new SimClock(0, 60, true);
    c.now(0);
    c.setRate(-60, 1000);
    expect(c.now(1000)).toBe(60_000);
    expect(c.now(2000)).toBe(0);
  });

  it('setTime jumps; reset re-anchors on the next frame', () => {
    const c = new SimClock(0, 1, true);
    c.now(0);
    c.setTime(10_000, 100);
    expect(c.now(1100)).toBe(11_000);
    c.reset(500, 2, true);
    expect(c.now(9999)).toBe(500);
    expect(c.now(10999)).toBe(2500);
  });
});

describe('time zones', () => {
  it('knows DST offsets', () => {
    expect(offsetMinutes('America/New_York', Date.UTC(2026, 0, 15, 12))).toBe(-300);
    expect(offsetMinutes('America/New_York', Date.UTC(2026, 6, 15, 12))).toBe(-240);
    expect(offsetMinutes('Pacific/Honolulu', Date.UTC(2026, 6, 15, 12))).toBe(-600);
    expect(offsetMinutes('Asia/Kolkata', Date.UTC(2026, 6, 15, 12))).toBe(330);
  });

  it('converts wall-clock time to UTC, including across DST', () => {
    const p = { year: 2026, month: 7, day: 4, hour: 21, minute: 30, second: 0 };
    expect(localToUnixMs(p, 'America/New_York')).toBe(Date.UTC(2026, 6, 5, 1, 30));
    expect(localToUnixMs({ ...p, month: 12 }, 'America/New_York')).toBe(Date.UTC(2026, 11, 5, 2, 30));
    expect(parseLocal('2027-01-20T21:00', 'Pacific/Honolulu')).toBe(Date.UTC(2027, 0, 21, 7));
  });

  it('formats datetime-local values in the zone', () => {
    expect(toLocalInputValue(Date.UTC(2027, 0, 21, 7), 'Pacific/Honolulu')).toBe('2027-01-20T21:00');
    expect(toLocalInputValue(Date.UTC(2026, 6, 5, 1, 30), 'America/New_York')).toBe('2026-07-04T21:30');
  });

  it('rejects malformed local times', () => {
    expect(parseLocal('2027-13-01T00:00', 'Etc/UTC')).toBeNull();
    expect(parseLocal('yesterday', 'Etc/UTC')).toBeNull();
  });

  it('makes solar-time zones with the right (inverted) IANA sign', () => {
    expect(solarTimeZone(139.7)).toBe('Etc/GMT-9');
    expect(solarTimeZone(-155.5)).toBe('Etc/GMT+10');
    expect(solarTimeZone(3)).toBe('Etc/UTC');
    expect(offsetMinutes(solarTimeZone(139.7), Date.UTC(2026, 0, 1))).toBe(540);
  });

  it('every preset place has a valid time zone', () => {
    for (const p of PLACES) expect(isValidTimeZone(p.tz), p.tz).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('URL state', () => {
  it('uses the default scene when the hash is empty', () => {
    expect(parseHash('')).toEqual(DEFAULT_STATE);
    expect(parseHash('#')).toEqual(DEFAULT_STATE);
  });

  it('the default scene is dark, with Orion high in the south-east', () => {
    const s = DEFAULT_STATE;
    const f = skyFrame(s.t, s.lat, s.lon);
    const sun = sunPosition(f.jd);
    const sunAlt = horizonVecToAltAz(apply(f.ofDateToHorizon, sphericalToVec(sun.ra, sun.dec))).alt;
    expect(sunAlt).toBeLessThan(-18);
    const betelgeuse = loadCatalog().find('Alp Ori')!;
    const h = horizonVecToAltAz(apply(f.j2000ToHorizon, betelgeuse.vec));
    expect(h.alt).toBeGreaterThan(50);
    expect(h.az).toBeGreaterThan(90);
    expect(h.az).toBeLessThan(200);
  });

  it('sets up a whole shot from the hash', () => {
    const s = parseHash('#loc=atacama&t=2026-08-10T22:30&rate=3600&play=1&ui=0&lines=0&az=90');
    expect(s.place).toBe('Atacama Desert, Chile');
    expect(s.t).toBe(Date.UTC(2026, 7, 11, 2, 30)); // Chile is UTC−4 in August
    expect(s.rate).toBe(3600);
    expect(s.playing).toBe(true);
    expect(s.ui).toBe(false);
    expect(s.lines).toBe(false);
    expect(s.viewAz).toBe(90);
  });

  it('accepts custom coordinates with a solar time zone, or an explicit zone', () => {
    const s = parseHash('#lat=35.68&lon=139.77');
    expect(s.loc).toBe('');
    expect(s.tz).toBe('Etc/GMT-9');
    expect(s.place).toBe('35.68°N 139.77°E');
    expect(parseHash('#lat=35.68&lon=139.77&tz=Asia/Tokyo&place=Tokyo').place).toBe('Tokyo');
  });

  it('parses times in several forms', () => {
    expect(parseTime('2026-03-01T12:00:00Z', 'Asia/Tokyo', 0)).toBe(Date.UTC(2026, 2, 1, 12));
    expect(parseTime('2026-03-01T12:00+09:00', 'Etc/UTC', 0)).toBe(Date.UTC(2026, 2, 1, 3));
    expect(parseTime('2026-03-01T12:00', 'Asia/Tokyo', 0)).toBe(Date.UTC(2026, 2, 1, 3));
    expect(parseTime('1700000000000', 'Etc/UTC', 0)).toBe(1700000000000);
    expect(parseTime('now', 'Etc/UTC', 42)).toBe(42);
    expect(parseTime('garbage', 'Etc/UTC', 0)).toBeNull();
  });

  it('ignores invalid values', () => {
    const s = parseHash('#lat=200&rate=abc&tz=Nope/Nope&play=maybe&t=xyz&loc=atlantis');
    expect(s).toEqual(DEFAULT_STATE);
  });

  it('round-trips through the hash', () => {
    const states: AppState[] = [
      DEFAULT_STATE,
      { ...DEFAULT_STATE, playing: true, rate: -3600, viewAz: 42.5, grid: true, ui: false },
      parseHash('#lat=-33.9&lon=18.42&tz=Africa/Johannesburg&place=Cape%20Town&t=2026-05-01T20:00'),
      parseHash('#lat=10&lon=20'),
    ];
    for (const s of states) expect(parseHash(toHash(s))).toEqual(s);
  });
});
