# App Store Connect – Loadsy 1.0

Everything the version page at App Store Connect asks for, in the order it asks, ready to
paste. Written 22 September 2026 against build 4 (1.0.0, commit 5918fa9). Anything that
still needs the Chairman's decision is marked **DECIDE**.

Two rules the copy follows, both from `APP_STORE.md`: **no prices are promised** – v1 has
no price service – and **no competitor names anywhere**, which Apple rejects in keywords
and looks for in copy.

---

## Screenshots

Apple currently requires one iPhone set, at 6.9" (1320 × 2868 px, portrait). Smaller
sizes are scaled from it unless uploaded separately. Six shots are in
`store/screenshots-1.0/` (not versioned – regenerated from the simulator), taken on 22
September from the app on an iPhone 17 Pro Max simulator through Expo Go, with the
2-bedroom inventory loaded and the store build's chrome: no demo bar, no tier line, no
sign-out. Upload in this order; the first two are what shows in search results:

1. `01-inventory.png` – the inventory, 41 items, "looks good"
2. `02-truck.png` – the recommendation and its breakdown
3. `03-rent.png` – where to rent
4. `04-packing.png` – the load order
5. `05-layout.png` – the solved truck, drawn from the side
6. `00-welcome.png` – the welcome screen; optional, last if used

The inventory shot shows a clean list rather than the confidence check `APP_STORE.md`
asked for, because the prepared 2-bedroom move has nothing left to check. A shot with
the check visible needs a real capture, which comes with the phone test (E7).

No app preview video. Not required, and a bad one is worse than none.

---

## Version information

**Promotional text** (170 max; can be changed without a new build)

> Photograph each room. Loadsy lists what's there, sizes the truck your apartment needs, and shows where to rent it.

**Description** (4,000 max)

> Moving out of an apartment and not sure what size truck to rent? Photograph each room and Loadsy works it out.
>
> WHAT IT DOES
> • Lists the furniture in your photos, with a size for each piece
> • Adds it up and recommends the smallest truck that fits, with a 15% reserve so a tight load doesn't become two trips
> • Offers a pickup or a trailer beside the truck when your things would fit one
> • Shows where to rent that size – each company's own site, or the nearest branch on your map
> • Gives you the order to load it in, front to back and bottom to top, and draws the finished load
>
> HOW IT WORKS
> Take a wide photo of each room from the doorway, and one more from another corner. Loadsy identifies each piece and estimates its size. Every size can be corrected, and anything it wasn't sure about is marked for a quick check before the truck is sized. Add anything by hand – closets, boxes, the things in storage.
>
> WHAT IT DOESN'T DO
> Loadsy doesn't show rental prices; each company's site gives its own for your dates. It isn't paid by any rental company to list them. It doesn't need an account, and it doesn't keep your photos: they're read to identify furniture, then discarded.
>
> Built for studio, one- and two-bedroom moves. A house works too – it's just more rooms.

**Keywords** (100 max, comma-separated, no spaces after commas)

`moving,truck,rental,move,boxes,inventory,packing,van,studio,estimate,relocation,cubic`

That is 85 characters. "Apartment" is left out on purpose: it is in the subtitle, which
Apple already indexes, so repeating it wastes nine characters.

**Support URL:** `https://loadsy.expo.app/support`
**Marketing URL:** leave blank. There is no marketing site; the app's own page is the support page.

**Version:** `1.0.0`
**Copyright:** **DECIDE** – `2026 Joshua Sitton` if the developer account is enrolled as an individual, or the company name if it is an organisation. Apple shows this on the listing.

---

## App Review Information

**Sign-in required:** No. There is no account.

**Contact information:** your first name, last name, phone number and email. Apple uses
these only to reach you about the review. Not the support address – that one,
loadsysupport@gmail.com, is for users, and is on the support and privacy pages.

