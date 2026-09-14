# 360° room capture — implementation plan

Written 2026-09-11 against the code at `a49eb7c`. Every file, constant and
limit named below was read, not assumed.

## Status

**Items 1, 2 and 3 are implemented** (2026-09-11). `tsc --noEmit` is clean and
`npm test` is 286/286 — both run on the machine, not asserted. What landed:

| File | |
|---|---|
| `src/domain/capture.ts` | new — `MAX_PHOTOS`, the one definition |
| `src/domain/imageStats.ts` | new — pure luminance and variance-of-Laplacian |
| `src/domain/keyframes.ts` | new — `selectKeyframes`, coverage first, focus second |
| `src/media/frameSignals.ts` | new — resize, decode, measure; undefined on any failure |
| `types/jpeg-js.d.ts` | new — the decoder surface we depend on, written down |
| `app/capture.tsx` | imports `MAX_PHOTOS`; now measures brightness and sharpness |
| `app/v1/detect+api.ts` | imports `MAX_PHOTOS` instead of mirroring it |
| `__tests__/keyframes.test.ts` | new — 13 tests |
| `__tests__/imageStats.test.ts` | new — 11 tests |

**`npm install` is required before this builds** — `jpeg-js@^0.4.4` was added to
`package.json` and is not in `node_modules` yet. It is a pure-JavaScript decoder:
no native module, no config plugin, no permission, and it works in Expo Go. It is
there because nothing in the Expo SDK returns raw pixels, and focus cannot be
measured without them.

`npm run lint` cannot run in the Cowork device VM at all — `node_modules` was
installed on macOS, and `unrs-resolver` (under `eslint-plugin-import`) is a
platform-native binary with no Linux build present. `tsc` and `npm test` are pure
JavaScript and run fine there. Lint is a Mac-only check for this repo; worth
knowing before someone reads a crash as a code problem.

Item 4, the sweep screen, is untouched and still needs a decision on
`expo-camera` plus a physical iPhone. Everything above works, and improves the
existing tap-per-angle flow, whether or not the sweep is ever built.

## Most of this already exists

The thing worth knowing before planning any of it: **multi-angle capture is
already built, end to end.**

- `app/capture.tsx` accumulates angles in state (`angles`), gates each one
  through `assessPhoto`, and holds them until the user taps **Measure this
  room**. `MAX_ANGLES = 4`.
- `src/api/detect.ts` types the request as `photos: CapturedPhoto[]` — every
  photo of one room in a single call — and its comment already states the
  reason: *"deciding whether that is one sofa from two angles or two matching
  sofas needs both images in view at once."*
- `app/v1/detect+api.ts` accepts up to `MAX_PHOTOS = 4`, numbers each image in
  the content block, and the system prompt has a **More than one photograph**
  section instructing exactly-once output and telling the model to attribute
  each object to the view where it is most fully visible.
- `src/domain/rooms.ts` already resolves a second capture of the same room to
  the same `roomId`, so re-shooting a room cannot fork it into two.

So 360° is **not** a protocol change, not a backend change, and not a
deduplication project. The dedup work is done. What is missing is the capture
interaction: today the user taps a button, gets the system camera, shoots, taps
again, four times. A sweep replaces that with one continuous motion.

That reframes the whole job. The plan below is a **capture UX change plus an
on-device frame-selection step**, feeding the pipeline that already exists.

## The constraint that shapes everything: 4 photos

A sweep produces 30–300 frames. The server takes four. So the sweep cannot send
what it captures — something on the device has to choose.

Keeping `MAX_PHOTOS = 4` rather than raising it is the right call, and not only
for cost:

- The system prompt's dedup instruction is written for a handful of views a
  human framed. Twenty near-identical frames of a slow pan is a different and
  much harder problem for it, and duplication is the error the prompt itself
  calls "the worst error you can make here".
- `UPSTREAM_TIMEOUT_MS = 11_000` in the route, under `REQUEST_TIMEOUT_MS =
  15_000` in `src/api/client.ts`. Four 1568×1176 images is already the slow case.
- Every image is billed.

**So: sweep wide, send four.** Frame selection is the only genuinely new logic.

## Capture mechanism — three options, one answer

### (a) Guided sweep with live preview — recommended

`expo-camera` for a preview and programmatic `takePictureAsync`, `expo-sensors`
`DeviceMotion` for yaw. The user stands in the doorway, turns slowly, and the app
captures automatically at yaw intervals while showing a progress arc.

