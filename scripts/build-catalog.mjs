// One-off: download the Yale Bright Star Catalogue (5th rev. ed., Hoffleit & Warren 1991)
// (CDS VizieR V/50, mirrored by the Harvard-Smithsonian Telescope Data Center) and convert it
// to the compact JSON the app ships with.
//
//   npm run build:catalog
//
// The app never needs the network: the output (src/data/bsc5.json) is committed.
// The download is parsed in memory as plain fixed-width text; nothing in it is executed.

import { gunzipSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same 197-byte records as CDS V/50 "catalog" (the CDS FTP path is no longer served).
const SOURCE = 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/data/bsc5.json');

// Byte positions from the V/50 ReadMe (1-based, inclusive).
const col = (line, from, to) => line.slice(from - 1, to);
const num = (s) => {
  const t = s.trim();
  return t === '' ? null : Number(t);
};

function parseLine(line) {
  const hr = num(col(line, 1, 4));
  const raH = num(col(line, 76, 77));
  if (hr === null || raH === null) return null; // a few entries (novae, clusters) have no J2000 position
  const raM = num(col(line, 78, 79));
  const raS = num(col(line, 80, 83));
  const decSign = col(line, 84, 84) === '-' ? -1 : 1;
  const decD = num(col(line, 85, 86));
  const decM = num(col(line, 87, 88));
  const decS = num(col(line, 89, 90));
  const vmag = num(col(line, 103, 107));
  if (vmag === null) return null;
  const bv = num(col(line, 110, 114));
  const flamsteed = num(col(line, 5, 7)) ?? 0;
  const bayer = col(line, 8, 10).trim();
  const sup = col(line, 11, 11).trim();
  const con = col(line, 12, 14).trim();

  // Motions: proper motion in RA already includes cos(dec) (Arcturus −1.093"/yr, as Hipparcos).
  const pmRA = num(col(line, 149, 154)) ?? 0; // arcsec/yr
  const pmDE = num(col(line, 155, 160)) ?? 0; // arcsec/yr
  const plx = num(col(line, 162, 166)); // arcsec, trigonometric or dynamical; often blank
  const rv = num(col(line, 167, 170)); // km/s

  const ra = (raH + raM / 60 + raS / 3600) * 15;
  const dec = decSign * (decD + decM / 60 + decS / 3600);
  return [
    hr,
    Math.round(ra * 1e5) / 1e5,
    Math.round(dec * 1e5) / 1e5,
    vmag,
    bv,
    flamsteed,
    bayer ? bayer + sup : '',
    con,
    pmRA,
    pmDE,
    plx !== null && plx > 0 ? plx : null,
    rv,
  ];
}

function check(stars, hr, expect) {
  const s = stars.find((r) => r[0] === hr);
  if (!s) throw new Error(`Layout check failed: HR ${hr} missing`);
  const [, ra, dec, vmag, , , bayer, con] = s;
  const ok =
    Math.abs(ra - expect.ra) < 0.05 &&
    Math.abs(dec - expect.dec) < 0.05 &&
    Math.abs(vmag - expect.vmag) < 0.02 &&
    bayer === expect.bayer &&
    con === expect.con;
  if (!ok) throw new Error(`Layout check failed for HR ${hr}: got ${JSON.stringify(s)}`);
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString('latin1');
const stars = text
  .split(/\r?\n/)
  .filter((l) => l.length >= 114)
  .map(parseLine)
  .filter(Boolean);

// Sanity checks against well-known stars, so a wrong byte layout can't slip through.
check(stars, 2491, { ra: 101.2875, dec: -16.7161, vmag: -1.46, bayer: 'Alp', con: 'CMa' }); // Sirius
check(stars, 2061, { ra: 88.7929, dec: 7.4071, vmag: 0.5, bayer: 'Alp', con: 'Ori' }); // Betelgeuse
check(stars, 424, { ra: 37.9529, dec: 89.2642, vmag: 2.02, bayer: 'Alp', con: 'UMi' }); // Polaris
const arcturus = stars.find((r) => r[0] === 5340);
if (JSON.stringify(arcturus.slice(8)) !== JSON.stringify([-1.093, -1.998, 0.09, -5])) {
  throw new Error(`Motion layout check failed for Arcturus: ${JSON.stringify(arcturus)}`);
}
if (stars.length < 9000) throw new Error(`Only ${stars.length} stars parsed`);

const out = {
  source:
    'Yale Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991), CDS VizieR V/50, via ' +
    SOURCE,
  epoch: 'J2000',
  fields: ['hr', 'raDeg', 'decDeg', 'vmag', 'bv', 'flamsteed', 'bayer', 'con', 'pmRA', 'pmDE', 'plx', 'rv'],
  units: { pmRA: 'arcsec/yr, includes cos(dec)', pmDE: 'arcsec/yr', plx: 'arcsec', rv: 'km/s' },
  stars,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out).replace(/\],\[/g, '],\n['));
console.log(`Wrote ${stars.length} stars to ${OUT}`);
