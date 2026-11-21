// Local time at the observer's location, using the browser's IANA time-zone data (Intl).
//
// Years use astronomical numbering (year 0 = 1 BC, −1 = 2 BC) in the proleptic Gregorian calendar,
// which is what JavaScript dates use. Before standard time zones existed (late 1800s), Intl gives
// local mean time for the zone's city, e.g. −10:31:26 for Honolulu.

import { utcMs } from '../astro/time';

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      era: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    partsFormatter(tz);
    return true;
  } catch {
    return false;
  }
}

export interface LocalParts {
  /** Astronomical year: 0 = 1 BC, −1 = 2 BC. */
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Wall-clock fields of an instant in a time zone. */
export function localParts(unixMs: number, tz: string): LocalParts {
  const p: Record<string, string> = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(unixMs))) p[type] = value;
  const eraYear = Number(p.year);
  const bc = /^B/i.test(p.era ?? '');
  return {
    year: bc ? 1 - eraYear : eraYear,
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
  };
}

/** UTC offset of a time zone at an instant, in seconds (east positive: Tokyo = +32400). */
export function offsetSeconds(tz: string, unixMs: number): number {
  const l = localParts(unixMs, tz);
  const asUtc = utcMs(l.year, l.month, l.day, l.hour, l.minute, l.second);
  const whole = Math.floor(unixMs / 1000) * 1000;
  return Math.round((asUtc - whole) / 1000);
}

/** UTC offset in minutes, rounded (for display and tests). */
export function offsetMinutes(tz: string, unixMs: number): number {
  return Math.round(offsetSeconds(tz, unixMs) / 60);
}

/** The instant at which the wall clock in `tz` reads the given fields. */
export function localToUnixMs(l: LocalParts, tz: string): number {
  const guess = utcMs(l.year, l.month, l.day, l.hour, l.minute, l.second);
  const first = guess - offsetSeconds(tz, guess) * 1000;
  return guess - offsetSeconds(tz, first) * 1000;
}

/** "2027-01-20 21:00" (or "-2829-06-21 21:00") for an instant in a time zone. */
export function formatLocalInput(unixMs: number, tz: string): string {
  const l = localParts(unixMs, tz);
  const p = (n: number) => String(n).padStart(2, '0');
  const y = l.year < 0 ? `-${String(-l.year).padStart(4, '0')}` : String(l.year).padStart(4, '0');
  return `${y}-${p(l.month)}-${p(l.day)} ${p(l.hour)}:${p(l.minute)}`;
}

/**
 * Parse "YYYY-MM-DD HH:MM[:SS]" (a "T" also works between date and time) as a wall-clock time in
 * `tz`. The year may be negative (astronomical numbering) and have up to six digits.
 * Returns null if malformed.
 */
export function parseLocal(value: string, tz: string): number | null {
  const m = /^([+-]?\d{1,6})-(\d{1,2})-(\d{1,2})(?:[T ]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value.trim());
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((s) => Number(s ?? 0));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return localToUnixMs({ year, month, day, hour, minute, second }, tz);
}

/**
 * A fixed-offset zone for a longitude with no named zone: whole hours of mean solar time.
 * IANA "Etc/GMT" zones have inverted signs: UTC+9 is "Etc/GMT-9".
 */
export function solarTimeZone(lonDeg: number): string {
  const h = Math.max(-12, Math.min(14, Math.round(lonDeg / 15)));
  if (h === 0) return 'Etc/UTC';
  return `Etc/GMT${h > 0 ? '-' : '+'}${Math.abs(h)}`;
}

/** Short zone name for display, such as "HST", "GMT+9", "CET". */
export function zoneAbbreviation(unixMs: number, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(
    new Date(unixMs),
  );
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
}

const nameFormatters = new Map<string, Intl.DateTimeFormat>();

/** "Wed 20 Jan 2027", "Sat 21 Jun 2830 BC", "Mon 3 Mar AD 500" in a time zone. */
export function formatLocalDate(unixMs: number, tz: string): { date: string; time: string } {
  const l = localParts(unixMs, tz);
  let names = nameFormatters.get(tz);
  if (!names) {
    names = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', month: 'short' });
    nameFormatters.set(tz, names);
  }
  const parts = names.formatToParts(new Date(unixMs));
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = l.year <= 0 ? `${1 - l.year} BC` : l.year < 1000 ? `AD ${l.year}` : String(l.year);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${weekday} ${l.day} ${month} ${year}`, time: `${p(l.hour)}:${p(l.minute)}` };
}
