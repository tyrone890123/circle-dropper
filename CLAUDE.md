# CLAUDE.md

Read `SPEC.md` first — it is the source of truth for what to build. This file is
only how to operate in this repo.

## Project

Static, client-only browser app ("Escape the Rings") that deploys to **GitHub
Pages**. A ball bounces inside concentric rotating rings with gaps; each bounce
plays the next note of a melody (built-in, or extracted from an uploaded
single-melody audio file via Web Audio + YIN). No backend.

## Commands

- **Run locally:** `python3 -m http.server 8000` then open
  `http://localhost:8000` (needed so ES modules and `fetch`/audio decode work —
  opening `index.html` via `file://` will break module loading).
- **No build, no bundler, no transpile step.** There is nothing to compile.
- **No test framework** is set up. If you add one, prefer a zero-dependency
  approach and document the command here.
- **Lint/format:** none configured. Match the existing style in the file you're
  editing.

## Hard rules

- **No backend, ever.** Everything runs in the browser. No server code, no env
  vars, no secrets, no API keys.
- **Must stay GitHub-Pages-deployable:** all asset paths relative; no step that
  requires a server at deploy time.
- **No rigid-body physics engine** (Matter.js, Planck, Box2D…). Ring collision
  is done with custom circle-vs-arc vector math — see SPEC §4. Do not add one
  "to make it easier."
- **Minimize dependencies.** Prefer zero. Plain Canvas 2D + Web Audio. The only
  dependency that may be justified is `pitchfinder` (YIN) for audio extraction,
  and only if a hand-rolled YIN would cost real time — confirm before adding it.
- Vanilla JS, native ES modules (`<script type="module">`). No framework.
- Audio context must be created/resumed on a user gesture (Start button) — never
  auto-start audio on page load.

## Workflow

- The build has a deliberate order (SPEC §8). **Get a working bouncing-ball +
  rings + synth + config panel committed before attempting audio extraction.**
  Extraction is the risky part and must not block a shippable app.
- This touches several files — before large multi-file changes, briefly state
  the plan and any assumptions, then proceed.
- Commit in working increments that map to the SPEC build steps.
- Keep modules small and single-purpose per the SPEC file layout.

## Conventions

- Don't write comments that just restate the code. Comment the non-obvious
  (collision math, angle wrap-around, audio timing) and why.
- When fixing a bug, note the cause, not only the fix.