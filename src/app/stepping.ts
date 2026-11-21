// "Same time each night": the local clock time stays put and the calendar date steps forward
// (or back) by a fixed amount: a day, a month, a year, a thousand years.
//
// Every step is computed from the anchor (the moment stepping started), never from the previous
// step, so nothing drifts: Jan 31 + 1 month is Feb 28 (or 29) but + 2 months is Mar 31, Feb 29 + 1
// year is Feb 28, and a daylight-saving gap on one day doesn't shift every later step by an hour.
//
// Steps of whole years keep the same calendar date, so the Sun is in nearly the same place each
// step and the sky changes only by precession and the stars' motions. But the number of days in
// N calendar years varies with leap days, and each extra or missing day turns the whole sky by
// about 1° at a fixed clock time, so year steps wobble. A fixed number of days avoids that: 12,053
// days is 33 Gregorian years to within 0.003 days, so `12053d` steps keep the calendar date (to a
// day over 10,000 years) and turn the sky by exactly the same amount every step.

import { localParts, localToUnixMs, type LocalParts } from './timezone';
import { utcMs } from '../astro/time';

export type StepUnit = 'd' | 'w' | 'mo' | 'y';

export interface Step {
  /** Number of units per step; negative steps backwards. Never 0. */
  count: number;
  unit: StepUnit;
}

/** Presets for the controls, smallest first (forward direction). */
export const STEP_PRESETS: Step[] = [
  { count: 1, unit: 'd' },
  { count: 1, unit: 'w' },
  { count: 1, unit: 'mo' },
  { count: 1, unit: 'y' },
  { count: 10, unit: 'y' },
  { count: 100, unit: 'y' },
  { count: 1000, unit: 'y' },
  { count: 12053, unit: 'd' }, // ≈ 33 years, smooth (no leap-day wobble)
];

/** Mean length of a Gregorian year in days. */
const GREGORIAN_YEAR = 365.2425;

export const DEFAULT_STEP: Step = { count: 1, unit: 'd' };

/** Steps per second: presets, default and limits. */
export const SPS_PRESETS = [1, 2, 5, 10, 20, 30, 60];
export const DEFAULT_SPS = 10;
export const MIN_SPS = 0.1;
export const MAX_SPS = 120;

/** Approximate days per unit, for bounding and ordering step sizes. */
const UNIT_DAYS: Record<StepUnit, number> = { d: 1, w: 7, mo: 30.44, y: 365.2425 };
/** No single step may be longer than the whole supported range (30,000 years). */
const MAX_STEP_DAYS = 30_000 * 365.25;

/** Parse "1d", "7d", "2w", "1mo", "100y", "-10y". Returns null if malformed, zero or too large. */
export function parseStep(v: string): Step | null {
  const m = /^\s*([+-]?\d{1,7})\s*(d|w|mo|y)\s*$/i.exec(v);
  if (!m) return null;
  const count = Number(m[1]);
  const unit = m[2].toLowerCase() as StepUnit;
  if (count === 0 || Math.abs(count) * UNIT_DAYS[unit] > MAX_STEP_DAYS) return null;
  return { count, unit };
}

/** "100y", "-1d": the URL form. */
export function formatStep(step: Step): string {
  return `${step.count}${step.unit}`;
}

const UNIT_NAMES: Record<StepUnit, [string, string]> = {
  d: ['day', 'days'],
  w: ['week', 'weeks'],
  mo: ['month', 'months'],
  y: ['year', 'years'],
};

/**
 * "1 day", "100 years", "1,000 years", "12,053 days (≈ 33 years)" (direction is shown separately).
 * Day steps of a year or more also give their length in years.
 */
export function stepLabel(step: Step): string {
  const n = Math.abs(step.count);
  const [one, many] = UNIT_NAMES[step.unit];
  const base = `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
  if (step.unit === 'd' && n >= 365) {
    const years = Math.round((n / GREGORIAN_YEAR) * 10) / 10;
    return `${base} (≈ ${years.toLocaleString('en-US')} ${years === 1 ? 'year' : 'years'})`;
  }
  return base;
}

/** Approximate length of a step in days (ignoring direction), for ordering presets. */
export function stepDays(step: Step): number {
  return Math.abs(step.count) * UNIT_DAYS[step.unit];
}

export function sameStep(a: Step, b: Step): boolean {
  return Math.abs(a.count) === Math.abs(b.count) && a.unit === b.unit;
}

/** The next larger (dir 1) or smaller (dir −1) preset, keeping the direction of `step`. */
export function nextStepPreset(step: Step, dir: 1 | -1): Step {
  const sign = step.count < 0 ? -1 : 1;
  const size = stepDays(step);
  const sorted = [...STEP_PRESETS].sort((a, b) => stepDays(a) - stepDays(b));
  const pick =
    dir > 0
      ? sorted.find((s) => stepDays(s) > size * 1.0001) ?? sorted[sorted.length - 1]
      : [...sorted].reverse().find((s) => stepDays(s) < size * 0.9999) ?? sorted[0];
  return { count: sign * pick.count, unit: pick.unit };
}

function daysInMonth(year: number, month: number): number {
  return new Date(utcMs(year, month + 1, 0)).getUTCDate();
}

/**
 * The calendar date `n` units after the given one, keeping the day of month where it exists
 * (otherwise the last day of the month).
 */
export function addToDate(l: LocalParts, unit: StepUnit, n: number): { year: number; month: number; day: number } {
  if (unit === 'd' || unit === 'w') {
    const d = new Date(utcMs(l.year, l.month, l.day + (unit === 'w' ? 7 * n : n)));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  const months = unit === 'mo' ? n : 12 * n;
  const total = l.month - 1 + months;
  const year = l.year + Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(l.day, daysInMonth(year, month)) };
}

/**
 * Builds a function giving the moment of step k from an anchor: the same local clock time in `tz`,
 * k steps of `step` later. k = 0 is the anchor itself.
 */
export function makeStepper(tz: string, step: Step): (anchorMs: number, k: number) => number {
  let cachedAnchor = NaN;
  let parts: LocalParts | null = null;
  return (anchorMs, k) => {
    if (k === 0) return anchorMs;
    if (anchorMs !== cachedAnchor || !parts) {
      parts = localParts(anchorMs, tz);
      cachedAnchor = anchorMs;
    }
    const date = addToDate(parts, step.unit, step.count * k);
    return localToUnixMs({ ...parts, ...date }, tz);
  };
}
