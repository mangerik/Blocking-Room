# Blocking Room

Browser-based 3D previsualization for planning actors, sets, movement, and camera blocking before a film shoot.

[![Three.js](https://img.shields.io/badge/Three.js-r180-1f2521?logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-b75c3c.svg)](LICENSE)

Blocking Room turns a scene into a simple interactive 3D plan. Arrange geometric actors and rooms, define where each actor faces, animate blocking with keyframes, preview the scene through a film camera, and export the result as a reference video.

The interface is currently in Indonesian. This README uses English so the project is accessible to a wider open-source community; important product documentation remains available in Indonesian.

> **Project status:** early functional prototype. It is useful for blocking experiments and reference exports, but it is not yet a production-ready multi-project or collaborative system.

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

### Editing safety

- Undo and redo up to 100 document changes during the current browser session.
- Group a drag, held keyboard gesture, or recorded take into one undo step.
- Prevent inspector, pointer, keyboard, delete, and keyframe operations from changing locked items.
- Ignore hidden objects and editor-only direction helpers during picking.
- Validate imported project data before it replaces the current document.

### Saving and output

- Autosave the active document to browser `localStorage`.
- Download and reopen a JSON project backup.
- Export the camera view as a 1280 × 720 reference video using the browser's supported recording codec.

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

The prototype currently stores one active document under the `blocking-room` key in browser `localStorage`. Saving through the header downloads a readable JSON backup; opening a JSON file validates it before replacing the active project.

The current schema is version `1` and stores:

- project title and duration;
- actors, colors, height, visibility, lock state, and position/rotation keyframes;
- rooms, dimensions, visibility, lock state, and doorway definitions; and
- an optional camera with focal length, target, visibility, lock state, and transform keyframes.

Older version 1 files without lock, visibility, or door fields are normalized on load. Invalid IDs, duplicate timestamps, out-of-range values, malformed doors, and broken camera targets are rejected.

Important persistence behavior:

- Undo history exists only in memory and resets after a page reload.
- Browser storage is not a permanent backup and can be cleared by the user or browser.
- The editor currently manages one active project rather than a project dashboard.
- Download a JSON backup before making large or experimental changes.

Multi-project storage, IndexedDB, recovery snapshots, scene management, and safe multi-tab editing are specified in the [product requirements](docs/PRD.md) and [implementation plan](plan.md), but are not implemented yet.

## Video export

**Ekspor video** records one real-time pass of the active camera at 1280 × 720 with a target of 30 fps. The export omits editor labels, selection rings, direction arrows, camera helpers, movement paths, grid, and UI.

The encoder is selected with `MediaRecorder.isTypeSupported()`. Chrome typically produces WebM using VP9 or VP8; MP4 is used only when the current browser reports it as recordable.

Current export constraints:

- Export takes approximately the full scene duration.
- Keep the page active until recording completes.
- Smoothness depends on device and browser performance.
- Audio is not included.
- Frame count is not yet guaranteed by an offline deterministic renderer.
- Universal MP4 output is not available yet.

The roadmap includes explicit resolution, frame-rate, range, and codec settings; immutable export snapshots; deterministic frame sampling; cancellation/retry; and reference overlays.

## Architecture

Blocking Room is a client-only JavaScript application:

```text
Browser UI
├── Scene explorer and inspector
├── Observer/final viewports
└── Timeline and transport
        │
        ▼
Document state ──► history snapshots ──► localStorage / JSON
        │
        ├──► scene sampling ──► Three.js observer renderer
        ├──► scene sampling ──► Three.js camera renderer
        └──► camera canvas ──► MediaRecorder ──► video file
```

Key design rules:

- The project model is the source of truth; Three.js meshes visualize that model.
- Preview and export sample the same timeline state.
- Walking is deterministic from actor path distance and timeline time.
- Lock prevents user edits but does not freeze existing animation.
- Movement direction and actor facing are independent.
- Door openings are generated as wall panels around a validated gap.

The current entry point still owns substantial UI and editor orchestration. The roadmap separates repository, renderer, timeline, command/history, and export responsibilities before multi-project work expands the state model.

## Project structure

```text
.
├── index.html                 # Vite entry document
├── src/
│   ├── main.js                # UI, Three.js scene, interaction, playback, export
│   ├── model.js               # Initial document, keyframe sampling, validation
│   ├── history.js             # Bounded undo/redo project snapshots
│   ├── spatial.js             # Walk cycle, door geometry, wall-crossing checks
│   └── style.css              # Responsive application styling
├── tests/
│   ├── model.test.js          # Project model and migration behavior
│   ├── history.test.js        # Undo/redo behavior and grouping
│   ├── spatial.test.js        # Walking, doors, crossing detection
│   ├── browser-smoke.mjs      # Core browser and video smoke test
│   ├── editor-regression.mjs  # Lock, hide, transform, history regressions
│   └── walk-doors-delete.mjs  # Walk, door, delete, empty-camera coverage
├── docs/
│   ├── PRD.md                 # Product requirements and release scope
│   └── AUDIT.md               # Current behavior, evidence, and risks
├── plan.md                    # Phased implementation plan derived from the PRD
├── package.json
└── vite.config.js
```

## Testing

### Unit tests

```bash
npm test
```

The unit suite covers interpolation, time clamping, keyframe replacement, project validation, legacy defaults, history behavior, deterministic walking, doorway panels, wall-crossing detection, and projects without a camera.

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

Browser tests write screenshots, JSON fixtures, and test videos to `artifacts/`, which is ignored by Git. They cover the main Three.js workflow, keyframes, camera preview, lock/hide safety, direct viewport manipulation, undo/redo grouping, project round-trips, procedural walking, real doorway geometry, deletion, empty-camera recovery, responsive overflow, and video download.

Tested locally during prototype development with Node.js 22 and stable Chrome on macOS. Passing these tests does not yet certify every browser, mobile interaction, accessibility target, or GPU configuration.

## Known limitations

- Only one active local project is available; there is no dashboard, cloud sync, account, or collaboration.
- A scene supports zero or one active camera and up to 50 actors, 30 rooms, and 120 seconds.
- Actors are geometric mannequins. The procedural walk is a staging cue, not a rigged animation with foot IK.
- Rooms are rectangular and expose only left/back walls. Doors are always open and limited to those walls.
- Wall checks warn about straight keyframe segments but do not enforce physical collision or automatically reroute actors.
- Set decorations are still demonstration geometry rather than first-class editable props.
- Timeline editing has no keyframe drag, multi-select, copy/paste, per-property tracks, easing editor, or frame snapping.
- Rotation uses the shortest angular interpolation; intentional turns greater than 360 degrees are not represented.
- Shortening duration trims later keyframes. Locked animated items must be unlocked before such trimming.
- Video export is real-time and browser-dependent, with no audio or universal MP4 guarantee.
- The UI is optimized for desktop. The responsive layout avoids horizontal overflow, but mobile touch ergonomics need further work.
- Accessibility targets and Safari/Firefox compatibility have not yet completed a formal release audit.

## Roadmap

The detailed roadmap lives in [plan.md](plan.md), with product rationale and acceptance criteria in [docs/PRD.md](docs/PRD.md).

| Phase | Focus | Status |
|---|---|---|
| R0 | Safe editor: history, lock, visibility, rotation, final-view editing | Implemented baseline |
| R0.1 | Procedural walking, full item deletion, door openings, wall warnings | Implemented baseline |
| R1 | Local project dashboard, multiple scenes, IndexedDB, autosave recovery, trash, import/export packages | Planned |
| R2 | Shot list, isolated cameras/tracks, advanced timeline, props, cinematic formats, deterministic export | Planned |
| R3 | Optional cloud sync, revision history, roles, immutable review links, timestamp comments | Conditional on validation |
| Exploration | GLB/rigs, audio cues, floor-plan underlays, continuity tools, AI-assisted blocking | Research backlog |

The immediate next work is to freeze migration fixtures and establish the Project → Scene → Shot data contract before replacing storage or building the dashboard.

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
- [Implementation plan](plan.md) — phased engineering tasks and quality gates.
- [Current audit](docs/AUDIT.md) — implemented behavior, regression evidence, limitations, and priorities.

## License

Blocking Room is released under the [MIT License](LICENSE).

## Acknowledgements

- [Three.js](https://threejs.org/) for browser-based 3D rendering.
- [Vite](https://vite.dev/) for the development and production build pipeline.
- [Lucide](https://lucide.dev/) for interface icons.
- [Playwright](https://playwright.dev/) for browser regression testing.

---

**Bahasa Indonesia:** Blocking Room adalah editor previs 3D untuk mengatur lokasi, karakter, arah hadap, gerakan, kamera, dan mengekspor video referensi. Jalankan `npm install` lalu `npm run dev`. Dokumentasi produk lengkap tersedia di [docs/PRD.md](docs/PRD.md), sedangkan urutan pengembangannya ada di [plan.md](plan.md).
