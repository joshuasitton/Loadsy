# Loadsy

**Right size truck. Right price. Right plan.**

React Native + Expo implementation of the Loadsy MVP Technical Spec.

---

## Getting it running

```bash
npm install
npx expo start --web
```

That opens the app in a browser on <http://localhost:8081>. Every screen and all of
the domain logic work there — it is the fastest way to see the whole flow.

For the iOS simulator, press `i` instead. That needs the **full Xcode**, not just the
Command Line Tools; `xcode-select -p` must point at `/Applications/Xcode.app`.

Node 24 or 26 both work.

### If Metro fails to start

A missing `babel-preset-expo` shows up as an unhelpful Metro error
(`Cannot read properties of undefined (reading 'transformFile')`). The real cause is
printed higher in the dev-server output. Fix:

```bash
npx expo install babel-preset-expo
```

If `npm install` complains about SDK version mismatches, let Expo resolve them itself:

```bash
npx expo install --fix
```

The app runs on mocked API responses in development out of the box — no backend
needed. `EXPO_PUBLIC_USE_MOCKS` overrides that in either direction; unset, the
answer is "mocks in development, live everywhere else".

### The hosted demo

Live at **<https://loadsy.expo.app>**, deployed with:

```bash
npm run demo:deploy
```

That exports with `EXPO_PUBLIC_DEMO_MODE=true` and promotes it to the production
alias, so the URL is stable and can be handed to someone in a meeting. To run the
same build locally instead:

```bash
npm run demo
```

Demo mode adds one control to the dashboard and changes nothing else. It is off
unless `EXPO_PUBLIC_DEMO_MODE` is exactly `"true"`, so a store build cannot carry
it by accident.

Behind it are four prepared inventories in `src/demo/scenarios.ts` — studio,
1-bedroom, 2-bedroom, 3-bedroom house — which between them recommend four
different trucks. They are ordinary app state loaded through the same action
hydration uses, so sizing, prices, load steps and zone diagrams are all computed
from them exactly as they would be from photographs; nothing downstream is
stubbed. `__tests__/demoScenarios.test.ts` asserts the truck each one lands on, so
a change to capacities or the safety reserve fails the suite rather than quietly
reshuffling what the demo shows.

A live capture is the better demo when it works. This exists because it depends on
a camera, a network, a model call and a room worth photographing, and in a meeting
one of those is usually missing.

**The sign-in is not real.** Demo mode puts a login screen in front of the app —
`demo@loadsy.app` / `moveday`, pre-filled, overridable with
`EXPO_PUBLIC_DEMO_EMAIL` and `EXPO_PUBLIC_DEMO_PASSWORD`. Those credentials are
compiled into the bundle every visitor downloads, so they protect nothing and the
screen says so. Read `src/auth/demoCredentials.ts` before putting anything behind
it. The gate exists so a demo link opens where a product opens, and so a URL
passed around a room does not drop the next person into the last person's
half-finished move; it is off entirely when `EXPO_PUBLIC_DEMO_MODE` is not `"true"`,
because a bundled password in a shipped build is theatre.

"Continue with Google" is a placeholder that completes locally and never contacts
Google — real OAuth needs a Google Cloud client ID per platform, redirect URIs
registered against each, and `expo-auth-session` to carry the exchange. Swapping it
in is a change to one function.

Testers get the loop closed: the login screen resets the demo and starts a
walkthrough with any scenario in one tap, and the demo bar on the dashboard signs
back out.

### The backend

One endpoint, `app/v1/detect+api.ts`, deployed with the app itself.

It exists for exactly one reason: the vision model's API key must never reach the
device. Everything else Loadsy computes runs on the client because it can —
volumes, truck sizing, prices and the packing plan are all pure functions of the
inventory. A key is the only thing that cannot ship, so it is the whole backend.

```bash
npx eas-cli@latest deploy
```

Set the key as an EAS environment secret — **never** as an `EXPO_PUBLIC_` variable,
which is bundled into the app in plaintext:

```bash
npx eas-cli@latest env:create --name VISION_API_KEY --scope project --visibility secret
```