Cost: two new native modules. **`expo-camera` was deliberately removed** in the
2026-08-25 pass — "One less native module and one less permission string for App
Store review" — so this reverses a decision made on purpose, and the reversal
should be made knowingly. The camera usage string already exists in `app.json`
under the `expo-image-picker` plugin and would move to `expo-camera`; no new
permission is requested of the user.

### (b) Record video, extract frames

`expo-camera` video plus `expo-video-thumbnails` at chosen timestamps. Avoids
timed still capture, but thumbnails come back at preview resolution — well below
the `MIN_EDGE_PX = 640` gate in `photoQuality.ts`, and far below the detail the
scale-anchor method needs. Also writes a video file to disk, which is a bigger
privacy surface than frames held in memory.

### (c) True panorama stitching — reject

No maintained React Native library, and more importantly **it would damage the
product**. The system prompt's entire dimension method is measuring against
undistorted reference objects — a door leaf at 80 in, an outlet plate at 4.5 in.
It already warns that *"wide-angle phone lenses stretch objects near the left and
right edges."* Equirectangular projection warps every straight edge in the frame
by design. Stitching would break the ruler to save the user a few taps.

**Take (a).**

## Work items, in order

### 1. Lift `MAX_PHOTOS` to one definition

`app/capture.tsx` line 15 declares `MAX_ANGLES = 4` with the comment "Mirrors
MAX_PHOTOS in app/v1/detect+api.ts" — a constant defined twice across the
client/server boundary, with a comment where the import should be. The repo's
standing invariant is one source of truth per concept, and every place this was
violated before, the two drifted.

New `src/domain/capture.ts` exporting `MAX_PHOTOS = 4`; both files import it.
The route is bundled from this repo, so it can. Do this first — the sweep makes
a mismatch here much more likely, because selection will be written against
whichever number it read.

### 2. Measure sharpness for real

`src/domain/photoQuality.ts` has `MIN_SHARPNESS = 0.25` and `MIN_BRIGHTNESS =
0.18`, and `capture.tsx` passes `brightness: undefined, sharpness: undefined`
with a comment saying so honestly: *"nobody has looked."* Those gates have never
fired.

Today that is tolerable — the user chose and framed each shot. **A sweep makes it
load-bearing**, because auto-captured frames are not reviewed by anyone before
they are sent, and a blurry frame from a turning phone is the normal case, not
the exception.

New `src/media/frameSignals.ts`, next to `prepareUpload.ts` because it also
touches pixels: downscale a frame hard (128px long edge is plenty), read the
luma, return `{ brightness, sharpness }` — mean luminance and a
variance-of-Laplacian proxy, normalised to the 0–1 range the existing thresholds
already expect. No new dependency; `expo-image-manipulator` is already in.

This is worth doing **even if the sweep is never built**. It is the only reason
two implemented, tested quality gates currently do nothing.

### 3. The one piece of new domain logic: `selectKeyframes`

New `src/domain/keyframes.ts`, pure, no framework imports — which is what keeps
`npm test` runnable with zero dependencies installed, the property the README
tells you to protect.

```ts
export interface CandidateFrame {
  id: string;
  yawDeg: number | null;   // null when DeviceMotion is unavailable
  capturedAtMs: number;
  brightness: number;
  sharpness: number;
}

export function selectKeyframes(
  frames: CandidateFrame[],
  limit: number,
): CandidateFrame[];
```

Rules, in priority order:

1. Discard any frame failing `assessPhoto` on brightness or sharpness. If that
   leaves fewer than two, keep the sharpest regardless — a poor inventory beats
   no inventory, and the user still reviews it on Screen 2.
2. Maximise angular coverage. Partition the yaw circle into `limit` buckets
   anchored at the first kept frame; take the sharpest frame per bucket.
3. When yaw is null throughout (no sensor, or the user did not turn), fall back
   to even spacing over `capturedAtMs`.
4. Break ties by `id`, the same way `packing.ts` does, so the selection is
   deterministic and a test can assert it.

### 4. The sweep screen

New `app/sweep.tsx` rather than a rewrite of `capture.tsx`. The existing screen
stays, and stays reachable: `launchCameraAsync` rejects outright on the iOS
Simulator, which is the only place the app can currently be developed, and the
library path is the only flow that works there. Deleting the tap-per-angle path
would take the simulator with it.