**Notes** (paste as-is – about 2,850 of Apple's 4,000 characters)

Rewritten 29 September, after App Review answered the first submission (build 10) with
*Guideline 2.1 – Information Needed*. That is not a rejection of the app. Apple asks it of
any developer account with little review history, and it wants six things, both as a reply
in App Store Connect and in this field so later reviewers have them. The notes are therefore
numbered to Apple's questions: a recording, the purpose and audience, how to get in, the
external services, regional differences, and regulation. The earlier notes answered only the
third. When the app changes, keep the numbering and change the answer – a reviewer compares
them against the questions, not against the previous version.

> 1. Screen recording: attached, recorded on an iPhone running the latest iOS with version 1.0.0 (build 10) installed from TestFlight. It starts at launch and follows the typical flow: welcome, photographing a room, detection, correcting the inventory, the truck recommendation (with the pickup, trailer and "Your own vehicle" options), Where to Rent, and the loading order. Loadsy has no account registration, login or account deletion (there are no accounts), no user-generated content, and no paid content or in-app purchases.
>
> 2. Purpose and audience: Loadsy helps people who are moving themselves, mostly renters leaving a studio, one- or two-bedroom apartment in the US, rent the right size of truck. Most people guess, and a truck that is too small means a second trip or furniture left behind. The user photographs each room; Loadsy lists the furniture with an estimated size for each piece, which they can correct, adds up the volume and recommends the smallest truck that fits with a safety margin. It also says whether a pickup, a trailer or the person's own vehicle would do, links to rental companies' websites, and gives an order to load the truck in.
>
> 3. Setup and access: No account, login or sample files are needed. Open the app, tap "Get started", then "Take photos". Photograph any furnished room (a wide shot from the doorway, plus another from a corner) and tap "Measure these 2 photos"; detection takes 20–60 seconds. The inventory then lists what was found. If a furnished room is not available, "Add items by hand" works without any photos. Camera and photo library access are requested only when those buttons are tapped.
>
> 4. External services:
> - Anthropic's Claude API (a vision model) identifies furniture and estimates sizes from the photos. The app sends photos to Loadsy's own server route, which forwards them to Anthropic and returns the result; Loadsy does not store them.
> - Expo EAS Hosting runs that server route and one other – an optional, anonymous count of vehicles people say are not listed – and hosts the privacy policy and support pages at loadsy.expo.app.
> - Rental companies' public websites (U-Haul, Penske, Budget, Home Depot, Enterprise) open in an in-app browser. There is no API, data sharing or affiliate relationship with any of them.
> - Apple Maps opens with a search phrase when "near me" is tapped; the app does not request location.
> There are no authentication, payment, analytics or advertising services.
>
> 5. Regional differences: Loadsy is offered in the United States only, and works the same everywhere it is offered. The rental companies and vehicle dimensions it uses are American, and sizes are in feet and inches.
>
> 6. Loadsy does not operate in a regulated industry and includes no protected third-party material. Rental companies are named only to link to their public websites.

**Attachment:** the screen recording from answer 1 – on a physical iPhone running the
latest iOS, the TestFlight build, starting at launch. Record it again for any build whose
flow changes; a recording of a flow the build no longer has is the kind of mismatch a new
account is being checked for.


---

## Version release

**Manually release this version.** The review can pass on a Tuesday night and you want
to choose the morning it goes live, not have it appear while you are asleep.

---

## App Information (a separate page, left column)

**Name:** Loadsy
**Subtitle** (30 max): `Apartment moves, sized right`
**Primary category:** Utilities
**Secondary category:** Lifestyle
**Content rights:** does not contain, show or access third-party content. (Rental company
sites open in a browser; that is a link, not content the app carries.)

**Age rating:** answer None to every question. Result: 4+.

**Privacy policy URL:** `https://loadsy.expo.app/privacy`

---

## Pricing and Availability

**Price:** Free.
**Availability:** **DECIDE** – the recommendation is the United States only for 1.0. The
rental companies and the pickup and trailer dimensions are all US, and a Canadian or
British reviewer would see a Where to Rent screen that sends them nowhere useful.
Territories can be added without a new build.

---

## App Privacy (the nutrition label)

> **Changed 23 September.** The optional "Mine isn't listed" count is kept, so the answer is
> no longer "Data Not Collected" throughout. Declare **Usage Data → Product Interaction**,
> used for **Analytics**, **not linked** to the user, **not used for tracking** – see
> `APP_STORE.md`. The reasoning below still decides the photos question.

The intended answer was **Data Not Collected**, and Apple's definition is what makes it
true or not. Apple counts data as "collected" when it is transmitted off the device and
kept longer than needed to service the request. Two things leave the phone:

- **Photos**, forwarded through Loadsy's route to Anthropic's vision model and not kept by
  Loadsy. Whether Anthropic's retention counts as collection is **DECIDE 6** in the sprint
  plan: confirm the retention terms for the workspace the key lives in. If Anthropic holds
  inputs only for a limited safety-monitoring window and does not use them for training –
  what its commercial terms say and what the privacy page currently states – "Data Not
  Collected" holds. If the terms say otherwise, the answer becomes *Photos or Videos* →
  *App Functionality* → *not linked to identity* → *not used for tracking*, and the privacy
  page changes with it.
- **The client's IP address**, counted in memory for fifteen minutes to rate-limit the
  route, never written. That is servicing the request, not collection.

Nothing else leaves the phone. No analytics SDK, no crash reporting, no account, no location.

---

## Export compliance

Already answered in the build: `ITSAppUsesNonExemptEncryption` is `false` in `app.json`,
so App Store Connect should not ask. If it does, the answer is that the app uses only the
standard HTTPS provided by the operating system, which is exempt.

---

## Before pressing Submit for Review

- [ ] The build attached to the version is the latest production build – the one checked
      on TestFlight on 25 September – not an earlier one.
- [ ] Both URLs open in a private browser window.
- [x] The support address is decided: loadsysupport@gmail.com (25 September).
- [ ] Copyright and availability are decided.
- [x] The tagline question: decided 25 September – "Right price." is gone. The tagline is
      now "Take pics. Know it fits.", defined once in `src/domain/site.ts`.
- [ ] The nutrition label matches decision 6.
