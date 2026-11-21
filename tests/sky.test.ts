import { describe, expect, it } from 'vitest';
import { apply, separation, sphericalToVec, type Vec3 } from '../src/astro/math';
import { horizonVecToAltAz, skyFrame } from '../src/astro/coords';
import { designation, loadCatalog } from '../src/sky/catalog';
import { PROPER_NAMES } from '../src/sky/starNames';
import { FIGURES, resolveFigures } from '../src/sky/constellations';
import { fitDome, makeVecProjector, project, unproject, type DomeView } from '../src/sky/projection';

const catalog = loadCatalog();

describe('catalogue', () => {
  it('has the naked-eye sky', () => {
    expect(catalog.stars.length).toBeGreaterThan(9000);
    for (const s of catalog.stars) {
      expect(s.ra).toBeGreaterThanOrEqual(0);
      expect(s.ra).toBeLessThan(360);
      expect(Math.abs(s.dec)).toBeLessThanOrEqual(90);
      expect(s.mag).toBeGreaterThan(-2);
      expect(s.mag).toBeLessThan(8.5);
    }
  });

  it('is sorted brightest first, starting with Sirius', () => {
    expect(catalog.stars[0].name).toBe('Sirius');
    for (let i = 1; i < catalog.stars.length; i++) {
      expect(catalog.stars[i].mag).toBeGreaterThanOrEqual(catalog.stars[i - 1].mag);
    }
  });

  it('looks up stars by designation', () => {
    expect(catalog.find('Alp Ori')?.hr).toBe(2061);
    expect(catalog.find('58 Ori')?.hr).toBe(2061); // Flamsteed number of Betelgeuse
    expect(catalog.byNumber(2491)?.name).toBe('Sirius');
  });

  it('picks the brightest component when a Bayer letter has numbered parts', () => {
    expect(catalog.find('Alp Cen')?.bayer).toBe('Alp1');
    expect(catalog.find('Zet Sco')?.bayer).toBe('Zet2');
    expect(catalog.find('Bet Cyg')?.name).toBe('Albireo');
    expect(catalog.find('Xyz Ori')).toBeUndefined();
  });

  it('formats designations', () => {
    expect(designation(catalog.find('Alp Ori')!)).toBe('α Ori');
    expect(designation(catalog.find('Alp Cen')!)).toBe('α¹ Cen');
    expect(designation({ hr: 1, bayer: '', flamsteed: 0, con: '' })).toBe('HR 1');
    expect(designation({ hr: 2, bayer: '', flamsteed: 23, con: 'UMa' })).toBe('23 UMa');
  });

  it('resolves every proper name', () => {
    for (const key of Object.keys(PROPER_NAMES)) {
      expect(catalog.find(key), key).toBeDefined();
    }
  });

  it('proper names go to bright stars', () => {
    for (const s of catalog.stars) if (s.name) expect(s.mag, s.name).toBeLessThan(4.5);
  });
});

describe('real sky checks', () => {
  const altAzOf = (vec: Vec3, ms: number, lat: number, lon: number) =>
    horizonVecToAltAz(apply(skyFrame(ms, lat, lon).j2000ToHorizon, vec));

  it('Polaris stands at about the observer’s latitude, due north, all night', () => {
    const polaris = catalog.find('Alp UMi')!;
    for (const lat of [20, 45, 65]) {
      for (let h = 0; h < 24; h += 3) {
        const { alt, az } = altAzOf(polaris.vec, Date.UTC(2026, 11, 1, h), lat, -75);
        expect(Math.abs(alt - lat)).toBeLessThan(0.8);
        expect(Math.min(az, 360 - az)).toBeLessThan(2.5);
      }
    }
  });

  it('Betelgeuse culminates at 90° − |lat − dec| due south', () => {
    const betelgeuse = catalog.find('Alp Ori')!;
    const lat = 19.82;
    let best = { alt: -90, az: 0 };
    const start = Date.UTC(2027, 0, 20);
    for (let m = 0; m < 24 * 60; m += 2) {
      const h = altAzOf(betelgeuse.vec, start + m * 60_000, lat, -155.47);
      if (h.alt > best.alt) best = h;
    }
    // Declination of date is ~7.41° (precession moves it by < 0.05°).
    expect(best.alt).toBeCloseTo(90 - (lat - 7.41), 0);
    expect(best.az).toBeGreaterThan(175);
    expect(best.az).toBeLessThan(185);
  });

  it('Sirius is above the horizon on a January evening in Hawaii, and below in July', () => {
    const sirius = catalog.find('Alp CMa')!;
    // 2027-01-20 23:00 HST = 2027-01-21 09:00 UTC
    expect(altAzOf(sirius.vec, Date.UTC(2027, 0, 21, 9), 19.82, -155.47).alt).toBeGreaterThan(40);
    expect(altAzOf(sirius.vec, Date.UTC(2027, 6, 21, 9), 19.82, -155.47).alt).toBeLessThan(0);
  });

  it('the Southern Cross never rises from London', () => {
    const acrux = catalog.find('Alp Cru')!;
    for (let h = 0; h < 24; h++) {
      expect(altAzOf(acrux.vec, Date.UTC(2026, 3, 1, h), 51.5, 0).alt).toBeLessThan(0);
    }
  });
});