The sweep screen owns the preview, the yaw readout, auto-capture, and the
progress arc; it hands `selectKeyframes`' output to `prepareUpload` and then to
the **unchanged** `measureRoom` logic. `resolveRoomId`, `addRoom`, `addPhoto`,
`addItems` and the Screen 2 confidence gate all stay exactly as they are.

Entry point: the sweep becomes the primary button on `capture.tsx` when a camera
is available, with "Take photos instead" as the secondary. Not a replacement —
a promotion.

### 5. Tests

`__tests__/keyframes.test.ts`, in the style of the existing suite where each
assertion pins a specific failure:

- never returns more than `MAX_PHOTOS`, at any input size
- a 360° sweep returns frames spread across the circle, not four consecutive
  frames from wherever the user paused
- given two frames at similar yaw, returns the sharper one
- identical inputs return identical output (determinism)
- all-null yaw falls back to time spacing rather than returning one frame
- every frame failing the quality gate still yields at least one frame out

And extend `__tests__/photoQuality.test.ts`: with `frameSignals` now supplying
real numbers, `MIN_BRIGHTNESS` and `MIN_SHARPNESS` finally have live callers and
deserve boundary cases.

## Cost and latency — the real delta

Not "a sweep is expensive". The pipeline already sends up to four images. The
change is that **a sweep makes four the normal case**, where today most users
will stop at one or two.

The arithmetic, from numbers in the code: `UPLOAD_LONG_EDGE = 1568` at 4:3 is
1568×1176 ≈ 1.84 M pixels ≈ **2,460 image tokens per frame**. Four frames plus
the system prompt is roughly **11,000 input tokens per room**, up to 4,000 out. A
three-bedroom house is eight or nine rooms. Multiply by whatever the model in
`VISION_MODEL` costs and that is the per-move inference bill the leadership
standup flagged on 2026-09-08 as uncosted — this is the change that makes it
concrete, so cost it before shipping, not after.

Latency deserves a measurement, not a guess. Four images against an 11-second
upstream timeout is the slow path today and the default path after. If p95 lands
near the ceiling, the levers are: drop to three frames, raise
`UPSTREAM_TIMEOUT_MS` and `REQUEST_TIMEOUT_MS` together, or let the user proceed
while detection finishes. Do not raise one timeout without the other — the route's
comment explains why the server's must stay under the client's.

## Privacy

The route stays a strict pass-through and `APP_STORE.md`'s "Data Not Collected"
answer is unaffected: nothing new is transmitted, and fewer frames are sent than
are taken.

But the sweep captures many frames and discards most, and that is new on-device
surface. Two requirements, both easy and both easy to forget:

- Unselected frames are deleted from the cache directory as soon as selection
  runs. `expo-camera` writes each still to disk; a sweep per room across a house
  would otherwise leave a hundred photographs of someone's home sitting in the
  app container.
- `capture.tsx` currently tells the user, directly above the button: *"Photos are
  read to identify furniture, then discarded. Nothing is uploaded unless you
  choose it."* Auto-capture means the user is no longer choosing each frame. That
  sentence has to be rewritten to stay literally true on the sweep screen — it is
  a promise, and `APP_STORE.md` commits to making it before the permission prompt
  appears.

## What this does not change

Worth stating so nobody re-opens it mid-build: the `/v1/detect` contract, the
system prompt's dedup section, `resolveRoomId`, `parseDetectedItem` and its
plausibility downgrade, the Screen 2 confidence gate, volume, truck sizing,
quotes, packing, and the layout solver. All untouched.

## Decisions needed before starting

1. **Re-add `expo-camera` and `expo-sensors`?** This reverses a deliberate
   removal. It is the whole of the "is a sweep possible at all" question — there
   is no live-preview path without it.
2. **Ship order.** Item 2 (real sharpness signals) stands alone and fixes a
   live gap whether or not the sweep happens. Items 1 and 3 are cheap, pure and
   fully testable in the sandbox with no device. Item 4 needs a physical iPhone —
   no simulator has a camera or a gyroscope — so it cannot even be smoke-tested
   until the first device run happens, which has not happened yet.
3. **Is this v1 or v1.1?** The app has never rendered on a screen. Taking the
   single most device-dependent feature in the product as the thing to build
   before first launch is a sequencing question, not an engineering one.

My read: do 1, 2 and 3 now — they are pure, testable, and item 2 repairs
something already broken — and hold item 4 until the app has run on a real phone.

## Footnote

`app.json` lists `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` twice each
under `android.permissions`. Harmless, unrelated to this, worth a one-line fix
next time that file is open.
