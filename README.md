# NEON ESCAPE — wall dropper

A static, client-only browser toy. Balls drop into a **circle or square** arena
made of concentric walls that **spin or sit still**. Each time a ball lines up
with a wall's gap it blasts straight through and that wall is **eliminated** —
clear them all to escape. Every bounce fires the next note of a melody (built-in
scale, or pitch-extracted from an uploaded mono recording). Big neon glow,
particle bursts, and screen shake throughout.

Built to the rules in [`SPEC.md`](SPEC.md): no backend, no build step, no physics
engine — all collision is hand-rolled circle-vs-arc / square vector math.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

A server is required so ES modules and audio decoding work — opening
`index.html` via `file://` will not load the modules.

## Deploy (GitHub Pages)

Commit these files and enable Pages for the branch. All asset paths are
relative; `.nojekyll` keeps the `src/` modules served as-is.

## Controls

Everything is a live slider/toggle in the right-hand panel:

- **Arena** — shape (circle/square), **view** mode, wall count (up to 60),
  spacing, inner size, wall width, gap size.
  - **View → Fit (one screen):** the whole arena is always framed to a single
    screen size, so nothing clips no matter how many walls.
  - **View → Zoom out on break:** the camera frames just the current innermost
    wall and zooms out each time one is eliminated.
- **Motion** — spin speed, alternate spin direction, gravity, bounciness,
  **bounce jitter** (±° of random error added to each bounce, 0 = none), and
  **endless loop**: when the last wall breaks, every wall is rebuilt and the
  balls are flung back to the center to break out again — forever. In loop mode
  the camera zooms in on each rebuild and back out as the walls fall.
- **Balls** — count, launch speed, size, grow-on-bounce (+ amount), and an
  **On break** mode: *None*, *Add a ball*, or *Remove a ball* (culls down to a
  last survivor) each time a wall is eliminated.
- **Neon / FX** — base hue, hue drift, glow, trail, screen shake (default 0),
  particles, and **show on-screen text** (turn off to hide the HUD / win text).
- **Sound** — on/off, volume, tone waveform, built-in scale.

Tap/click the stage during play to drop extra balls. **Start** initialises audio
(required by browsers — audio only starts on a gesture) and runs the sim;
**Reset** rebuilds the arena from the current settings.

## Import / export

The **Config JSON** box round-trips every setting. **Export** dumps the current
config; paste any config in and hit **Import** to apply it (values are clamped
and type-checked, so a malformed paste can't break the sim).

## Audio upload

Upload a single-melody (monophonic) mp3/wav/m4a and the app runs a YIN pitch
detector over it, quantises to notes, and uses that as the bounce melody.
Extraction on real recordings is imperfect — if too few clean notes come out, it
falls back to the built-in scale and tells you.
