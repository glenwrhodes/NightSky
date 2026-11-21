import { describe, expect, it } from 'vitest';
import { SimClock, type Stepping } from '../src/app/clock';
import { DEFAULT_STATE, parseHash, toHash } from '../src/app/state';
import {
  addToDate,
  formatStep,
  makeStepper,
  nextStepPreset,
  parseStep,
  stepLabel,
} from '../src/app/stepping';
import { localParts } from '../src/app/timezone';
import { apply, separation } from '../src/astro/math';
import { horizonVecToAltAz, skyFrame } from '../src/astro/coords';
import { equatorPole } from '../src/astro/precession';
import { sunJ2000 } from '../src/astro/sun';
import { MAX_TIME_MS, MIN_TIME_MS, julianDateTT, utcMs } from '../src/astro/time';
import { loadCatalog } from '../src/sky/catalog';
import { positionAt } from '../src/sky/motion';

const DAY = 86_400_000;
const step = (s: string) => parseStep(s)!;
const local = (ms: number, tz: string) => localParts(ms, tz);
const stepping = (tz: string, s: string, perSecond: number): Stepping => ({ perSecond, at: makeStepper(tz, step(s)) });

describe('step sizes', () => {
  it('parses and formats steps', () => {
    expect(parseStep('1d')).toEqual({ count: 1, unit: 'd' });
    expect(parseStep('-100y')).toEqual({ count: -100, unit: 'y' });
    expect(parseStep('1mo')).toEqual({ count: 1, unit: 'mo' });
    expect(parseStep('2W')).toEqual({ count: 2, unit: 'w' });
    expect(parseStep('12053d')).toEqual({ count: 12053, unit: 'd' });
    expect(formatStep({ count: -10, unit: 'y' })).toBe('-10y');
  });

  it('rejects zero, malformed and longer-than-the-range steps', () => {
    // 10,999,999 days is 30,116 years: longer than the whole range.
    for (const bad of ['0d', '', 'y', '1.5y', '10x', '1 decade', '40000y', '10999999d']) {
      expect(parseStep(bad), bad).toBeNull();
    }
    expect(parseStep('30000y')).not.toBeNull();
  });

  it('labels steps, giving day steps of a year or more in years too', () => {
    expect(stepLabel(step('1d'))).toBe('1 day');
    expect(stepLabel(step('-1000y'))).toBe('1,000 years');
    expect(stepLabel(step('1mo'))).toBe('1 month');
    expect(stepLabel(step('12053d'))).toBe('12,053 days (≈ 33 years)');
  });

  it('steps through the presets by size, keeping direction', () => {
    expect(nextStepPreset(step('1d'), 1)).toEqual(step('1w'));
    expect(nextStepPreset(step('10y'), 1)).toEqual(step('12053d')); // 33 years sits between 10 and 100
    expect(nextStepPreset(step('12053d'), 1)).toEqual(step('100y'));
    expect(nextStepPreset(step('-100y'), -1)).toEqual(step('-12053d'));
    expect(nextStepPreset(step('1000y'), 1)).toEqual(step('1000y'));
    expect(nextStepPreset(step('1d'), -1)).toEqual(step('1d'));
  });
});

