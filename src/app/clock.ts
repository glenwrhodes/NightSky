// The simulation clock behind the time-lapse.
//
// It runs only off the page's own clock: the `realMs` passed in is a requestAnimationFrame timestamp
// or performance.now() (the same timeline). Nothing reads Date.now(), so a headless recorder that
// controls the page clock gets the same frames every time, at any frame rate.
//
// Two modes:
// - continuous: simulated time = anchor + elapsed real time × rate.
// - stepped ("same time each night"): step k = floor(elapsed seconds × steps per second), and the
//   simulated time is stepper(anchor, k): the same local clock time, k date-steps on.
//
// The clock anchors on the first reading, so the first frame drawn shows exactly the start time.
// Simulated time never leaves [min, max]: a time-lapse that reaches a limit stops there (a stepped
// one stops on its last step inside the range) and remembers which end it hit.

export interface Stepping {
  /** Steps per real second. */
  perSecond: number;
  /** Simulated time of step k from the anchor (k = 0 is the anchor). Monotonic in k. */
  at: (anchorMs: number, k: number) => number;
}

export type Limit = 'start' | 'end';

export class SimClock {
  private anchorSim: number;
  private anchorReal: number | null = null;
  private steppingValue: Stepping | null = null;
  private stoppedAtValue: Limit | null = null;
  // Cache of the current step, so a step is computed once, not every frame.
  private cacheKey = '';
  private cacheTime = 0;

  constructor(
    startUnixMs: number,
    /** Simulated seconds per real second; negative runs backwards. */
    private rateValue: number,
    private playingValue: boolean,
    readonly min = -Infinity,
    readonly max = Infinity,
  ) {
    this.anchorSim = this.clamp(startUnixMs);
  }

  private clamp(t: number): number {
    return Math.min(this.max, Math.max(this.min, t));
  }

  private inRange(t: number): boolean {
    return t >= this.min && t <= this.max; // false for NaN
  }

  get rate(): number {
    return this.rateValue;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  /** The stepped mode's settings, or null in continuous mode. */
  get stepping(): Stepping | null {
    return this.steppingValue;
  }

  /** Which end of the range the time-lapse ran into and stopped at, if it did. */
  get stoppedAt(): Limit | null {
    return this.stoppedAtValue;
  }

  /** The step number at a real time (stepped mode), robust to rounding at exact step boundaries. */
  private stepIndex(realMs: number, perSecond: number): number {
    return Math.floor(((realMs - (this.anchorReal ?? realMs)) * perSecond) / 1000 + 1e-6);
  }

  private stop(t: number, realMs: number, limit: Limit): number {
    this.anchorSim = t;
    this.anchorReal = realMs;
    this.playingValue = false;
    this.stoppedAtValue = limit;
    return t;
  }

  /** Simulated time (Unix ms) at the given real time. */
  now(realMs: number): number {
    if (this.anchorReal === null) this.anchorReal = realMs;
    if (!this.playingValue) return this.anchorSim;

    const s = this.steppingValue;
    if (!s) {
      const raw = this.anchorSim + (realMs - this.anchorReal) * this.rateValue;
      const t = this.clamp(raw);
      return t !== raw ? this.stop(t, realMs, raw > this.max ? 'end' : 'start') : t;
    }

    const k = Math.max(0, this.stepIndex(realMs, s.perSecond));
    const key = `${this.anchorSim}|${k}`;
    if (key === this.cacheKey) return this.cacheTime;
    let t = s.at(this.anchorSim, k);
    if (!this.inRange(t)) {
      // Find the last step inside the range (steps are monotonic) and stop there.
      const limit: Limit = t > this.max || (Number.isNaN(t) && s.at(this.anchorSim, 1) > this.anchorSim) ? 'end' : 'start';
      let lo = 0;
      let hi = k;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (this.inRange(s.at(this.anchorSim, mid))) lo = mid;
        else hi = mid;
      }
      t = s.at(this.anchorSim, lo);
      this.cacheKey = '';
      return this.stop(t, realMs, limit);
    }
    this.cacheKey = key;
    this.cacheTime = t;
    return t;
  }

  private reanchor(realMs: number): void {
    this.anchorSim = this.now(realMs);
    this.anchorReal = realMs;
  }

  setTime(unixMs: number, realMs: number): void {
    this.anchorSim = this.clamp(unixMs);
    this.anchorReal = realMs;
    this.stoppedAtValue = null;
  }

  setRate(rate: number, realMs: number): void {
    this.reanchor(realMs);
    this.rateValue = rate;
  }

  /** Switch to stepped mode (or back to continuous with null), continuing from the current time. */
  setStepping(stepping: Stepping | null, realMs: number): void {
    this.reanchor(realMs);
    this.steppingValue = stepping;
    this.cacheKey = '';
  }

  setPlaying(playing: boolean, realMs: number): void {
    this.reanchor(realMs);
    this.playingValue = playing;
    if (playing) this.stoppedAtValue = null;
  }

  /** Restart from a new time and settings on the next reading (used when the URL changes). */
  reset(startUnixMs: number, rate: number, playing: boolean, stepping: Stepping | null = null): void {
    this.anchorSim = this.clamp(startUnixMs);
    this.anchorReal = null;
    this.rateValue = rate;
    this.playingValue = playing;
    this.steppingValue = stepping;
    this.stoppedAtValue = null;
    this.cacheKey = '';
  }
}
