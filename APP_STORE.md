# Loadsy — App Store Release Checklist

Tracks spec §5. Status as of the initial build.

---

## Done in code

**Privacy nutrition label — camera and photo library, justified in-app before the prompt**

`app.json` carries both `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription`,
written in plain language about what the photo is used for. `app/capture.tsx` shows a
privacy card explaining the use *before* `requestCameraPermissionsAsync` is ever called,
and if permission is denied the alert explains the purpose again rather than just
complaining. `ITSAppUsesNonExemptEncryption: false` is set, which saves a compliance
round-trip at upload.

Still to do in App Store Connect: fill in the nutrition label itself. Loadsy collects
no data — photos are processed and discarded, ZIP stays on device — so the answers are
"Data Not Collected" throughout. Confirm that is still true if the Vision agent starts
retaining images server-side.

**"Estimated" language on every price surface**

Not just the breakdown sheet. Every price renders through the `EstimateTag` component,
the Screen 4 header states it outright, each quote card carries an `EST.` tag, and the
breakdown sheet distinguishes amber (Loadsy estimate) from green (vendor-stated) per
line item, with a legend. No copy anywhere promises a guaranteed or final price.

**Affiliate / deep-link disclosure**

Appears twice: once at the foot of the Screen 4 quote list, and again directly above
the "Continue on <vendor>" button in the breakdown sheet — i.e. near the View Deal
action, as the spec preferred. Copy states we do not add fees and that commission never
changes the price or the ranking. The app description still needs the same disclosure.

**Accessibility — VoiceOver labels on all icon-only buttons**

Every icon-only control has an explicit `accessibilityLabel`: the close ✕ on both
modals, the remove ✕ on item cards, the edit affordances. Truck size chips announce
capacity, room equivalence, and whether they are the recommendation. The truck diagram
SVG carries `role="img"` and a generated `aria-label` describing the load zones. The
dashboard progress bar exposes `accessibilityRole="progressbar"` with min/max/now. The
Screen 2 CTA exposes `accessibilityState.disabled` plus a hint explaining *why* it is
disabled.

Still to do: an actual VoiceOver pass on device. Labels being present is necessary, not
sufficient — someone needs to swipe through every screen with the screen curtain on.

---

## Outstanding

**Icon and splash screen**
`assets/icon.png`, `assets/adaptive-icon.png` and `assets/splash.png` are generated
placeholders. Correctly sized (1024×1024 icon, no alpha, no pre-rounded corners) so they
will build and upload, but they need real design work before submission.

**Screenshots from Screens 2–5**
The spec calls these the strongest visual sell: inventory, recommendation, prices,
packing plan. Generate at 6.7" and 6.1". Populate with a realistic 2BR inventory rather
than the mock catalogue — and make sure the confidence banner is visible in the
inventory shot, since the correction workflow is the differentiator.

**TestFlight internal build, tested against the Josh persona**
Busy professional, wants simple/accurate/affordable, no guesswork. The specific thing to
watch in testing: does the confidence gate feel like help or like an obstacle? It is a
hard requirement and it blocks the primary CTA, so if it reads as friction the copy
needs work, not the gate.

**App name / bundle ID clearance**
Bundle ID is `com.loadsy.app`. Recheck "Loadsy" availability in App Store Connect *at
submission time* — name availability is not reserved by checking early.

**Export compliance and the affiliate disclosure in the store description**
Both are App Store Connect fields, not code.

---

## Scope guard

These are explicitly out of MVP scope (§1) and nothing in the build reaches toward them.
If a reviewer or stakeholder asks why they are missing, that is the answer:

- Real-time rental pricing or availability APIs, and in-app booking
- True 3D bin-packing optimisation
- Video-based capture
- Multi-user or shared move accounts
- Payment processing of any kind

The Reservations and Moving Day rows on the dashboard are deliberately inert stubs
marked "SOON" — no booking logic sits behind them.
