# Blocking Room

Browser-based 3D previsualization for planning actors, sets, movement, and camera blocking before a film shoot.

[![Three.js](https://img.shields.io/badge/Three.js-r180-1f2521?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-b75c3c.svg)](LICENSE)

Blocking Room turns a scene into a simple interactive 3D plan. Arrange geometric actors and rooms, define where each actor faces, animate blocking with keyframes, preview the scene through a film camera, and export the result as a reference video.

The interface is currently in Indonesian. This README uses English so the project is accessible to a wider open-source community; important product documentation remains available in Indonesian.

> **Project status:** feature-complete for R1 and R2, with both release gates passed
> ([R1](docs/GATE-R1.md), [R2](docs/GATE-R2.md)). What remains before it can be called
> production-ready is **not code**: a pilot with real filmmakers has not been run
> ([docs/PILOT-PROTOCOL.md](docs/PILOT-PROTOCOL.md)), performance has only been measured on
> one high-end machine, and only Chrome has been tested. Everything is local — there is no
> account, no cloud, and no collaboration. Open decisions that block further phases are
> listed in [docs/DECISIONS-NEEDED.md](docs/DECISIONS-NEEDED.md).

## Contents

- [Why Blocking Room](#why-blocking-room)
- [Current capabilities](#current-capabilities)
- [Quick start](#quick-start)
- [Using the editor](#using-the-editor)
- [Keyboard and mouse controls](#keyboard-and-mouse-controls)
- [Project data and persistence](#project-data-and-persistence)
- [Video export](#video-export)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Testing](#testing)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security and privacy](#security-and-privacy)
- [License](#license)

## Why Blocking Room

Storyboards communicate framing, but they do not always make spatial relationships and timing obvious. Blocking Room focuses on the practical questions that arise before a shoot:

- Where are the actors and where are they facing?
- How do they move between beats?
- Does a path pass through a wall rather than a doorway?
- What does the movement look like through the selected lens?
- Can the setup be exported as a simple, shareable reference?

The visual language deliberately stays simple. Geometric actors and lightweight sets keep attention on staging, timing, and camera decisions rather than final rendering quality.

## Current capabilities

### Scene and set

- Add, edit, hide, show, lock, unlock, and delete actors and rectangular rooms.
- Arrange objects by numeric coordinates, keyboard input, or direct manipulation in the 3D viewport.
- Protect set geometry from accidental movement; rooms are locked by default.
- Add real openings to the left (`-X`) or back (`-Z`) wall of a room.
- Configure a doorway's wall, offset from the wall center, width, and height.
- Warn when a saved actor path crosses a solid wall outside a suitable doorway.

### Characters and movement

- Animate position and facing direction with timeline keyframes.
- Keep movement direction separate from facing direction, so an actor can walk backward or sideways.
- Rotate actors by dragging, entering degrees, using step buttons, or facing the active camera.
- Preview deterministic procedural leg and arm swings while an actor moves.
- Record movement in real time with keyboard controls.
- Hide actors from the editor and exported video.

### Camera and preview

- Use zero or one active scene camera.
- Edit camera position, focal length, and either a manual look target or actor-follow target.
- Switch between perspective, top, and 16:9 final-camera views.
- Manipulate actors directly while looking through the final camera.
- Delete and recreate the camera; export remains unavailable while no camera exists.

### Projects and scenes

- Browse every stored project on a dashboard with thumbnail, title, scene count, and last-modified date.
- Search projects by title and sort by most recently modified or most recently opened.
- Create an empty project or start from the built-in demo scene template.
- Open, rename inline, and duplicate a project; duplicates remap every internal ID while keeping camera targets, tracks, and assets consistent.
- Move a project to a 30-day trash, restore it with its contents intact, or delete it permanently after an explicit confirmation.
- Add, rename, duplicate, reorder, switch, and delete scenes; each scene owns its own set, actors, and timeline.
- Navigate with a project / scene / shot breadcrumb and return to the dashboard, which flushes pending saves and releases the writer lock first.
- Edit the director's note, scene name, and camera name as stored data instead of fixed demo text.

### Shots and timeline

- Build a shot list per scene with number, name, active camera and lens, duration, fps, aspect ratio, keyframe count, and notes; create, duplicate, reorder, rename, switch, and delete shots.
- Compare two alternatives side by side: pick a B shot and read a difference table (lens, aim, duration, fps, aspect ratio, and keyframe counts), then swap to it in one click.
- Cameras and motion tracks belong to the shot; actor and set identity belong to the scene, so changing shot B never touches shot A. Deleting an actor followed by a *locked* camera in any shot is refused with an explanation; an unlocked camera falls back to manual aim and says which shots changed.
- Edit on a frame ruler with frame snapping (toggleable), zoom and pan, an exact frame input, `MM:SS:FF` timecode, single-frame stepping, and clamping at the start and end of the shot. Changing fps never moves a keyframe: time is stored in seconds and frames are a display unit.
- Drag, multi-select, copy, paste, and delete keyframes. Every bulk operation is a single undo step, locked or hidden items are skipped with a named list, and any keyframe overwritten by a time collision is reported.
- Choose wide / normal / tele lens presets, per-shot 16:9, 9:16, 2.39:1, 4:3, or 1:1 framing with a safe-area overlay, and keyframe focal length. Preview and export share the same crop.
- Key position and orientation on separate tracks. Each actor gets two timeline lanes with distinct keyframe markers, and every track carries its own interpolation: linear, hold, or ease. When adding a keyframe you choose which track it lands on (position, orientation, or both), so nudging an actor never rewrites its facing.
- Turn on an optional 0.5 m snap grid when arranging the set; it is off by default and does not apply while recording.

### Props and modular walls

- Boxes, tables, chairs, and decorations are first-class objects with their own IDs, listed under the **Props** tab. Transform, lock, hide, duplicate, delete, and undo all go through the same command path as actors and rooms, and picking requires an explicit selection first so dragging an actor cannot grab the set dressing.
- Modular wall segments (`x`, `z`, rotation, length, height, thickness) are independent objects too. Room doors are untouched and remain the only openings; a path crossing a wall segment is reported as a warning, never as a physical collision.
- Projects saved before schema version 3 are migrated on open: the sample set dressing that used to be drawn from the room index becomes real props at exactly the same world position.
- Read the current mode at a glance: an Edit / Play / Record cue with the active frame number.

### Editing safety

- Undo and redo up to 100 document changes during the current browser session.
- Group a drag, held keyboard gesture, or recorded take into one undo step.
- Prevent inspector, pointer, keyboard, delete, and keyframe operations from changing locked items.
- Ignore hidden objects and editor-only direction helpers during picking.
- Validate imported project data before it replaces the current document.

### Saving and output

- Autosave the active document to IndexedDB within about a second of a finished gesture, atomically, with an honest save status.
- Keep at least ten recovery snapshots per project and restore any of them as a single undo step.
- Keep one writer tab per project; other tabs stay read-only and can take over or open a copy.
- Store a 320 × 180 scene thumbnail after relevant changes; a failed thumbnail never fails a document save.
- Export and import a single-file project package (`.blockingroom.json`) with a manifest and SHA-256 checksums per section.
- Import legacy version 1 JSON as a new project without touching the projects you already have.
- Download and reopen a JSON project backup, and download a v2 or v1 JSON copy for rolling back to an older build.
- Render a deterministic reference video offline through WebCodecs — a 10-second shot at 30 fps contains exactly 300 frames — with a labelled real-time `MediaRecorder` fallback when WebCodecs is unavailable.
- Queue several shots, add optional burn-in, PNG storyboard frames, and a JSON/CSV shot list.
- Show the build version and short commit hash in the dashboard footer and the editor's quick guide, so a bug report can be traced to a specific build.

## Quick start

### Requirements

- [Node.js](https://nodejs.org/) 20.19 or newer
- npm
- A WebGL-capable browser
- Chrome or Edge is recommended for the current video export and browser test workflow

### Install and run

```bash
git clone https://github.com/mangerik/Blocking-Room.git
cd Blocking-Room
npm install
npm run dev
```

Open the local address printed by Vite, normally `http://localhost:5173`.

### Production build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`. The directory is intentionally ignored by Git.

## Using the editor

The workflow is **project → scene → shot → blocking → preview → reference video**, and each
level owns different data:

| Level | Owns | Where |
|---|---|---|
| **Project** | title, the whole document, revisions, thumbnail, trash state | Dashboard (`#/`) — create, open, rename, duplicate, export a package, delete |
| **Scene** | actors, rooms, props, modular walls, director's note | Left panel, top — add, rename, duplicate, reorder, delete |
| **Shot** | camera, motion tracks, duration, fps, aspect ratio, shot note | Left panel, below the scenes — add, duplicate, reorder, compare A/B, delete |
| **Blocking** | keyframes per track (position and orientation separately) | Timeline and inspector |
| **Export** | one or several shots into video, stills, and a shot list | **Ekspor video** dialog |

Two consequences worth knowing before you start:

- Changing a shot never changes another shot's keyframes. Adding or removing an actor, on the
  other hand, affects the whole scene — actors belong to the scene, their motion belongs to
  the shot.
- Everything is autosaved. There is no Save button for normal work; the header states the real
  status, and the **Simpan** button exists to download a JSON copy, not to persist.

### 1. Arrange the scene

Use the tabs in **Scene explorer**:

- **Karakter** — actors
- **Lokasi** — rooms and doors
- **Kamera** — the final scene camera

Select an item to edit its properties in the inspector. Choose the move tool or press `G`, then drag an actor. A room must be selected explicitly and unlocked before it can be moved, which prevents a floor click from shifting the set accidentally.

### 2. Set the actor's facing direction

Choose the rotate tool or press `R`, then drag horizontally. You can also:

- press `Q` or `E` to rotate by 5 degrees;
- use the `-15°` and `+15°` buttons;
- enter the angle in the inspector; or
- choose **Hadap kamera** to face the current camera.

The actor's eyes and nose identify its front. In the observer view, an arrow appears on the selected actor as an additional direction cue. The arrow is an editor helper and is excluded from video export.

Coordinate convention:

| Rotation | Facing direction |
|---:|---|
| `0°` | `+Z` |
| `90°` | `+X` |
| `180°` | `-Z` |
| `270°` | `-X` |

### 3. Create movement with keyframes

Move the playhead to a time, then change an actor or camera property. The editor creates or updates a keyframe at that time. The timeline diamonds select existing keyframes.

Position interpolates linearly. Rotation takes the shortest path between two angles. Procedural walking follows traveled distance, so scrubbing to the same timestamp and exporting that timestamp produce the same limb pose. An actor that is stationary or only rotates does not play the walk cycle.

To record a take:

1. Select an unlocked, visible actor.
2. Click the circular record control in the timeline.
3. Hold the arrow keys to move and `Q`/`E` to rotate.
4. Click record again to finish.

The complete take becomes one undo step.

### 4. Add a doorway

1. Open **Lokasi**.
2. Select a room and unlock it.
3. Choose **Tambah pintu** in the inspector.
4. Select **Belakang (-Z)** or **Kiri (-X)**.
5. Set the offset, width, and height in meters.

A room supports one opening per available wall, with a maximum of two openings. The wall is split into side panels and a lintel, producing a real geometric gap rather than a painted door texture.

Doorways do not reroute movement automatically. Position keyframes so the actor passes through the opening. If a straight keyframe segment crosses a solid portion of a wall, the editor displays a warning. Coincident walls require aligned openings in both rooms.

### 5. Configure and preview the camera

Open **Kamera** to set camera position, focal length, and look target. Select **Kamera / final** above the main viewport to work through the final 16:9 framing. Move or rotate an actor from this view using the same tools and shortcuts.

Hiding a camera only hides its observer-view marker and path. Deleting the camera removes the active camera, shows an empty preview, and disables export. Open the camera tab and choose **Tambah kamera** to create a new one, or use Undo to restore the deleted camera and its keyframes.

### 6. Lock, hide, or delete an item

Each row in Scene explorer provides:

- a lock control that blocks editing while allowing existing animation to play;
- a visibility control that hides actors/rooms from the viewport and export; and
- a delete control that removes unlocked items.

Hidden items remain available in the explorer and can be deleted. Deletion can be undone. If a locked camera follows an actor, unlock or retarget the camera before deleting that actor.

## Keyboard and mouse controls

| Input | Action |
|---|---|
| Drag in observer view | Orbit the observer camera |
| Mouse wheel / trackpad scroll | Zoom observer view |
| `O` | Activate observer orbit tool |
| `G` | Activate move tool |
| `R` | Activate actor rotate tool |
| Arrow keys | Move the selected object on the ground plane |
| `Q` / `E` | Rotate the selected actor by `-5°` / `+5°` |
| `Space` | Play or pause the scene |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Ctrl + Y` | Redo |

Shortcuts do not run while typing in an input field. Locked or hidden items do not respond to transformation shortcuts.

## Project data and persistence

Projects are stored in the IndexedDB database `blocking-room` (`src/repository.js`), in five
object stores: `projects` (dashboard metadata), `documents` (full schema v3 documents),
`revisions` (recovery snapshots), `assets` (scene thumbnails), and `session` (per-project UI
state such as the active scene, playhead, selection, and observer pose).

A single transaction writes `documents` + `projects` + `revisions`, so dashboard metadata can
never point at content that failed to be written, and the header only reports *Tersimpan lokal*
after the transaction commits.

`localStorage` is no longer the store of record. It only holds small values that must be read
synchronously before IndexedDB opens: the legacy `blocking-room` document kept as a migration
source (never overwritten), its raw backup, the migration marker, the active project id, the
writer heartbeat, and the synchronous hand-off written when a tab closes before its last
transaction commits.

The current document schema is version `3` (`Project → Scene → Shot`); see
[docs/DATA-MODEL.md](docs/DATA-MODEL.md). Version 1 and version 2 files are migrated on load
through the chain v1 → v2 → v3, copy-first: the source is never mutated, a raw backup is kept,
and the upgraded document is written back once. Version 1 becomes one project with one scene
and one shot; version 2 gains separate position and rotation tracks and identified props. No
migration changes a single pose — equivalence is proven against the phase 0 golden poses to a
tolerance of 1e-9, not by inspection. A document with a *newer* schema is never opened and
never overwritten. Older files without lock,
visibility, or door fields are normalized. Invalid IDs, duplicate timestamps, out-of-range
values, malformed doors, cross-scene references, and broken camera targets are rejected before
anything is stored.

### Routing

| URL | Screen |
|---|---|
| `#/` | Project dashboard |
| `#/trash` | Trash (projects deleted within the last 30 days) |
| `#/project/<id>` | Editor for that project |
| no hash | Editor for the most recently opened project; on a fresh install the demo project is created and opened |

The plain URL deliberately opens the editor rather than the dashboard: continuing existing work
is the common path, and the R0 regression suite loads the bare URL and expects the editor. The
dashboard is always one click away from the editor (**Semua proyek**).

### Trash and cleanup

Deleting a project only stamps `deletedAt`; the document, its revisions, and its session state
are untouched, so restoring it returns the project exactly as it was. Permanent deletion needs
an explicit confirmation and removes metadata, document, session state, and every revision in
one transaction. Because a local app has no background process, trash older than 30 days is
purged **when the dashboard is opened**.

Important persistence behavior:

- Undo history exists only in memory and resets after a page reload; recovery snapshots are separate and survive reloads.
- Browser storage is not a permanent backup and can be cleared by the user or the browser.
- Export a project package or a JSON backup before making large or experimental changes.
- If a save fails, the app keeps the document in memory, says so plainly, and offers a backup download instead of claiming the work is safe.
- Session state (active scene and shot, selection, playhead, observer pose) is stored per project. Navigation changes are written immediately; the playhead and observer pose are throttled, because they change every frame.

## Video export

**Ekspor video** opens an export dialog. The default path is a **deterministic offline render**: every frame is sampled explicitly at `t = frame / fps`, rendered through the same `sampleScene()` used by the preview, encoded with WebCodecs, and written into a WebM container by the project's own muxer. A 10-second shot at 30 fps contains exactly 300 frames and a container duration of 10.000 seconds, verified with `ffprobe` in `tests/export-browser.mjs`.

The dialog offers:

- **Shots** — one shot, several shots (rendered as a sequential queue with per-job progress), or none of the shots that have no camera. Shots without a camera cannot be selected.
- **Range** — the whole shot, a frame range (inclusive), or a range in seconds. Ranges beyond the shot are clamped with a message; reversed ranges are rejected.
- **Resolution** — 1280 × 720 (default) or 1920 × 1080, always matching the shot's aspect ratio, so 9:16 exports as 720 × 1280 or 1080 × 1920. Every dimension is rounded to an even number, which H.264 requires.
- **Frame rate** — follow the shot, or 24 / 25 / 30. Only integer rates are offered: the WebM timestamp scale is milliseconds, so 29.97 and 23.976 would drift.
- **Codec** — two independent capability lists. Deterministic codecs are probed with `VideoEncoder.isConfigSupported()` for the exact resolution and frame rate in use (VP9 by default, plus VP8, AV1, and H.264-in-WebM). The real-time fallback is probed separately with `MediaRecorder.isTypeSupported()`. MP4 is listed as **unavailable, with the reason**, because an approved MP4 muxer does not exist yet.
- **Production reference (optional)** — burn-in of scene · shot, lens, and `MM:SS:FF` timecode; PNG storyboard frames (first, middle, last); and a project shot list as JSON and CSV.

Editor overlays — movement paths, grid, selection rings, direction arrows, camera helpers, labels, safe area, and UI — are **excluded unless "Sertakan overlay editor" is ticked**.

Exported files are named `<project>_<scene>_<shot>.webm` after sanitizing each part.

When the export starts, the document is deep-cloned. Editing the scene while a job runs cannot change that job's output, and the snapshot is also stored as a revision labelled `export`.

Progress reports the current job and frame (`Shot 1/2 · frame 45/300`), the job can be cancelled, and a failed export offers **Coba lagi**. "Ekspor selesai" is only shown once the blob exists.

### Real-time fallback

If `VideoEncoder` is unavailable, the dialog falls back to the original `MediaRecorder` path, labelled **"Real-time (tidak frame-akurat)"**. It records against wall-clock time, so the frame count is not guaranteed, the tab must stay visible, and the file name ends in `_realtime`. This path deliberately does not satisfy the deterministic export gate.

Remaining export constraints:

- Audio is not included.
- Universal MP4 output is not available yet; H.264 can be written into WebM, but player support for that combination is limited.
- Encoded chunks are buffered in memory, so very long high-resolution shots are bounded by available RAM.

## Architecture

Blocking Room is a client-only JavaScript application:

```text
Hash router (app.js)
├── Dashboard  ──► project metadata only (projects store)
└── Editor
    ├── Scene explorer, scene list, and inspector
    ├── Observer/final viewports
    └── Timeline and transport
            │
            ▼
    Scene view ──► document (schema v3) ──► validation ──► history snapshot
            │                                   │
            │                                   └──► autosave ──► IndexedDB
            │                                          (documents + projects + revisions,
            │                                           one transaction)
            ├──► scene sampling ──► Three.js observer renderer
            ├──► scene sampling ──► Three.js camera renderer
            ├──► camera canvas ──► thumbnail ──► assets store
            └──► camera canvas ──► MediaRecorder ──► video file
```

Key design rules:

- The project model is the source of truth; Three.js meshes visualize that model.
- Preview and export sample the same timeline state.
- Walking is deterministic from actor path distance and timeline time.
- Lock prevents user edits but does not freeze existing animation.
- Movement direction and actor facing are independent.
- Door openings are generated as wall panels around a validated gap.

- Every creative change goes through one path: scene view → document → validation → history → autosave. Navigation, selection, and playhead are UI state and never enter history.
- Repository, renderer, timeline, command/history, autosave, tab lock, and export live in separate modules; `main.js` is editor orchestration only.

## Project structure

```text
.
├── index.html                 # Vite entry document
├── src/
│   ├── app.js                 # Hash router: dashboard, trash, or editor
│   ├── routing.js             # Pure route parsing/building
│   ├── dashboard.js           # Project dashboard, trash, import/export
│   ├── dashboard-support.js   # Pure dashboard helpers (unique titles, dates)
│   ├── main.js                # Editor UI, interaction, playback, export
│   ├── bootstrap.js           # Open order: repository → migration → project → lock
│   ├── repository.js          # IndexedDB store (projects/documents/revisions/assets/session)
│   ├── autosave.js            # Coalesced atomic autosave with revision tokens
│   ├── session-state.js       # Per-project UI state (scene, playhead, selection)
│   ├── tab-lock.js            # One writer tab per project
│   ├── document.js            # Schema v3 document store, scene view, scene operations
│   ├── commands.js            # Command/history boundary, read-only enforcement
│   ├── schema.js              # Schema v3 validator and limits
│   ├── migrate.js             # Version 1 → 2 → 3 migration chain (copy-first)
│   ├── package.js             # `.blockingroom.json` package build/read with checksums
│   ├── scene-renderer.js      # Three.js boundary, context-loss handling, dispose
│   ├── timeline-engine.js     # Sampling, time formatting, keyframe helpers, aspect ratios
│   ├── timeline-view.js       # Frame ruler window, snapping, bulk keyframe operations
│   ├── shots.js               # Shot list operations and A/B comparison
│   ├── export-service.js      # MediaRecorder recording (real-time fallback only)
│   ├── export/
│   │   ├── ui.js              # Export dialog: shots, range, resolution, fps, codec
│   │   ├── export-service.js  # Job orchestration, frame loop, queue, file naming
│   │   ├── encoder.js         # Codec selection, VideoEncoder wrapper, backpressure
│   │   ├── webm-muxer.js      # EBML/WebM muxer written for this project (no dependency)
│   │   ├── frame-source.js    # Offscreen POV renderer bound to an immutable snapshot
│   │   ├── realtime.js        # Labelled MediaRecorder fallback
│   │   ├── burn-in.js         # Optional burn-in and safe-area overlay
│   │   └── shot-list.js       # Shot list JSON/CSV and storyboard frame times
│   ├── storage.js             # The only module touching localStorage
│   ├── capabilities.js        # Central browser capability detection (no UA sniffing)
│   ├── no-webgl.js            # Fallback screen when WebGL2 is unavailable
│   ├── metrics.js             # Local-only metrics with a closed property schema
│   ├── flags.js               # Local feature flags (dashboard flag for the pilot)
│   ├── build-info.js          # Build version and commit hash injected by Vite `define`
│   ├── model.js               # Demo project, keyframe sampling, version 1 validation
│   ├── history.js             # Bounded undo/redo project snapshots
│   ├── spatial.js             # Walk cycle, door geometry, wall-crossing checks
│   └── style.css              # Responsive application styling
├── tests/
│   ├── model.test.js          # Project model and migration behavior
│   ├── history.test.js        # Undo/redo behavior and grouping
│   ├── spatial.test.js        # Walking, doors, crossing detection
│   ├── browser-smoke.mjs      # Core browser and video smoke test
│   ├── editor-regression.mjs  # Lock, hide, transform, history regressions
│   ├── walk-doors-delete.mjs  # Walk, door, delete, empty-camera coverage
│   ├── migration-browser.mjs  # Version 1 → 2 migration in a real browser
│   ├── repository-browser.mjs # Autosave, recovery, multi-tab, 100 edit/save cycles
│   ├── dashboard-browser.mjs  # Dashboard, scenes, trash, package import/export
│   ├── capability-browser.mjs # Context loss, no-WebGL fallback, metrics, flags, v1 export
│   ├── a11y-browser.mjs       # Accessibility audit: names, focus, contrast, touch targets
│   ├── shot-timeline-browser.mjs # Shots, timeline, props, modular walls, interpolation
│   ├── gate-r1-browser.mjs    # Release-gate R1 bug hunt: lock bypass, data loss, migration
│   ├── export-browser.mjs     # Deterministic export: 300 frames, frame equivalence, cancel
│   ├── gate-r2-browser.mjs    # Release-gate R2 bug hunt: preview/export, shot isolation
│   ├── preview-check.mjs      # Production build check (needs the preview server, not dev)
│   └── perf-browser.mjs       # Performance harness (input latency, playback, open, memory)
├── docs/
│   ├── PRD.md                 # Product requirements and release scope
│   ├── DATA-MODEL.md          # Schema v3 contract, storage, trash, package format
│   ├── AUDIT.md               # Current behavior, evidence, and risks
│   ├── PERF-BASELINE.md       # Reference device, load fixtures, measured performance
│   ├── A11Y-AUDIT.md          # Accessibility findings: fixed and still open
│   ├── BROWSER-SUPPORT.md     # Support matrix derived from capability detection
│   ├── ROLLOUT.md             # Feature flag, migration backups, rollback procedure
│   ├── GATE-R1.md             # Release gate R1 evidence matrix (PR-01…PR-07)
│   ├── GATE-R2.md             # Release gate R2 evidence matrix (SH/TL/SC/CA/EX + R1 recheck)
│   ├── DECISIONS-NEEDED.md    # Open decisions D-01…D-07, pilot needs, phase 7/8 prerequisites
│   ├── SPIKE-ENCODER.md       # Codec/muxer probe results behind the export design
│   ├── PILOT-PROTOCOL.md      # Pilot task protocol (prepared, not yet run)
│   └── handoff/               # Per-phase implementation reports
├── plan.md                    # Phased implementation plan derived from the PRD
├── package.json
└── vite.config.js
```

## Testing

### Unit tests

```bash
npm test
```

177 tests. The unit suite covers interpolation and per-track sampling (linear/hold/ease), time clamping, keyframe replacement, schema v3 validation, the v1 → v2 → v3 migration chain and its equivalence against the phase 0 golden poses, the repository and its transactions (with a hand-written in-memory IndexedDB so no dependency is added), autosave coalescing and revision tokens, session state, the tab lock, dashboard routing and project operations, package checksums, shot operations, timeline view maths, local metrics, rollback exports, load fixtures, and the export pipeline down to the bytes the WebM muxer writes.

### Production build

```bash
npm run build
```

### Browser regression tests

The browser tests use the installed stable Chrome channel and expect the development server on port `5174`.

Terminal 1:

```bash
npm run dev -- --port 5174 --strictPort
```

Terminal 2:

```bash
npm run test:browser
```

`npm run test:browser` runs 12 suites in sequence. Browser tests write screenshots, JSON fixtures, and test videos to `artifacts/`, which is ignored by Git. They cover the main Three.js workflow, keyframes, camera preview, lock/hide safety, direct viewport manipulation, undo/redo grouping, project round-trips, procedural walking, real doorway geometry, deletion, empty-camera recovery, responsive overflow, video download, version 1 migration, atomic autosave and recovery snapshots, multi-tab isolation, the dashboard journey (create, add scene, switch project, reload, duplicate, trash restore, package round-trip, legacy import, 44 px touch targets, 390 px layout), WebGL context loss and recovery, the no-WebGL fallback, local metrics, the dashboard feature flag, version 1 export for rollback, the accessibility audit, the shot and timeline suite (mode cue, isolated shot alternatives, bulk keyframe editing with one undo, frame snapping and clamping, snap grid, deterministic walking, doors, deleted camera targets, shots without a camera), a release-gate bug hunt for lock bypass and data loss, the deterministic export suite (export dialog capability lists, 300 frames at exactly 10.000 seconds verified with `ffprobe`, first/middle/last frame equivalence against the preview, hidden objects, immutable snapshots, codec failure, cancellation, missing camera, range limits, batch queue with burn-in, storyboard and shot list, and the labelled real-time fallback), and the release gate R2 hunt (preview/export equivalence across 9:16, 2.39:1, 24 fps, hidden actors, props and modular walls, and burn-in; lock enforcement through bulk keyframe moves, paste, delete and marker drags as well as through props and walls; shot A/B isolation surviving undo, redo and a full reload; no data loss when the tab reloads mid-export; and a codec failure driven through the dialog).

Two suites are run three times in a row for the gate — `repository-browser` and `export-browser` — because both were flaky at some point, and a flaky gate cannot be used as a gate.

### Production build verification

The production build is checked against the preview server rather than the dev server:

```bash
npm run build
npm run preview -- --port 4174 --strictPort   # terminal 1
node tests/preview-check.mjs                  # terminal 2
```

This rejects every page error, every console error, and every HTTP response of 400 or above — including requests the browser makes on its own — and confirms the build version is visible and identical in the editor and the dashboard. It is not part of `npm run test:browser` because it needs a different server.

### Performance harness

```bash
npm run test:perf
```

Measures input-to-viewport latency, 60 second playback frame times, project open time, dashboard reads, and GPU resource trends against the load fixture. Set `PERF_LABEL="<device>"` to name the run. It writes `artifacts/perf-baseline.json` and **asserts nothing**: deciding whether a target is met is a human judgement recorded alongside the device in [docs/PERF-BASELINE.md](docs/PERF-BASELINE.md), where the numbers are listed before and after schema v3.

Tested locally during prototype development with Node.js 22 and stable Chrome on macOS. Passing these tests does not yet certify every browser, mobile interaction, accessibility target, or GPU configuration. Screen reader behavior, Edge, Safari, Firefox, and lower-end hardware remain unverified — see [docs/BROWSER-SUPPORT.md](docs/BROWSER-SUPPORT.md) and [docs/A11Y-AUDIT.md](docs/A11Y-AUDIT.md).

## Known limitations

- Everything is local: multiple projects and scenes exist through the dashboard, but there is no cloud sync, account, or collaboration.
- A scene supports zero or one active camera and up to 50 actors, 80 set objects (rooms, props, and wall segments combined), and 120 seconds.
- Actors are geometric mannequins. The procedural walk is a staging cue, not a rigged animation with foot IK.
- Rooms are rectangular and expose only left/back walls. Doors are always open and limited to those walls.
- Wall checks warn about straight keyframe segments but do not enforce physical collision or automatically reroute actors.
- Props and wall segments are static: they cannot be keyframed. Animating a prop would require motion tracks for set objects, which is a separate schema change.
- Interpolation is chosen per track, not per keyframe; there are no per-segment bezier curves yet.
- Props and wall segments rotate through the inspector `r` field; the rotate tool still applies to actors only.
- Keyframe selection has no marquee; use click and Shift/Ctrl-click.
- Rotation uses the shortest angular interpolation; intentional turns greater than 360 degrees are still not represented, even though orientation now has its own track (decision D-06).
- Shortening duration trims later keyframes. Locked animated items must be unlocked before such trimming.
- Video export has no audio and no universal MP4 guarantee; the deterministic path writes WebM only.
- The UI is optimized for desktop. The responsive layout avoids horizontal overflow, but mobile touch ergonomics need further work.
- Accessibility targets and Safari/Firefox compatibility have not yet completed a formal release audit.

## Roadmap

The detailed roadmap lives in [plan.md](plan.md), with product rationale and acceptance criteria in [docs/PRD.md](docs/PRD.md).

| Phase | Focus | Status |
|---|---|---|
| R0 | Safe editor: history, lock, visibility, rotation, final-view editing | Implemented baseline |
| R0.1 | Procedural walking, full item deletion, door openings, wall warnings | Implemented baseline |
| R1 | Local project dashboard, multiple scenes, IndexedDB, autosave recovery, trash, import/export packages | Implemented; release gate passed |
| R2 | Shot list, isolated cameras/tracks, advanced timeline, props, cinematic formats, deterministic export | Implemented; [release gate R2 passed](docs/GATE-R2.md) |
| R3 | Optional cloud sync, revision history, roles, immutable review links, timestamp comments | Conditional on validation |
| Exploration | GLB/rigs, audio cues, floor-plan underlays, continuity tools, AI-assisted blocking | Research backlog |

Schema version 3 has shipped: one migration carries separate position/rotation tracks, hold/ease interpolation, prop entities, and modular walls together. Deterministic export (phase 5) has shipped as well, and both release gates have passed.

**The next step is not a feature.** It is the pilot with 5–8 filmmakers (F6-10/F6-11), and three things must happen first: test Edge, re-measure performance on a PRD-class laptop (8 GB RAM, integrated GPU), and decide whether MP4 is required. Everything needed to start — and every decision that is still open — is written down in [docs/DECISIONS-NEEDED.md](docs/DECISIONS-NEEDED.md). No phase 7 (cloud) or phase 8 (exploration) work has been started, deliberately.

## Contributing

Contributions, bug reports, and focused proposals are welcome.

Before starting substantial work:

1. Read the [PRD](docs/PRD.md), [audit](docs/AUDIT.md), and [implementation plan](plan.md).
2. Check existing GitHub issues and open an issue for behavior or architecture changes.
3. Keep pull requests scoped to one problem or plan task.
4. Preserve existing project data and version 1 import behavior.
5. Add regression coverage for changes to history, lock, visibility, keyframes, picking, doors, persistence, or export.
6. Run unit tests, the production build, and the relevant browser tests.

Suggested commit style:

```text
feat: add local project repository
fix: preserve camera target during actor undo
test: cover doorway crossing at room boundary
docs: clarify browser export limitations
```

When reporting a bug, include:

- browser and operating system;
- steps to reproduce;
- expected and actual behavior;
- a minimal JSON project when the issue depends on scene data; and
- console output or a short recording when useful.

Please avoid including private scripts, names, footage, or production documents in public issues or fixtures.

## Security and privacy

The current application runs entirely in the browser and does not contain a backend or analytics integration. Scene data is stored locally and exported only when the user asks the browser to download a file.

Even so, local browser data is not a secure archive. Do not place confidential production information in public bug reports or committed test fixtures. If you discover a vulnerability, avoid publishing exploit details in an issue; contact the repository owner through the private contact method available on their GitHub profile until a dedicated security policy is added.

## Documentation

- [Product requirements](docs/PRD.md) — product scope, acceptance criteria, data model, rollout, risks, and future features.
- [Implementation plan](plan.md) — phased engineering tasks, quality gates, and the execution log with evidence for every completed task.
- [Decisions needed](docs/DECISIONS-NEEDED.md) — **start here if you own the product.** Status of decisions D-01…D-07, what is required to run the pilot, concrete options with trade-offs for the cloud phase (no vendor chosen), and how to start each exploration item.
- [Release gate R1](docs/GATE-R1.md) — evidence matrix for PR-01…PR-07 (projects, storage, tabs).
- [Release gate R2](docs/GATE-R2.md) — evidence matrix for SH-01, TL-01, TL-02, SC-01, CA-01, EX-01…EX-03, the bugs found and fixed, and the limits of what the gate proves.
- [Data model](docs/DATA-MODEL.md) — schema v3 contract, invariants, migration rules, and every place a stored document is read.
- [Performance baseline](docs/PERF-BASELINE.md) — reference device, metric definitions, and measured numbers before and after schema v3.
- [Accessibility audit](docs/A11Y-AUDIT.md) and [browser support](docs/BROWSER-SUPPORT.md) — what was tested and what is only inferred.
- [Rollout and rollback](docs/ROLLOUT.md) — build verification, feature flag, backups, and the downgrade paths.
- [Pilot protocol](docs/PILOT-PROTOCOL.md) — participant criteria, tasks, and decision criteria fixed *before* the pilot.
- [Encoder spike](docs/SPIKE-ENCODER.md) — codec probe results behind the export design.
- [Current audit](docs/AUDIT.md) — implemented behavior, regression evidence, limitations, and priorities.
- [Handoff reports](docs/handoff/) — one report per phase, each with its own risks and limits of conclusion.

## License

Blocking Room is released under the [MIT License](LICENSE).

## Acknowledgements

- [Three.js](https://threejs.org/) for browser-based 3D rendering.
- [Vite](https://vite.dev/) for the development and production build pipeline.
- [Lucide](https://lucide.dev/) for interface icons.
- [Playwright](https://playwright.dev/) for browser regression testing.

---

**Bahasa Indonesia:** Blocking Room adalah editor previs 3D untuk mengatur lokasi, karakter, arah hadap, gerakan, kamera, dan mengekspor video referensi. Jalankan `npm install` lalu `npm run dev`. Dokumentasi produk lengkap tersedia di [docs/PRD.md](docs/PRD.md), sedangkan urutan pengembangannya ada di [plan.md](plan.md).
