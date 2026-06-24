# SPEC — "Escape the Rings" (browser, GitHub Pages)

## 1. What this is

A single-page, client-only web app. A ball bounces inside a set of
**concentric rotating rings**. Each ring is a circle with a **gap** (a missing
arc segment). When the ball passes through a ring's gap it escapes to the next
ring outward and that ring is removed. Every bounce plays the **next note of a
melody**. The melody comes either from a user-uploaded audio file (pitch is
extracted from a single-instrument / single-voice recording) or from a built-in
fallback sequence.

This is **not** a gravity ball-drop / funnel app. The reference is the
"can the ball escape the rings" short-video format.

Everything must run as static files (HTML/CSS/JS) with **no backend**, because
it deploys to GitHub Pages.

## 2. Hard constraints

- **No build step.** Plain `index.html` + JS that runs directly when opened.
  No bundler, no transpile, no framework. (If a module is truly needed, use
  native ES modules via `<script type="module">` and a CDN import, but prefer
  zero dependencies.)
- **Deploys to GitHub Pages.** All asset paths relative. Nothing that needs a
  server, env vars, or secrets.
- **One canvas, one game loop** driven by `requestAnimationFrame`.
- **Custom collision math.** Do NOT pull in a rigid-body physics engine
  (Matter.js etc.) for the rings — circle-vs-rotating-arc collision is done by
  hand (see §4). A physics engine makes the gap/escape logic harder, not easier.
- Target modern desktop + mobile browsers. Must work on a touchscreen (portrait).

## 3. Files

```
index.html        # markup + canvas + config panel
styles.css        # layout/styling for panel + canvas
src/game.js       # game loop, state, render
src/rings.js      # ring model + circle-vs-arc collision
src/ball.js       # ball model + bounce integration
src/audio.js      # synth (note playback) + pitch extraction from upload
src/config.js     # default config + reading values from the panel
```

Single-file is acceptable if preferred, but the above split is the intended
structure. Keep modules small and single-purpose.

## 4. Physics / collision (the core)

Plain 2D vector math on a canvas. No engine.

**Ring model:** `{ radius, rotation, gapCenterAngle, gapWidth, rotationSpeed,
thickness, alive }`. `rotation` advances by `rotationSpeed * dt` each frame.
The gap's current angular span = `gapCenterAngle + rotation ± gapWidth/2`.

**Ball model:** `{ x, y, vx, vy, radius }`, positioned relative to the shared
ring center. Integrate each frame: `pos += vel * dt`. No gravity by default
(see §6 for the optional gravity toggle).

**Collision test against the innermost alive ring each frame:**
1. Compute ball distance `d` from center and ball angle `θ`.
2. The ball is "at" the ring when `d + ball.radius >= ring.radius` (it's
   reaching the ring boundary from inside).
3. If `θ` (normalized) lies within the ring's current gap span → **no
   collision**: the ball escapes. Mark that ring `alive = false`, play the
   bounce note (escape still counts as a bounce/sound event), and let the ball
   continue outward to interact with the next ring.
4. Otherwise → **bounce**: reflect the velocity about the radial normal
   (the normal is the unit vector from center to ball). Standard reflection:
   `v' = v - 2 (v · n) n`. Nudge the ball just inside the ring to prevent it
   sticking. Play the bounce note.

Angle wrap-around at 0 / 2π must be handled correctly in the gap test (the gap
can straddle 0).

When all rings are `alive = false`, the ball has escaped — trigger a simple
win state (see §6).

## 5. Audio

Two independent layers; the synth must work even if extraction is never used.

### 5a. Note playback (always works)
- Web Audio API. On each bounce/escape event, play the **next note** in the
  active sequence, then advance an index (wrap around at the end).
- Synthesize tones with an `OscillatorNode` + `GainNode` envelope (short
  attack, quick decay) so it sounds musical, not a harsh beep. A small amount
  of release tail is fine.
- A note = a frequency in Hz. Provide a built-in default sequence (e.g. a
  pentatonic or major scale run) so the app is fully playable with no upload.

