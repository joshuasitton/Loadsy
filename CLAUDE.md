# Loadsy — orientation for Claude Code

Loadsy sizes a moving truck from photographs of your rooms, compares local
rental prices, and prints a load plan you can follow piece by piece. React
Native + Expo (SDK 57), TypeScript, expo-router. The target is an Apple App
Store release; this repository is the whole product, client and server.

**`README.md` is the real document.** It is long on purpose — it argues why
every non-obvious decision is what it is, and most of those decisions were made
because the obvious alternative produced a bug. Read the section covering
whatever you are about to touch before you touch it. This file is the short
orientation; it does not repeat the README.

## Commands

```bash
npm test              # domain tests — Node's built-in runner, no framework
npm run typecheck     # tsc --noEmit
npm run lint          # expo lint
npx expo start --web  # fastest way to see the whole flow
npm run demo          # demo mode + mocks, on web
npm run demo:deploy   # export the demo and deploy it to https://loadsy--demo.expo.app
npm run deploy:prod   # export the real app and deploy it to https://loadsy.expo.app
npm run brand:icons   # regenerate the four PNG marks and verify them
npm run eval:detect   # run the detection eval over eval-photos/
```

## Where things are

| Path | What lives there |
|---|---|
| `app/` | expo-router screens, one file per screen |
| `app/v1/detect+api.ts` | the backend proper — a pass-through to the vision model, deployed with the app |
| `app/v1/vehicle-request+api.ts` | counts "Mine isn't listed" into the log; the only thing the server keeps |
| `src/domain/` | pure functions: volume, truck sizing, quotes, packing, flow, tier, trip, own-vehicle fit |
| `src/truckmap/` | the bin-packing solver and its SVG projection |
| `src/state/` | move and history stores, AsyncStorage persistence |
| `src/billing/`, `src/auth/`, `src/demo/` | tier gating, the demo sign-in, prepared demo inventories |
| `src/ui/` | shared components, theme, and `markGeometry.ts` |
| `__tests__/` | the test suite – the domain layer, persistence, both API routes and the contrast pairs |
| `APP_STORE.md` | release checklist — what is done in code, what is outstanding |
| `docs/` | project-level state and the leadership standup log |

## Invariants — do not break these silently

- **`npm test` runs with zero dependencies installed.** Nothing under
  `src/domain/` may import React, Expo or React Native. This is what made the
  build verifiable in sandboxes with no npm access, and it is worth keeping.
- **One source of truth per concept, pinned by a test.** `markGeometry.ts` is
  the mark, `domain/flow.ts` is the step order, `domain/tier.ts` is the free /
  premium line, `domain/packing.ts` owns both a piece's placement *and* the
  sentence describing it. Several bugs in this repo's history were the same bug:
  a value defined in two places that drifted apart.
- **`honour()` in `src/billing/tier.ts`** decides what tier a build will accept
  from storage. Everything resolving a tier goes through it. `PREMIUM_FOR_SALE`
  defaults off in every environment, development included.
- **v1 shows no prices and asks for no location** (decided 15 September). There is no
  price service; the trip, quote and geocoding code in `src/` is unused until one exists.
  If it returns, `fetchQuotes` must still drop any quote whose total does not reconcile
  with its line items (spec §4.2), and the location permission and privacy label return
  with it.
- **`/v1/detect` is a strict pass-through.** The image is forwarded, the result
  returned, and neither is written to disk or into a log. Adding retention changes the
  App Store privacy label.
- **`/v1/vehicle-request` is the only thing the server keeps:** one log line of a body
  type, model year, make and model, all from fixed lists (decided 23 September).
  `APP_STORE.md` declares it as Product Interaction, not linked to the user. A new field
  changes the label.
- **Never put a secret in an `EXPO_PUBLIC_` variable** — they are bundled into
  the app in plaintext. The vision key is an EAS project secret.
- `EXPO_PUBLIC_USE_MOCKS` and `EXPO_PUBLIC_DEMO_MODE` default on in development
  and off in a release, with an explicit value winning either way.

## Environment

Claude Code runs in more than one place, and what it can do depends on which.

**On Josh's Mac** it can do everything: compile, run the simulator, deploy, set up EAS and
Apple credentials, and read manufacturer websites. Signing and Apple's two-factor
sign-in only work here, and so does deploying unless the cloud environment has been given
an `EXPO_TOKEN`.

**In a Claude Code cloud session** (claude.ai/code), as of 23 September, the container
reaches the npm registry and GitHub. It installs dependencies, runs `npm test`,
`typecheck` and `lint`, drives the web build headlessly with Playwright, commits, pushes
and opens pull requests. It cannot deploy or run EAS builds – it is not logged in to Expo
unless an `EXPO_TOKEN` is added to the environment – cannot sign in to Apple, and is
refused by automakers' websites, so vehicle research happens on the Mac. It is Linux, with
no Xcode. Its Metro dev server does not see file changes: restart it after an edit before
trusting what the browser shows.

**The Cowork device VM**, when last checked, was cut off from npm and github.com. There,
Claude reads, reasons and edits; Josh executes and brings the output back.

For the simulator, `xcode-select -p` must point at `/Applications/Xcode.app`.
Xcode was installed 2026-08-25 but its first-launch configuration may still be
outstanding — see `docs/build-state.md`. `npx expo start` with Expo Go on a
physical iPhone needs none of it, and EAS Build compiles on Apple hardware in
the cloud, which is what makes TestFlight reachable without a local toolchain.

## Conventions

- **Commit subjects are a sentence** saying what changed and why it matters —
  "Hold the error paths, and stop the app lying about what it saved". No
  `feat:` / `fix:` prefixes.
- **Branches are `area/what`**: `hardening/audit-fixes`,
  `brand/reserve-mark`. `main` is the default branch.
- **Documentation here argues; it does not list.** When you add to the README or
  to `docs/`, explain the reasoning and name the failure the decision prevents.
  A bare changelog entry is less useful than the sentence that stops the next
  person reintroducing the bug.
- Prose in this repo uses en dashes and real punctuation. Match it.

## How the project is run

Josh is Chairman of the Board and the sole human authority. Loadsy is run as an
AI-operated company with a standing leadership team — product, design,
engineering, marketing, sales, vendor relations, security, management — whose
round-tables are logged in `docs/leadership-standup.md`. Anything marked
"decision needed" there waits on Josh; nothing in that file is a commitment
until he makes it one.
