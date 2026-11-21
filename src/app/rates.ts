import { SIDEREAL_DAY_SECONDS } from '../astro/time';

export interface RatePreset {
  value: number;
  label: string;
}

/** Time-lapse speeds, in simulated seconds per real second. */
export const RATE_PRESETS: RatePreset[] = [
  { value: 1, label: 'Real time' },
  { value: 60, label: '1 min / s' },
  { value: 600, label: '10 min / s' },
  { value: 1800, label: '30 min / s' },
  { value: 3600, label: '1 hour / s' },
  { value: SIDEREAL_DAY_SECONDS, label: '1 sidereal day / s' },
];

/** Label for any rate; the sign (direction) is shown separately. */
export function rateLabel(rate: number): string {
  const r = Math.abs(rate);
  const preset = RATE_PRESETS.find((p) => Math.abs(p.value - r) < 1e-6);
  if (preset) return preset.label;
  if (r < 60) return `${trim(r)}× real time`;
  if (r < 3600) return `${trim(r / 60)} min / s`;
  if (r < 86400) return `${trim(r / 3600)} hours / s`;
  return `${trim(r / 86400)} days / s`;
}

/** The next faster or slower preset from a rate (keeping its direction). */
export function stepRate(rate: number, dir: 1 | -1): number {
  const sign = rate < 0 ? -1 : 1;
  const r = Math.abs(rate);
  const values = RATE_PRESETS.map((p) => p.value);
  const next =
    dir > 0 ? values.find((v) => v > r + 1e-6) ?? values[values.length - 1] : [...values].reverse().find((v) => v < r - 1e-6) ?? values[0];
  return sign * next;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}