### 5b. Pitch extraction from an uploaded audio file (best-effort)
Scope per product decision: **single melody / monophonic** source. Do not
attempt polyphonic transcription.
- User uploads mp3/wav/m4a via a file input.
- Decode with `AudioContext.decodeAudioData` → mono `Float32Array` PCM.
- Run frame-by-frame pitch detection using the **YIN** algorithm to get a
  fundamental frequency per analysis window. Either implement YIN directly or
  use the `pitchfinder` library (YIN) via CDN ES module — prefer direct
  implementation to keep dependencies at zero, but `pitchfinder` is an
  acceptable single dependency if it saves real time.
- Post-process the raw frequency stream into a clean note list:
  - Drop frames below an amplitude/RMS threshold (silence).
  - Drop frames where YIN confidence is poor.
  - Quantize each surviving frequency to the nearest equal-tempered note.
  - Collapse consecutive identical notes into one (so a held note = one entry,
    not hundreds).
- Result feeds 5a as the active sequence.

**Honest expectation to encode in the UI/UX:** extraction on real recordings is
imperfect (vibrato, breaths, noise produce junk). Always keep the manual
fallback reachable — if extraction yields too few clean notes, fall back to the
built-in sequence and tell the user.

### 5c. Manual fallback (must exist)
A control to use the built-in sequence, OR let the user pick a scale / type a
short note sequence. This is the guaranteed-correct path when extraction
disappoints.

> Note: browsers require a user gesture before audio can start. Resume/init the
> `AudioContext` on the first click/tap (e.g. a Start button).

## 6. Configuration (UI panel)

All live-adjustable before (and ideally during) a run. Sensible defaults so it
runs immediately with zero input.

| Control          | Effect                                                        |
|------------------|---------------------------------------------------------------|
| Ring count       | Number of concentric rings                                    |
| Ball speed       | Initial speed / velocity magnitude                            |
| Gap width        | Angular size of each ring's gap                               |
| Rotation speed   | How fast rings spin (consider alternating direction per ring) |
| Ball count       | Number of balls bouncing simultaneously                       |
| Grow on bounce   | Toggle: ball radius increases each bounce (the "Size:" effect)|
| Gravity          | Optional toggle: add downward accel for a different feel      |
| Sound source     | Uploaded melody vs built-in sequence/scale                    |
| Start / Reset    | Init audio context, (re)start the simulation                  |

Multiple balls: each ball is independent; the collision test runs per ball.
Display the ball size counter on screen when "grow on bounce" is on (mirrors the
reference's "Size: 8.11" readout).

## 7. Rendering

- Dark background. Rings drawn as stroked arcs (skip the gap span when
  stroking, so the gap is visibly open). Distinct colors per the reference look
  (two alternating ring colors is fine).
- Ball drawn as a filled circle with a short motion **trail** (cheap: draw a
  few fading prior positions, or a low-alpha fill-over instead of full clear).
- Optional: subtle particle burst on bounce. Nice-to-have, not required for v1.

## 8. Build order (suggested)

1. Canvas + game loop + a single static ring + a bouncing ball (no gap yet).
   Prove the reflection math feels right.
2. Add the gap + escape-to-next-ring + ring removal. Multiple rings.
3. Add Web Audio synth: note-per-bounce on the built-in sequence.
4. Add the config panel wired to live parameters.
5. Add audio upload + YIN extraction → note list, with the fallback path.
6. Polish: trail, multiple balls, grow-on-bounce counter, win state.

Get steps 1–4 fully working and committed before starting 5; extraction is the
risky part and must not block a working app.

## 9. Definition of done (v1)

- Opens from a static file with no server and runs immediately on defaults.
- Ball bounces correctly inside rings; escapes cleanly through gaps; rings are
  removed; win state fires when all rings are gone.
- Each bounce plays the next note of the active sequence via Web Audio.
- Config panel changes take effect (at least on reset).
- Uploading a single-melody audio file produces a note sequence that drives the
  bounce sounds; if extraction is too sparse, it falls back gracefully to the
  built-in sequence with a message.
- Works in desktop Chrome/Firefox/Safari and on a mobile touchscreen (portrait).
- Deployable to GitHub Pages by committing the files and enabling Pages.