# Loadsy — Build State

Snapshot imported from the claude.ai "Loadsy App" project on 2026-09-11. It is
the running project-level record; the sections below are dated and kept in
order rather than rewritten, so the reasoning stays readable.

> **Verified against the repository on 2026-09-11, and parts of the 09-08 entry
> below are now out of date.** Where they disagree, the code and `README.md`
> win:
>
> - **The backend gap is closed.** `app/v1/detect+api.ts` exists — one endpoint,
>   deployed with the app, a strict pass-through whose only job is to keep the
>   vision key off the device. Option (b) from "The backend gap" was taken.
> - **Web works.** `react-dom` and `react-native-web` are dependencies, and
>   `npx expo start --web` is now the fastest way to see the flow. Item 7 under
>   "What's next" is done.
> - **More than seven screens.** A Your Trip step (`app/trip.tsx`), a free /
>   premium line (`src/domain/tier.ts`, `src/billing/`), a demo mode with four
>   prepared inventories, and a solved 3D truck layout have all landed since.
> - **A hosted demo is live** at <https://loadsy.expo.app>.
> - The test suite is 27 files, not the 56 domain tests of the 09-08 count.

## Where the code lives

`~/Documents/loadsy` on Josh's MacBook Pro, pushed to
<https://github.com/joshuasitton/Loadsy>. The original tarball is at
`~/Documents/loadsy/_archive/loadsy-source.tar.gz` and can be deleted.