describe('same time each night: dates', () => {
  it('keeps the local clock time across a daylight-saving change', () => {
    // London 21:00 on 28 March 2026 (GMT); British Summer Time starts on the 29th.
    const anchor = utcMs(2026, 3, 28, 21);
    const next = makeStepper('Europe/London', step('1d'))(anchor, 1);
    expect(next).toBe(utcMs(2026, 3, 29, 20)); // 21:00 BST = 20:00 UTC
    expect(local(next, 'Europe/London')).toMatchObject({ day: 29, hour: 21, minute: 0 });
  });

  it('a day step is 24 hours of local time, a week is seven', () => {
    const at = makeStepper('Etc/UTC', step('1w'));
    expect(at(utcMs(2026, 12, 21), 3) - utcMs(2026, 12, 21)).toBe(21 * DAY);
  });

  it('month steps keep the day where it exists, from the anchor (no drift)', () => {
    const at = makeStepper('Etc/UTC', step('1mo'));
    const jan31 = utcMs(2026, 1, 31, 21);
    expect(at(jan31, 1)).toBe(utcMs(2026, 2, 28, 21));
    expect(at(jan31, 2)).toBe(utcMs(2026, 3, 31, 21)); // back to the 31st
    expect(at(utcMs(2028, 1, 31, 21), 1)).toBe(utcMs(2028, 2, 29, 21)); // leap year
    expect(at(jan31, -2)).toBe(utcMs(2025, 11, 30, 21));
  });

  it('year steps keep the calendar date (Feb 29 → Feb 28 in common years)', () => {
    const at = makeStepper('Etc/UTC', step('1y'));
    const leapDay = utcMs(2028, 2, 29, 21);
    expect(at(leapDay, 1)).toBe(utcMs(2029, 2, 28, 21));
    expect(at(leapDay, 4)).toBe(utcMs(2032, 2, 29, 21));
  });

  it('steps across year 0 into BC and out to the far future', () => {
    expect(makeStepper('Etc/UTC', step('-1y'))(utcMs(2, 6, 1), 3)).toBe(utcMs(-1, 6, 1)); // 2 BC
    expect(addToDate({ year: 1, month: 3, day: 1, hour: 0, minute: 0, second: 0 }, 'd', -1)).toEqual({
      year: 1,
      month: 2,
      day: 28,
    });
    const k11 = makeStepper('Pacific/Honolulu', step('1000y'))(utcMs(2027, 1, 21, 7), 11);
    expect(local(k11, 'Pacific/Honolulu')).toMatchObject({ year: 13027, month: 1, day: 20, hour: 21 });
  });

  it('keeps the clock time even when the zone changes from local mean time to standard time', () => {
    // Honolulu was on local mean time (−10:31:26) in 1800 and on −10:30 in 1900.
    const anchor = utcMs(1800, 7, 1, 7, 31, 26); // 21:00 LMT
    expect(local(anchor, 'Pacific/Honolulu')).toMatchObject({ hour: 21, minute: 0, second: 0 });
    const later = makeStepper('Pacific/Honolulu', step('100y'))(anchor, 1);
    expect(local(later, 'Pacific/Honolulu')).toMatchObject({ year: 1900, hour: 21, minute: 0, second: 0 });
  });

  it('fixed day steps are exactly that many days apart', () => {
    const at = makeStepper('Etc/UTC', step('12053d'));
    const a = utcMs(2026, 12, 21);
    expect(at(a, 7) - at(a, 6)).toBe(12053 * DAY);
    // 12,053 days is 33 Gregorian years to 0.003 days: after 350 steps the date has moved one day.
    expect(local(at(a, 350), 'Etc/UTC')).toMatchObject({ year: 2026 + 350 * 33, month: 12, day: 20 });
  });
});

