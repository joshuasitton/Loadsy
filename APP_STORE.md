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
no data — photos are processed and discarded — so the answers are
"Data Not Collected" throughout. Confirm that is still true if the Vision agent starts
retaining images server-side.

**Privacy policy URL and support URL – built 21 September**

Both are routes in the app, so the web page and the in-app screen are one file and
cannot disagree: <https://loadsy.expo.app/privacy> (`app/privacy.tsx`) and
<https://loadsy.expo.app/support> (`app/support.tsx`), linked from the foot of the
dashboard as Apple asks. `src/domain/site.ts` holds the URLs; a test pins the host to the
production API host in `eas.json`. The privacy page is written as claims about the code
– the pass-through, the address counting in the rate limit, what stays on the phone – so
when the code changes the page changes and its date moves. Two things still wait on the
Chairman: the support address (`EXPO_PUBLIC_SUPPORT_EMAIL`; until it is set both pages say
one is coming), and decision 6, confirming Anthropic's retention terms, which the page
currently describes as a limited safety-monitoring hold with no training use.

**No location permission, no addresses, no prices – removed 15 September**

v1 has no price service, so prices came out, and with them the trip step and the
location permission, which existed only to price the truck. The build asks for camera
and photo library access and nothing else, and holds no address. The trip, quote and
geocoding code remains in `src/` for a later version; if it comes back, the location
purpose string, the address note in `src/domain/address.ts` and the privacy label all
come back into question.

**Rental companies – plain links, nothing paid**

The Where to Rent screen lists five companies with a link to each one's own site. The
links carry no affiliate code and the screen says Loadsy isn't paid to list them. If
affiliate links are added, that sentence and the store description both need a
disclosure.

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

## Who the listing is for – apartment moves

**Decided 15 September:** v1 is aimed at apartment moves, studio to two bedrooms, with the
same code. A house still works; the listing just leads with apartments. Every weakness the
detection eval found – the wait per room, furniture counted in two rooms, the cost of a
wrong truck – grows with the size of the move.

Draft copy for E11. v1 shows no prices (decided 15 September), so no copy may promise them.

- **Subtitle:** *Apartment moves, sized right*
- **Promotional text:** Photograph each room. Loadsy lists what's there, sizes the truck
  your apartment needs, and shows where to rent it.
- **Keywords** (no competitor names – Apple rejects them):
  `apartment,moving,truck,rental,move,boxes,inventory,packing,van,studio,estimate,relocation`
- **Screenshots:** the 2-bedroom demo.

## Outstanding

**Icon and splash screen — done**
The mark is the cargo bed seen end-on, packed with four pieces and no gap between them – three
white, and the last piece in drawn dark – on Loadsy's green. It is the view the load diagram
uses. The dark piece is 3.03:1 against the ground, just over the 3:1 floor for graphics, and the
verifier pins that ratio.

All four assets are generated from one geometry in `src/ui/markGeometry.ts` by
`npm run brand:icons`, which also verifies what it wrote. The app's own `<Mark />` reads
the same numbers, so the home-screen icon and the sign-in logo cannot drift apart.

Per-platform decisions worth not undoing:

- `icon.png` is 1024×1024, opaque to the edge, with no pre-rounded corners — iOS applies
  its own mask, and a rounded corner in the artwork gets rounded twice.
- `adaptive-icon.png` carries the mark alone on transparency; the ground is
  `android.adaptiveIcon.backgroundColor`. The mark's *diagonal* fits the 264px circle
  Android guarantees, which puts it at ~43% of the canvas against ~70% on iOS. That gap
  is deliberate: a launcher may mask to a circle, and a square inscribed in a circle is
  smaller than one inscribed in a square by a factor of √2.
- `splash.png` is rounded, unlike the iOS master, because nothing masks a splash — it has
  to bring its own tile shape or it reads as a green rectangle instead of as the icon.

**Screenshots from Screens 2–5**
The spec calls these the strongest visual sell: inventory, recommendation, where to
rent, packing plan. Generate at 6.7" and 6.1". Populate with a realistic 2BR inventory rather
than the mock catalogue – the audience is apartment moves, decided 15 September — and make sure the confidence banner is visible in the
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
- Video-based capture
- Multi-user or shared move accounts
- Payment processing of any kind

3D bin-packing was on this list and came off it: `src/truckmap/layout.ts` solves the
load in three dimensions and the Truck Layout screen draws it. It is the one item
here that the build overtook.

The Reservations and Moving Day rows on the dashboard are deliberately inert stubs
marked "SOON" — no booking logic sits behind them.

**There are no in-app purchases, and the answer to that App Store Connect question is
"none".** The app has a Free and a Premium tier, and Premium is not shipping with this
release: the wall at `src/ui/PremiumWall.tsx` describes what Premium will add, states in
so many words that it is not for sale yet, and offers a "tell me when it ships" button
that writes a boolean to this device and sends nothing anywhere. No product identifiers,
no StoreKit, no receipts, no server. If a reviewer reads the wall as a purchase surface
outside IAP, the answer is that it takes no money and no contact details by any route —
which is why there is deliberately no "Buy" button in any branch of it, including the
one behind the `EXPO_PUBLIC_PREMIUM_FOR_SALE` flag. Turning that flag on before billing
exists would make the screen say so out loud.