**Dependencies are installed as of 2026-09-08** (`npm install` succeeded on
Josh's Mac). This is a change from every prior session — the tree had never been
resolved before.

## Stack decision

React Native + Expo (SDK 57), TypeScript, expo-router.

The MVP spec was written as native iOS (Swift structs,
`SFSafariViewController`). Josh chose Expo. Everything in the spec is reachable:
`expo-web-browser` is `SFSafariViewController` on iOS. Swift computed properties
became pure functions; `Decimal` became `number` (dollars, cents-rounded at
boundaries); `Date` became ISO strings. All noted in the repo README.

## Status (2026-09-08)

All 7 screens plus the §3.1 price breakdown modal are implemented. 56 domain
tests pass. Runs end-to-end on mocked API responses — no backend required.

`npm test` runs through Node's built-in test runner with **zero dependencies
installed**, because the domain layer has no framework imports. Keep it that
way — it is what made the build verifiable in a sandbox with no npm access.

**2026-09-08 — the build compiles clean against real installed dependencies.**
Josh confirmed `npm install` succeeded and `tsc --noEmit` passes on his Mac.
This retires the project's largest standing risk: the SDK-57 dependency
correction and the `File`/`Paths` migration in `layout-view.tsx` were both
written from documentation and had never been compiled. They hold.

Current state at that date was **verified code, unverified product** — nothing
had yet rendered on a screen.

Still open from that step: whether `npx expo install --fix` changed any pin. If
it did, the installed `expo` disagrees with the `sdk-57` branch manifest and
that is worth chasing.

## Environment constraint — read this before planning a session

The npm registry returns 403 from **both** the Claude cloud container and the
Cowork device VM (re-verified 2026-08-25), github.com is blocked from the device
VM as well (2026-09-11), and that VM is Linux with no Xcode. So `npm install`,
`tsc --noEmit`, `expo lint`, `git push` and anything involving a simulator can
only run in Josh's own macOS Terminal. Claude can read, reason about and edit
the repo remotely, and can commit, but cannot compile, run or push it. Plan
remote sessions around that: Claude prepares, Josh executes, Claude reads the
output back. Claude Code running on the Mac has none of these limits.

### Xcode — installed 2026-08-25

The App Store download finished at ~17:50 UTC; `/Applications/Xcode.app` is
present and the `.appdownload` placeholder is gone. It had **not been launched
or configured** as of the last check — `/Library/Developer` held only
`CommandLineTools`, so first-launch component installation may still be
outstanding:

```bash
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -downloadPlatform iOS
```

Until those run, `xcode-select -p` still points at CommandLineTools and
`expo run:ios` fails with a confusing error. `npx expo start` + Expo Go on a
physical iPhone remains a valid path that needs none of this, and EAS Build
covers TestFlight and submission without a local toolchain.

## The backend — decided, and built

*(The 09-08 framing of this as the largest open item is superseded; kept because
the three options and the reasoning behind them are still the record of why the
shape is what it is.)*

The app ran on `EXPO_PUBLIC_USE_MOCKS=true` with no `/v1/detect` behind it.
Photo-based inventory is the product's premise and was a mock returning canned
furniture. Three shapes were put to the Chairman on 2026-09-08:

- **(a) On-device inference** (Core ML / Vision). No server, no photo leaves the
  phone, collapses most privacy exposure. Largest engineering change.
- **(b) Thin hosted API** in front of a vision model. Closest to what the client
  code already expects. Real per-inference cost and a real privacy surface.
- **(c) Manual inventory only in v1**, detection deferred to v1.1. Fastest to
  the App Store, weakest product story.

**(b) was taken**, in the narrowest form it can take: one route,
`app/v1/detect+api.ts`, deployed with the app, existing solely because the
vision model's API key cannot ship to a device. Everything else Loadsy computes
runs on the client because it can. Security's condition holds in the
implementation — the route writes nothing to disk or to a log, which is what
keeps the "Data Not Collected" answer in `APP_STORE.md` true. If retention is
ever added, the privacy label changes with it.

Still owed: real brightness and sharpness signals into `app/capture.tsx`. The
quality thresholds are implemented and tested but currently fed a hard-coded
`1`.

## Submission blockers

- **Privacy policy URL** — mandatory for App Store submission. None exists.
- **App Privacy nutrition label** — drafted in `APP_STORE.md`; depends on the
  pass-through staying a pass-through.
- **Apple Developer Program enrollment** — status unknown. Individual is
  same-day; Organization requires a D-U-N-S number and can take weeks. If Loadsy
  ships as a company, this clock should start immediately; it blocks nothing and
  is blocked by nothing.
- **App Store screenshots and metadata** — cannot start until the app renders on
  a device.
- **EXIF strip on production assets** — `exiftool -all= assets/*.png` before the
  production build.

## 2026-09-03 — branding: app icon + splash screen

Designed and deployed branding assets with a "warm & human" direction in the
app's green palette (#0B7A62 accent, #F0F8F3 soft ground): `icon.png`
(1024×1024), `splash.png` (1284×2778), `adaptive-icon.png` (432×432) and
`favicon.png` (48×48).

`app.json` changed with it — `expo.plugins[expo-splash-screen].backgroundColor`
`#FFFFFF` → `#F0F8F3`, and `expo.android.adaptiveIcon.backgroundColor`
`#0F1B2D` → `#F0F8F3`.

**That icon has since been replaced.** The box truck was the category's stock
image — U-Haul, Budget, PODS and Lugg all resolve to the same picture — and its
one distinguishing detail, a tape measure along the roof, disappeared below
about 64px. The mark is now an L of two cargo blocks with the brand colour
filling the notch: the safety reserve the sizing model holds back. Geometry
lives in `src/ui/markGeometry.ts` and nothing else defines it; `npm run
brand:icons` rasterises the same numbers and reads the PNGs back to check them.
See README, "The mark".

Review items still open from that pass: the lowercase "loadsy" wordmark reading
as a system font (post-launch), a tape-forward icon variant as a v2 A/B test,
splash `imageWidth: 200` on tablets (testable at first device run), and an App
Store listing colour monotone check once screenshots exist.

## 2026-09-03 — edge-case audit (second pass)

Static review of all 12 screen files and 6 support modules. Twelve edge cases
found, ten fixed, `tsc --noEmit` clean afterwards. Fixed: double-tap and error
guards on `finishMove()`; spinner left on by a rejected `fillFromLocation()`;
`setBusy(false)` never reached on a successful login; a stale "Plan saved" badge
after an inventory change; fire-and-forget persistence in `historyStore.remove()`
now rolling back on failure; every `measureRoom()` error reported as "no
furniture"; geolocation re-filling a deliberately cleared field; no confirmation
on item removal; iOS number-pad hiding the decimal point; and a deep link into
`truck.tsx` bypassing the §3 Screen 2 gate.

Deferred, both minor: `Alert.alert` has no web fallback (`capture.tsx`,
`quote/[id].tsx`), and `moveStore` persists on every keystroke rather than on a
debounce.

## 2026-08-25 — pre-simulator pass

Dependency versions were originally guessed in a sandbox with no registry
access, and **every one of them was wrong**. SDK 57 uses unified `~57.x`
versioning for Expo packages; the manifest had SDK-52-era numbering
(`expo-router@~7.0.0`, `expo-file-system@~20.0.0`, …). `npm install` would not
have resolved. Corrected against `github.com/expo/expo` branch `sdk-57`, file
`packages/expo/bundledNativeModules.json` — that file is the authority, not
guesswork, and it is worth re-reading on any SDK bump. **The 2026-09-08 clean
`npm install` confirms this correction was right.**

Also in that pass: added `react-native-worklets@0.10.1` (Reanimated 4 will not
build without it); added `expo-splash-screen` and moved splash out of the
deprecated top-level `app.json` `splash` key; removed `expo-camera` entirely —
nothing imported it, the camera is reached through
`expo-image-picker.launchCameraAsync`, so its `cameraPermission` moved to the
image-picker plugin, leaving one less native module and one less permission
string for App Store review; and `typescript` moved to `~6.0.3`, which is what
SDK 57 ships.

### Bugs fixed in the same pass

Found by static review; none of them had ever run.

1. **`prices.tsx` refetched forever.** `move.moveDate ?? new Date().toISOString()`
   was computed unmemoised, so `load`'s `useCallback` identity changed every
   render and its effect re-fired every render.
2. **`layout-view.tsx` used the removed `expo-file-system` API.**
   `cacheDirectory` and `writeAsStringAsync` moved to `expo-file-system/legacy`
   in SDK 54. Migrated to the `File`/`Paths` class API.
3. **`capture.tsx` failed silently on a device with no camera.** Every `await`
   sat *outside* the `try`, and `launchCameraAsync` rejects outright there.
4. **`capture.tsx` orphaned a room per failed attempt** — `addRoom` dispatched
   before detection.
5. **`capture.tsx` never sent the image.** `base64: true` was missing from the
   picker options, so `imageData` posted as `''` — invisible under mocks.
6. **iOS library permission removed.** `PHPickerViewController` needs none.
7. **`quote/[id].tsx` displayed a null line item as "$0 · INCLUDED".** An
   affirmative false claim about vendor pricing, on the one screen whose whole
   job is trust. Now renders "—" / "NOT QUOTED".
8. **`packing.tsx` froze the plan forever.** A persisted plan never rebuilt
   after an inventory edit, so removed items rendered as silent gaps.
9. Unhandled `openBrowserAsync` rejections in `prices.tsx` and `quote/[id].tsx`.
10. Safe-area insets on all four opaque footers.
11. `truck.tsx` `previewing` derived from the recommendation instead of seeded
    once.

## Spec §6 open questions — resolved

1. Packing buffer locked at **20%**, clamped 15–30%. A per-move field, so making
   it user-configurable later is a UI change only.
2. Deep links: **U-Haul + Penske** in v1. All five vendors appear in the list and
   all have search URLs, so the empty state is never a dead end.
3. Manual items **skip confidence entirely** — `confidence: null`, enforced by
   the type rather than by convention.

## Decisions worth not re-litigating

- **Best Match ranking** is price plus a dollar-priced wait penalty
  (`DAILY_WAIT_PENALTY_USD = 12`), not a normalised two-axis score. The first
  implementation used min-max normalisation; a test caught that it made a $15
  price gap weigh the same as a three-week wait.
- **The §4.2 quote invariant is enforced at runtime**, not just tested.
- **Mock quote totals are derived from their line items**, never hand-written.
- **The Screen 2 CTA gate** is `canLeaveInventory(move)` passed to
  `Pressable.disabled`. Programmatic, per the spec's hard requirement.
- **`app/index.tsx` never dispatches `setMoveDate`.** No screen collects a move
  date yet, so quotes are priced for "today". If a date picker is added, it
  belongs on Screen 4 next to the ZIP field.

## What's next

1. **Run it on a device.** `npx expo start` + Expo Go on a physical iPhone needs
   nothing further; `npx expo run:ios` needs the Xcode first-launch steps above.
   First run also settles the splash `imageWidth` question on tablets.
2. **Start Apple Developer Program enrollment.** Blocked by nothing. An
   Organization account has weeks of lead time.
3. **Privacy policy** — required for submission; its retention terms should
   match what `/v1/detect` actually does, which is retain nothing.
4. Wire real brightness/sharpness signals into `app/capture.tsx`.
5. Component/integration tests (jest + React Native Testing Library) for the
   screens. Only the domain layer is covered today, and adding them ends the
   zero-dependency `npm test` property — decide that deliberately.
6. See `APP_STORE.md` for the §5 release checklist.
7. Draft the App Store metadata package (screenshots, description, keywords)
   after the app renders.
8. Review accessibility labels and VoiceOver readiness.
9. Vendor affiliate applications (U-Haul, Penske) — long lead time, and they
   want a live domain first. See `docs/leadership-standup.md`.
