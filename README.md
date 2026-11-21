# Night Sky

A planetarium in the browser: the real sky for any place and time, shown on a dome.

- 9,096 naked-eye stars from the Yale Bright Star Catalogue, with true colours and brightness
- Alt-azimuth view for any latitude, longitude and moment, precessed to the date
- Constellation figures for 43 constellations, with names
- Time-lapse forwards or backwards, from real time to a sidereal day per second
- The sky brightens through twilight into day, with the Sun's glow on the horizon

TypeScript, HTML canvas and Vite. No runtime dependencies and no network needed.

## Start it

```
npm start
```

That installs dependencies on the first run and serves the app at http://localhost:5173.

Other commands: `npm test` (unit tests), `npm run typecheck`, `npm run build` (production build into
`dist/`), `npm run build:catalog` (rebuild the star data, see `src/data/README.md`).

## Controls

Drag the dome to turn it. Hover a star for its name, magnitude and altitude.

| Key | Action |
| --- | --- |
| Space | Play / pause the time-lapse |
| `[` / `]` | Slower / faster |
| R | Reverse direction |
| H | Hide / show the controls |
| L, N, S, G, C | Toggle lines, constellation names, star names, grid, caption |
| ← / → | Turn the dome 15° |

## Setting up a shot from the URL

Everything about a view lives in the URL hash, and the app keeps it up to date as you use it.
Copy the URL to come back to the same shot. With no hash you get the default scene:
Mauna Kea, Hawaii at 9 pm on 20 January 2027, with Orion high in the south.

```
http://localhost:5173/#loc=maunakea&t=2027-01-20T18:30&rate=600&play=1&ui=0
```

| Parameter | Meaning | Default |
| --- | --- | --- |
| `loc` | Preset place: `maunakea`, `atacama`, `namibrand`, `tekapo`, `cherrysprings`, `jasper`, `tromso`, `toronto`, `london`, `sydney`, `quito`, `northpole`, `southpole` | `maunakea` |
| `lat`, `lon` | Custom location in degrees (north and east positive). Overrides `loc` | |
| `tz` | IANA time zone for local times, such as `Asia/Tokyo`. Custom locations default to whole-hour solar time | the place's zone |
| `place` | Name shown in the caption | the place's name |
| `t` | Start time: local wall-clock time at the place (`2027-01-20T21:00`), ISO with `Z` or an offset, Unix milliseconds, or `now` | `2027-01-20T21:00` |
| `rate` | Time-lapse speed in simulated seconds per real second; negative runs backwards (`600` = 10 min/s, `3600` = 1 hour/s) | `600` |
| `play` | `1` to start the time-lapse running | `0` |
| `az` | Compass direction at the bottom of the dome, degrees (`180` = South, `0` = North) | `180` |
| `lines`, `names`, `stars`, `grid`, `caption` | `1` / `0`: constellation lines, constellation names, star names, altitude grid, place-and-time caption | `1`,`1`,`1`,`0`,`1` |
| `ui` | `0` hides the control panel (for recording) | `1` |

Invalid values are ignored and fall back to the defaults. Changing the hash on a loaded page restarts
the shot from the new settings.

### Recording with a headless browser

- **Timing:** the time-lapse runs only off the page's own clock (`requestAnimationFrame`
  timestamps on the `performance.now()` timeline). Nothing reads `Date.now()` except `t=now`. A
  recorder that controls or virtualises the page clock therefore gets the same frames every time.
- **Start time:** the clock anchors on the first frame drawn, so that frame shows exactly the `t`
  from the URL.
- **Ready signal:** `<html data-ready="1">` is set once the first frame has been drawn.
- **Read-only hooks:** `window.nightSky.simTime()` returns the simulated time (Unix ms) and
  `window.nightSky.sunAltitude()` returns the Sun's altitude in degrees.
- **Resolution:** the canvas follows the viewport size and `devicePixelRatio` (up to 3), so set
  the viewport and device scale factor to the video size you want.

## How it works

```
src/
  astro/    maths only, no DOM. Julian dates and sidereal time, precession, equatorial → horizontal,
            the Sun's position (Meeus, "Astronomical Algorithms")
  sky/      the star catalogue, star names, constellation figures, the dome (fisheye) projection
  render/   look.ts: star colour from B−V, sizes, sky colour and limiting magnitude by Sun altitude,
            atmospheric extinction; renderer.ts: draws the dome on a canvas
  app/      time-lapse clock, URL state, time zones, places, speeds
  main.ts   wires it together: controls, keyboard, drag and hover, frame loop
tests/      Vitest unit tests for astro, sky, look and app
```

Each frame builds one matrix taking J2000 catalogue positions to the local horizon, including
precession, sidereal time and latitude. That matrix is applied to every star, and the result goes
through an azimuthal equidistant projection: the zenith is in the centre and the horizon is the rim,
like a planetarium dome master.

The core is checked against Meeus's worked examples: Julian Date (7.a), sidereal time (12.a, 12.b),
alt-az coordinates (13.b), precession (21.b) and the Sun (25.a). Real-sky checks include Polaris
standing at the observer's latitude and Betelgeuse culminating due south at the right altitude.

### Deliberately left out (for now)

The Moon, planets, the Milky Way, deep-sky objects, atmospheric refraction and stellar proper
motion. Proper motion shifts even the fastest bright stars by a few arcminutes per century, which
can't be seen at dome scale.

## Data

See `src/data/README.md`. Star data comes from the Yale Bright Star Catalogue. The constellation
figures were drawn for this project.

---

© 2026 Tiny Moosh Games Inc.