Then point the app at the deployment and turn the mocks off:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_API_BASE_URL --value https://loadsy.expo.app
```

Web builds do not need that: `/v1/detect` is served by this same app, so an unset
base URL resolves same-origin. Native has no origin to be relative to and must be
told, which is why the `production` profile in `eas.json` sets it explicitly. A
native build that omits it fails with a message naming the variable rather than a
bare "Network request failed".

`EXPO_PUBLIC_USE_MOCKS` is set to `true` on the `development` and `preview`
profiles and deliberately absent from `production`, which therefore runs live. The
default is not "mock" — a release build that simply forgot the variable used to
ship the fixture furniture catalogue to real users and size a truck around
somebody else's sofa.

**Privacy.** The route is a strict pass-through: the image is forwarded, the result
returned, and neither is written to disk or into a log. That is what keeps the
"Data Not Collected" answer in `APP_STORE.md` true. If retention is ever added, the
privacy label has to change with it.

### Building for a device without Xcode

This machine has only the Command Line Tools, so `expo run:ios` and the simulator
are unavailable. EAS Build compiles on Apple hardware in the cloud instead, which is
what makes TestFlight, screenshots and submission reachable from here.

`eas.json` is committed and ready. Three one-time steps, all needing your account:

```bash
npx eas-cli login
```

```bash
npx eas-cli init
```

`init` writes `extra.eas.projectId` into `app.json` — commit that. Then:

```bash
npx eas-cli build --platform ios --profile preview
```

The first build asks whether EAS should manage your signing credentials; saying yes
means you never touch a provisioning profile. It needs an active Apple Developer
Program membership.

**The three profiles:**

| Profile | What it is | Use it for |
|---|---|---|
| `development` | Dev client, simulator build | Running against a local Metro server |
| `preview` | Release build, internal distribution | TestFlight, real-device testing, screenshots |
| `production` | Release build, store credentials | App Store submission |

`production` sets `autoIncrement`, and `cli.appVersionSource` is `remote`, so EAS owns
the build number — the `buildNumber` in `app.json` is no longer the source of truth.
Bump `version` there for a marketing version change; leave the build number alone.

All three profiles pin `EXPO_PUBLIC_USE_MOCKS=true`, because no backend exists yet.
**Remove it from `production` the moment `/v1/detect` is real** — otherwise you would
ship a build that quietly serves the mock catalogue.

To submit once a production build finishes:

```bash
npx eas-cli submit --platform ios --profile production
```

---

## What's built

All seven screens from spec §3, plus the price breakdown modal from §3.1:

| Route | Spec | What it does |
|---|---|---|
| `app/index.tsx` | Screen 7 | My Move dashboard, 5-step tracker bound to `MoveStatus` |
| `app/capture.tsx` | Screen 1 | Camera + gallery capture, tips card, photo quality gate |
| `app/inventory.tsx` | Screen 2 | Grouped inventory, confidence gate, manual add item/room |
| `app/truck.tsx` | Screen 3 | Recommendation with the raw → buffered → capacity breakdown |
| `app/prices.tsx` | Screen 4 | Quote list, client-side filters, in-app browser deep links |
| `app/quote/[id].tsx` | Screen 3.1 | Per-line price breakdown, amber/green estimate distinction |
| `app/packing.tsx` | Screen 5 | Load Plan / By Room tabs, weight-class aware |
| `app/layout-view.tsx` | Screen 6 | Top / 3D truck diagram, save and share |

### Architecture

```
src/domain/      Pure TypeScript. No React, no React Native, no I/O.
                 All the spec's rules live here and are fully unit tested.
src/api/         The three §4 agent contracts, each with a deterministic mock.
src/state/       Move reducer + AsyncStorage persistence.
src/ui/          Theme tokens and shared components.
src/truckmap/    Client-side SVG schematic renderer.
app/             expo-router file-based routes.
```

The domain layer is deliberately free of framework imports. That is what lets
`npm test` run the entire rule set through Node's built-in test runner with zero
dependencies installed, and it means the Vision, Rental Data and Packing Logic
agents can be swapped in behind `src/api/` without touching a screen.

---

## Tests

```bash
npm test        # 56 tests, no dependencies required
```

Both contract invariants the spec asks QA to assert are covered:

- **§4.2** — every `RentalQuote.estimatedTotal` reconciles with its own line items.
  Asserted on hand-built quotes, on a deliberately tampered quote (so the check is
  proven to actually check), and on every quote the mock layer ships. `fetchQuotes`
  also enforces it at runtime and drops any quote that fails rather than displaying
  a total that would lie to the user.
- **§4.3** — load step assignment is deterministic. Asserted against reversed input,
  shuffled input, and a JSON round-trip (the "Save Plan" path).

Plus the two hard requirements called out in §3:

- The Screen 2 primary CTA is bound to `canLeaveInventory(move)` and passed to
  `Pressable.disabled` — it is programmatically inert while any AI-detected item is
  still unresolved, not merely styled as disabled.
- A photo that yields zero detections produces a titled, actionable rejection with a
  path to manual entry. It can never silently produce an empty inventory.

---

## Open questions from spec §6 — resolved

1. **Packing buffer** — locked at **20%**, clamped to the 15–30% band.
   `DEFAULT_PACKING_BUFFER_PCT` in `src/domain/volume.ts`. The `Move` model carries
   it per-move, so making it user-configurable later is a UI change, not a data change.
2. **Deep-link vendors** — **U-Haul and Penske** in v1 (`V1_DEEP_LINK_VENDORS` in
   `src/domain/quotes.ts`). All five vendors still appear in the quote list and all
   have search URLs, so the empty state is never a dead end.
3. **Manual items and confidence** — manual entries carry `confidence: null` and are
   structurally incapable of being unresolved. Enforced by the type, not by a convention.

---

## Deviations from the spec worth knowing about

- **Stack.** The spec is written as native iOS (Swift structs, `SFSafariViewController`).
  This is React Native + Expo per the build decision. `expo-web-browser` *is*
  `SFSafariViewController` on iOS, so the §3 Screen 4 requirement is met exactly.
  Swift computed properties (`totalCubicFeet`, `adjustedVolumeCuFt`, `capacityCuFt`)
  became pure functions so the models stay JSON-serialisable across the API boundary.
- **`Decimal` → `number`.** JavaScript has no `Decimal`. All money is handled in
  dollars rounded to cents at every boundary, and the §4.2 reconciliation check uses a
  one-cent tolerance. If Loadsy ever processes payments this needs revisiting — but
  payment processing is explicitly out of scope for MVP (§1).
- **`Date` → ISO strings.** Same reason: serialisation across the API boundary.
- **Best Match ranking** is price plus a dollar-priced wait penalty
  (`DAILY_WAIT_PENALTY_USD`), not a normalised two-axis score. Normalising erases
  magnitude, which would make a $15 price gap and a three-week wait weigh the same.
- **Photo quality signals.** `assessPhoto` checks image dimensions client-side and
  detection count after the fact. Brightness and sharpness thresholds are implemented
  and tested but currently fed `1` — the Vision agent is the right place to measure
  them. Wire them up in `app/capture.tsx` when `/v1/detect` returns them.

---

## Before App Store submission

See `APP_STORE.md` for the full §5 checklist and what still needs doing.

The one blocker to be aware of now: **`assets/icon.png` and `assets/splash.png` are
placeholders I generated.** They are correctly sized and will build, but they need a
designer before submission.