describe('same time each night: the clock', () => {
  const anchor = utcMs(2026, 12, 21, 21);
  const at = makeStepper('Etc/UTC', step('1d'));

  it('shows the anchor on the first frame, then one step per 1/sps seconds', () => {
    const c = new SimClock(anchor, 600, true);
    c.reset(anchor, 600, true, stepping('Etc/UTC', '1d', 10));
    expect(c.now(5000)).toBe(anchor); // first reading, whatever the page clock says
    expect(c.now(5099)).toBe(anchor);
    expect(c.now(5100)).toBe(at(anchor, 1));
    expect(c.now(6000)).toBe(at(anchor, 10));
    expect(c.now(6050)).toBe(at(anchor, 10)); // holds between steps
  });

  it('gives the same sky at the same moment at 24, 60 and 144 frames a second', () => {
    const run = (fps: number) => {
      const c = new SimClock(anchor, 1, true);
      c.reset(anchor, 1, true, stepping('Etc/UTC', '1d', 30));
      const seen = new Map<number, number>();
      for (let i = 0; i <= 3 * fps; i++) {
        const ms = (i * 1000) / fps;
        seen.set(Math.round(ms * 1000), c.now(ms));
      }
      return seen;
    };
    const a = run(24);
    const b = run(60);
    const c = run(144);
    // Every moment sampled by two runs shows the same step (0.5 s, 1 s, ... are shared by all three).
    for (const [t, v] of a) {
      if (b.has(t)) expect(b.get(t)).toBe(v);
      if (c.has(t)) expect(c.get(t)).toBe(v);
    }
    expect(a.get(3_000_000)).toBe(at(anchor, 90));
    expect(c.get(3_000_000)).toBe(at(anchor, 90));
  });

  it('at 60 steps a second on a 60 fps page clock, every frame is the next step (no skips or repeats)', () => {
    const c = new SimClock(anchor, 1, true);
    c.reset(anchor, 1, true, stepping('Etc/UTC', '1d', 60));
    for (let i = 0; i < 600; i++) expect(c.now((i * 1000) / 60)).toBe(at(anchor, i));
  });

  it('pauses and resumes from the step it was on', () => {
    const c = new SimClock(anchor, 1, true);
    c.reset(anchor, 1, true, stepping('Etc/UTC', '1d', 10));
    c.now(0);
    c.setPlaying(false, 1000); // on step 10
    expect(c.now(9000)).toBe(at(anchor, 10));
    c.setPlaying(true, 9000);
    expect(c.now(9500)).toBe(at(anchor, 15));
  });

  it('switches between continuous and stepped without a jump', () => {
    const c = new SimClock(anchor, 3600, true);
    c.reset(anchor, 3600, true, null);
    c.now(0);
    c.setStepping(stepping('Etc/UTC', '1d', 10), 1000); // continuous ran 1 hour
    expect(c.now(1000)).toBe(anchor + 3600_000);
    expect(c.now(2000)).toBe(anchor + 3600_000 + 10 * DAY);
    c.setStepping(null, 2000);
    expect(c.now(3000)).toBe(anchor + 2 * 3600_000 + 10 * DAY);
  });

  it('stops on the last step inside the range at AD 17,000', () => {
    const start = utcMs(16990, 6, 1, 21);
    const c = new SimClock(start, 1, true, MIN_TIME_MS, MAX_TIME_MS);
    c.reset(start, 1, true, stepping('Etc/UTC', '1y', 10));
    c.now(0);
    expect(c.now(500)).toBe(utcMs(16995, 6, 1, 21));
    expect(c.now(5000)).toBe(utcMs(17000, 6, 1, 21)); // step 50 would be AD 17,040
    expect(c.playing).toBe(false);
    expect(c.stoppedAt).toBe('end');
    expect(c.now(99_000)).toBe(utcMs(17000, 6, 1, 21)); // and stays there
  });

  it('stops on the last step inside the range at 13,000 BC when stepping back', () => {
    const start = utcMs(-12000, 6, 1, 21);
    const c = new SimClock(start, 1, true, MIN_TIME_MS, MAX_TIME_MS);
    c.reset(start, 1, true, stepping('Etc/UTC', '-100y', 10));
    c.now(0);
    expect(c.now(60_000)).toBe(utcMs(-12900, 6, 1, 21)); // −13000 would be before 13,000 BC
    expect(c.stoppedAt).toBe('start');
  });

  it('stops at once if the next big step would leave the range', () => {
    const start = utcMs(16500, 1, 1);
    const c = new SimClock(start, 1, true, MIN_TIME_MS, MAX_TIME_MS);
    c.reset(start, 1, true, stepping('Etc/UTC', '1000y', 1));
    c.now(0);
    expect(c.now(1000)).toBe(start);
    expect(c.stoppedAt).toBe('end');
  });
});

