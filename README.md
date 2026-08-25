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

The app runs entirely on mocked API responses out of the box — no backend needed.

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
