// The simulation clock behind the time-lapse.
//
// It runs only off the page's own clock: the `realMs` passed in is a requestAnimationFrame timestamp
// or performance.now() (the same timeline). Nothing reads Date.now(), so a headless recorder that
// controls the page clock gets the same frames every time.
//
// The clock anchors on the first reading, so the first frame drawn shows exactly the start time.
// Simulated time never leaves [min, max]: at a limit the time-lapse stops there.

export class SimClock {
  private anchorSim: number;
  private anchorReal: number | null = null;

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

  get rate(): number {
    return this.rateValue;
  }

  get playing(): boolean {
    return this.playingValue;
  }

  /**
   * Simulated time (Unix ms) at the given real time. If the time-lapse has run into a limit, it
   * stops there (and stays stopped) so the sky holds at the end of the range.
   */
  now(realMs: number): number {
    if (this.anchorReal === null) this.anchorReal = realMs;
    if (!this.playingValue) return this.anchorSim;
    const raw = this.anchorSim + (realMs - this.anchorReal) * this.rateValue;
    const t = this.clamp(raw);
    if (t !== raw) {
      this.anchorSim = t;
      this.anchorReal = realMs;
      this.playingValue = false;
    }
    return t;
  }

  /** Which end of the range the clock is sitting at, if any. */
  limit(realMs: number): 'start' | 'end' | null {
    const t = this.now(realMs);
    return t <= this.min ? 'start' : t >= this.max ? 'end' : null;
  }

  private reanchor(realMs: number): void {
    this.anchorSim = this.now(realMs);
    this.anchorReal = realMs;
  }

  setTime(unixMs: number, realMs: number): void {
    this.anchorSim = this.clamp(unixMs);
    this.anchorReal = realMs;
  }

  setRate(rate: number, realMs: number): void {
    this.reanchor(realMs);
    this.rateValue = rate;
  }

  setPlaying(playing: boolean, realMs: number): void {
    this.reanchor(realMs);
    this.playingValue = playing;
  }

  /** Restart from a new time and settings on the next reading (used when the URL changes). */
  reset(startUnixMs: number, rate: number, playing: boolean): void {
    this.anchorSim = this.clamp(startUnixMs);
    this.anchorReal = null;
    this.rateValue = rate;
    this.playingValue = playing;
  }
}