describe('same time each night: the URL', () => {
  it('defaults to continuous mode, one day per step, ten steps a second', () => {
    expect(DEFAULT_STATE.mode).toBe('continuous');
    expect(DEFAULT_STATE.step).toEqual(step('1d'));
    expect(DEFAULT_STATE.sps).toBe(10);
  });

  it('reads mode, step and speed, ignoring bad values', () => {
    const s = parseHash('#mode=nightly&step=-100y&sps=30');
    expect(s.mode).toBe('nightly');
    expect(s.step).toEqual(step('-100y'));
    expect(s.sps).toBe(30);
    const bad = parseHash('#mode=sideways&step=0d&sps=1000');
    expect(bad.mode).toBe('continuous');
    expect(bad.step).toEqual(DEFAULT_STATE.step);
    expect(bad.sps).toBe(DEFAULT_STATE.sps);
  });

  it('round-trips', () => {
    for (const h of ['#mode=nightly&step=12053d&sps=30&play=1', '#mode=nightly&step=-1mo&sps=0.5', '#step=7d']) {
      const s = parseHash(h);
      expect(parseHash(toHash(s))).toEqual(s);
    }
  });
});

// The shot from the README: from the North Pole, same time each December night, 12,053-day steps
// (≈ 33 years, so the sky turns by the same amount every step) at 30 steps a second.
const POLE_SHOT = '#loc=northpole&t=2026-12-21T00:00Z&mode=nightly&step=12053d&sps=30&play=1&grid=1&ui=0';

describe('the pole shot: Polaris to Vega', () => {
  const s = parseHash(POLE_SHOT);
  const catalog = loadCatalog();
  const polarDistance = (key: string, ms: number) => {
    const f = skyFrame(ms, 90, 0);
    return separation(positionAt(catalog.find(key)!, f.epoch - 2000).vec, equatorPole(f.epoch));
  };

  it('sets up stepped mode from the URL alone', () => {
    expect(s).toMatchObject({ mode: 'nightly', sps: 30, playing: true, ui: false, grid: true, lat: 90 });
    expect(s.step).toEqual(step('12053d'));
  });

  it('runs from Polaris at the pole to Vega near it, in the dark, and stops at AD 17,000', () => {
    const c = new SimClock(s.t, s.rate, s.playing, MIN_TIME_MS, MAX_TIME_MS);
    c.reset(s.t, s.rate, s.playing, { perSecond: s.sps, at: makeStepper(s.tz, s.step) });
    let closestVega = { deg: 99, seconds: 0, year: 0 };
    let previousPolaris = 0;
    for (let i = 0; i <= 30 * 20; i += 3) {
      const seconds = i / 30;
      const t = c.now(seconds * 1000);
      const polaris = polarDistance('Alp UMi', t);
      const vega = polarDistance('Alp Lyr', t);
      const year = new Date(t).getUTCFullYear();
      if (i === 0) expect(polaris).toBeLessThan(0.7);
      // Polaris still nears the pole until ~2100, then moves steadily away.
      if (year > 2150 && year < 10000) expect(polaris).toBeGreaterThan(previousPolaris);
      previousPolaris = polaris;
      if (vega < closestVega.deg) closestVega = { deg: vega, seconds, year };
      // Polar night every step: the Sun stays well below the horizon.
      const f = skyFrame(t, 90, 0);
      expect(horizonVecToAltAz(apply(f.j2000ToHorizon, sunJ2000(julianDateTT(f.jd)))).alt).toBeLessThan(-18);
    }
    expect(closestVega.deg).toBeLessThan(6);
    expect(closestVega.year).toBeGreaterThan(13400);
    expect(closestVega.year).toBeLessThan(13800);
    expect(closestVega.seconds).toBeGreaterThan(10);
    expect(closestVega.seconds).toBeLessThan(13);
    // ~15 s in, it reaches the end of the range and holds there.
    expect(c.playing).toBe(false);
    expect(c.stoppedAt).toBe('end');
    expect(new Date(c.now(20_000)).getUTCFullYear()).toBeGreaterThanOrEqual(16950);
  });
});
