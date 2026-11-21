import { describe, expect, it } from 'vitest';
import {
  airmass,
  bvToTemperature,
  darkness,
  extinction,
  limitingMagnitude,
  skyColors,
  starAlpha,
  starColor,
  starRadius,
  temperatureToRgb,
} from '../src/render/look';

const brightness = (c: number[]) => c[0] + c[1] + c[2];

describe('star colour', () => {
  it('B−V of the Sun (0.65) gives about 5800 K', () => {
    expect(bvToTemperature(0.65)).toBeGreaterThan(5600);
    expect(bvToTemperature(0.65)).toBeLessThan(6000);
  });

  it('hotter stars have smaller B−V', () => {
    expect(bvToTemperature(-0.2)).toBeGreaterThan(bvToTemperature(0.5));
    expect(bvToTemperature(0.5)).toBeGreaterThan(bvToTemperature(1.6));
  });

  it('hot stars are blue-white, cool stars are orange', () => {
    const rigel = starColor(-0.03);
    const betelgeuse = starColor(1.85);
    expect(rigel[2]).toBeGreaterThan(rigel[0]);
    expect(betelgeuse[0]).toBeGreaterThan(betelgeuse[2] + 40);
  });

  it('6600 K is close to white', () => {
    const [r, g, b] = temperatureToRgb(6600);
    expect(r).toBe(255);
    expect(g).toBeGreaterThan(240);
    expect(b).toBeGreaterThan(240);
  });

  it('stars with no colour index are white', () => {
    expect(starColor(null)).toEqual([255, 255, 255]);
  });
});

describe('star size and visibility', () => {
  it('brighter stars are bigger', () => {
    expect(starRadius(-1.46)).toBeGreaterThan(starRadius(1));
    expect(starRadius(1)).toBeGreaterThan(starRadius(6));
    expect(starRadius(6.5)).toBeGreaterThan(0.4);
  });

  it('stars fade in over the last two magnitudes above the limit', () => {
    expect(starAlpha(3, 6.5)).toBe(1);
    expect(starAlpha(4.5, 6.5)).toBe(1);
    expect(starAlpha(6.0, 6.5)).toBeCloseTo(0.35);
    expect(starAlpha(6.5, 6.5)).toBeGreaterThan(0);
    expect(starAlpha(7, 6.5)).toBe(0);
  });

  it('the limiting magnitude brightens through twilight and is 6.5 at night', () => {
    expect(limitingMagnitude(-30)).toBe(6.5);
    expect(limitingMagnitude(-18)).toBe(6.5);
    expect(limitingMagnitude(10)).toBeLessThan(-1.46); // not even Sirius by day
    let prev = Infinity;
    for (let a = -20; a <= 5; a += 0.5) {
      const l = limitingMagnitude(a);
      expect(l).toBeLessThanOrEqual(prev);
      prev = l;
    }
  });

  it('darkness runs from 0 by day to 1 at night', () => {
    expect(darkness(5)).toBe(0);
    expect(darkness(-20)).toBe(1);
    expect(darkness(-8)).toBeCloseTo(0.5);
  });
});

describe('atmosphere', () => {
  it('airmass is 1 at the zenith, 2 at 30°, ~38 at the horizon', () => {
    expect(airmass(90)).toBeCloseTo(1, 3);
    expect(airmass(30)).toBeCloseTo(2, 1);
    expect(airmass(0)).toBeGreaterThan(35);
    expect(airmass(0)).toBeLessThan(40);
  });

  it('extinction is zero overhead and several magnitudes at the horizon', () => {
    expect(extinction(90)).toBeCloseTo(0, 3);
    expect(extinction(0)).toBeGreaterThan(6);
  });
});

describe('sky colour', () => {
  it('gets brighter as the Sun rises', () => {
    let prev = -1;
    for (const a of [-25, -15, -9, -4, 0, 5, 20]) {
      const { zenith } = skyColors(a);
      expect(brightness(zenith)).toBeGreaterThan(prev);
      prev = brightness(zenith);
    }
  });

  it('the horizon is brighter than the zenith', () => {
    for (const a of [-25, -10, -3, 10]) {
      const { zenith, horizon } = skyColors(a);
      expect(brightness(horizon)).toBeGreaterThan(brightness(zenith));
    }
  });

  it('the night sky is very dark', () => {
    expect(brightness(skyColors(-40).zenith)).toBeLessThan(30);
  });
});