describe('constellation figures', () => {
  const figures = resolveFigures(catalog);

  it('has about forty constellations with unique abbreviations', () => {
    expect(figures.length).toBeGreaterThanOrEqual(40);
    expect(new Set(FIGURES.map((f) => f.abbr)).size).toBe(FIGURES.length);
  });

  it('every line joins two different, reasonably bright, reasonably close stars', () => {
    const problems: string[] = [];
    for (const f of figures) {
      for (const [a, b] of f.segments) {
        const label = `${f.name}: ${designation(a)} (${a.mag}) – ${designation(b)} (${b.mag})`;
        const sep = separation(a.vec, b.vec);
        if (a === b) problems.push(`${label}: same star`);
        if (a.mag >= 5.5 || b.mag >= 5.5) problems.push(`${label}: too faint`);
        if (sep >= 30) problems.push(`${label}: ${sep.toFixed(1)}° long`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every figure uses its own stars and labels sit among them', () => {
    for (const f of figures) {
      const own = f.segments.flat().filter((s) => s.con === f.abbr);
      expect(own.length, f.name).toBeGreaterThan(0);
      // Hydra is ~100° long and its head has six stars, so its tail is far from the label.
      const limit = f.abbr === 'Hya' ? 65 : 45;
      for (const s of own) expect(separation(s.vec, f.labelVec), f.name).toBeLessThan(limit);
    }
  });

  it('Orion joins Betelgeuse, Rigel and the belt', () => {
    const orion = figures.find((f) => f.abbr === 'Ori')!;
    const names = new Set(orion.segments.flat().map((s) => s.name));
    for (const n of ['Betelgeuse', 'Rigel', 'Bellatrix', 'Saiph', 'Alnitak', 'Alnilam', 'Mintaka']) {
      expect(names.has(n), n).toBe(true);
    }
  });

  it('throws on an unknown star, naming it', () => {
    expect(() => resolveFigures(catalog, [{ abbr: 'Ori', name: 'Orion', lines: [['Alp', 'Xyz']] }])).toThrow(
      /Xyz Ori/,
    );
  });
});

describe('dome projection', () => {
  const view: DomeView = { cx: 500, cy: 400, radius: 300, viewAz: 180 };

  it('puts the zenith at the centre and the horizon on the rim', () => {
    expect(project(90, 123, view)).toEqual({ x: 500, y: 400 });
    const south = project(0, 180, view);
    expect(south.x).toBeCloseTo(500);
    expect(south.y).toBeCloseTo(700);
  });

  it('is oriented like an overhead sky chart: S bottom, N top, E left, W right', () => {
    const p = (az: number) => project(0, az, view);
    expect(p(0).y).toBeCloseTo(100);
    expect(p(90).x).toBeCloseTo(200);
    expect(p(270).x).toBeCloseTo(800);
  });

  it('rotates with viewAz', () => {
    const north = project(0, 0, { ...view, viewAz: 0 });
    expect(north.y).toBeCloseTo(700);
    const east = project(0, 90, { ...view, viewAz: 0 });
    expect(east.x).toBeCloseTo(800);
  });

  it('is equidistant: altitude scales linearly with radius', () => {
    const p = project(45, 180, view);
    expect(p.y - view.cy).toBeCloseTo(150);
  });

  it('round-trips through unproject', () => {
    for (const [alt, az] of [[10, 20], [60, 300], [-5, 181], [89, 45]]) {
      const p = project(alt, az, view);
      const back = unproject(p.x, p.y, view);
      expect(back.alt).toBeCloseTo(alt, 9);
      expect(back.az).toBeCloseTo(az, 9);
    }
  });

  it('the fast vector projector matches project()', () => {
    const proj = makeVecProjector({ ...view, viewAz: 37 });
    const out = { x: 0, y: 0 };
    for (const [alt, az] of [[10, 20], [60, 300], [-30, 181], [0, 0], [89.5, 200]]) {
      // (north, east, up) from alt/az
      const v = sphericalToVec(-az, alt); // x = cos·cos(az), y = −cos·sin(−az)… flip sign below
      const nev: Vec3 = [v[0], -v[1], v[2]];
      const a = proj(nev, out);
      const expected = project(alt, az, { ...view, viewAz: 37 });
      expect(a).toBeCloseTo(alt, 9);
      expect(out.x).toBeCloseTo(expected.x, 6);
      expect(out.y).toBeCloseTo(expected.y, 6);
    }
    expect(proj([0, 0, 1], out)).toBeCloseTo(90);
    expect(out).toEqual({ x: 500, y: 400 });
  });

  it('fits the dome inside the canvas with a margin', () => {
    expect(fitDome(1920, 1080, 30)).toEqual({ cx: 960, cy: 540, radius: 510 });
  });
});
