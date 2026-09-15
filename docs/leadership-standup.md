# Loadsy — Leadership Standup Log

Running log of leadership round-tables. Newest first. Josh is Chairman of the
Board and sole human authority; every "decision needed" below waits on him.

Imported from the claude.ai "Loadsy App" project on 2026-09-11. Entries are kept
as they were written — a standup is a record of what the team believed on a
date, and editing it after the fact destroys the only thing it is for. Where an
entry has since been overtaken, `docs/build-state.md` says so at the top.

---

## 2026-09-15 — Detection measured on real rooms; Chairman decisions on positioning and double counts

### What the eval found

The first real rooms went through the eval today: a family room tape-measured item by
item, then asked 50 times. Three findings changed the plan.

- **Thinking left on returned nothing.** Opus 5 thinks unless told not to, and the first
  live request spent its whole 4,000-token budget and 60 seconds doing so. Thinking is now
  off by default with an 8,000-token budget. Answers still take 25–38 seconds against the
  route's 11-second limit – every one of 50. That limit is the launch blocker; the decision
  on how to wait (progress screen, streaming, or a faster model) is still open.
- **Sizing is close; the truck is not.** Median room error 9.6%, never under-sized – but
  the model runs about 13% large and this room sits 4% below the 10 ft / 15 ft line, so 44
  of 50 answers chose the larger truck. Asking several times and taking the median made
  answers steadier and the truck worse, because the bias is on the wrong side of the line.
- **The next room gets counted.** The breakfast room's chalkboard appeared in 49 of 50
  family-room answers, its console table in 35 and its 54 ft³ hutch in 11 – seen through
  an opening, despite an instruction not to count such things.

### Chairman decisions

1. **Double counts are caught by the move, not the photo (option B).** Rooms are still
   captured one at a time; once they are in, the same kind of object at about the same size
   in two rooms is put to the user – "Which room is it in?" – before the truck is sized.
   Only kinds a home usually has one of are checked, so beds, nightstands and boxes never
   ask. **Built and in PR #7.** Capturing a whole floor in one request was considered and
   not chosen: it would roughly triple the wait and put every room's accuracy on one
   request.
2. **v1 is aimed at apartment moves – studio to two bedrooms – with the same code.** Every
   weakness above grows with the size of the move: the wait, the double counts, and the
   cost of a wrong truck. The listing, screenshots and demo lead with apartments; a house
   still works. Draft copy is in `APP_STORE.md`.
3. **"Pile mode" – photograph one pile of things to move – is tested before it is built.**
   Two measured piles go through the eval; a product decision comes after launch, with the
   data. The risk to test is that a pile has fewer scale references and more hidden objects
   than a room.

### Parked for follow-up after launch: acting for the customer

The Chairman raised Loadsy acting as the customer's agent with rental companies, and
offering valet service – delivering the truck and returning it – both as paid upgrades.
Parked, not decided. What a follow-up has to answer first:

- **The renter is the driver.** Truck rental agreements are generally signed, and the vehicle
  collected, by the person driving it, with their own licence and cover. An agent can
  compare, reserve and manage a booking; it probably cannot rent on someone's behalf, and a
  valet driving a truck rented in the customer's name is likely an unauthorised driver
  unless the rental company agrees to it. Each company's terms need reading before this is
  a plan.
- **No booking APIs to lean on.** Real-time pricing and in-app booking are out of the MVP's
  scope precisely because the major rental companies don't offer them openly; acting as an
  agent means partnership agreements, or people doing it by hand.
- **Valet is an operations business.** Drivers, insurance, damage claims, scheduling and
  local coverage – margins and risks of a moving company, not an app.
- **The lighter version may be most of the value.** Loadsy's real asset is an accurate
  inventory: a precise description of the job. That is worth money to the people who already
  run trucks and crews – labour marketplaces and moving companies – as a referral, without
  Loadsy employing anyone. It belongs with the revenue decision below.

**Still needed from the Chairman:** how the app waits for an answer that takes 30 seconds;
the vision key as an EAS secret; the revenue posture, which the listing's affiliate
disclosure depends on; Anthropic's data-retention terms, now more pressing because the eval
photos include a child's face and name.

---

## 2026-09-14 — Sprint start, and Chairman decisions on sweep capture and the mark

### Sprint started: ready to submit by Friday 25 September

The Chairman opened a two-week sprint today, Monday 14 September to Friday
25 September, with the goal of being ready to submit to the App Store. The plan,
its definition of done and the day-by-day work are in `docs/sprint-2026-09-14.md`.

Checking the repository for the kickoff turned up three launch blockers not on any
earlier list: `VISION_API_KEY` is set in no EAS environment, so a production build
fails at detection; `/v1/detect` has no authentication or rate limiting, and its URL
ships inside the app; and every demo deploy replaces the production endpoint,
because both use `loadsy.expo.app` and `demo:deploy` deploys with `--prod`.

**Decisions needed from the Chairman this week,** in order of lead time:

1. ~~**Apple Developer Program:** enrolled? Individual or Organization?~~
   **Resolved 14 September: enrolled** (open since 09-08). EAS build history shows
   three successful internal iOS builds on 25–27 August, so signing and device
   registration work. All three used the `preview` profile – mocks and demo mode on –
   so real detection has still never run on a phone. Remaining: create the App Store
   Connect app record, which is what reserves the name.
2. **Create the vision key, with a workspace spend limit set first,** and store it as
   an EAS secret.
3. ~~**Select Xcode**~~ **Resolved 14 September:** Xcode 26.5 selected, first
   launch complete, five iPhone simulators available.
4. ~~**The uncommitted 360-capture work on `main`:** land it or park it.~~
   **Resolved 14 September: land it,** with the rest of the open branches. Items 1–3
   of `docs/360-capture-plan.md` – real brightness and sharpness measurement,
   `MAX_PHOTOS` in one place, and the tested `selectKeyframes` – ship in v1; the
   sweep screen itself stays v1.1.
5. **Revenue posture for v1** (open since 09-08) – recommended: no monetisation, and
   the Premium screen and "SOON" rows hidden from the release build.
6. **Anthropic's API data-retention terms,** which decide whether the privacy label can
   say "Data Not Collected".
7. **A physical iPhone** for testing from Wednesday.

---

Two decisions made on sweep capture and the mark, and one question opened.
Recorded here because nothing in this log is a commitment until the Chairman
makes it one; these now are.

### Decided

1. **The 360° sweep is v1.1, not v1.0.** v1 ships the existing tap-per-angle
   capture, with the brightness and sharpness checks from
   `docs/360-capture-plan.md` items 1–3 now actually measuring photos. The
   reasoning is in the Sweep Capture Decision memo: the sweep is the most
   device-dependent feature in the product, the app has never run on a
   physical phone, and the eval that would show whether a sweep improves the
   inventory has none of its 20 photos (the two files in `eval-photos/` are 22-byte
   placeholders, found 14 September). Building it first would put the least
   verifiable feature ahead of the first real launch.

2. **The app mark is "Solved, not stacked"** – the cargo bed seen end-on,
   packed with four pieces and no gap, the last piece drawn dark, on Loadsy's
   green. Chosen over an L monogram and over that L with a truck cut into its
   corner. It is the least literal of the three, so it is paired with the
   wordmark until the product is known. Shipped in PR #3.

3. **Ask for ceiling height, once, before the first photo:** "Are your ceilings
   the standard 8ft high?" If no, the person picks the height. The detection
   prompt measures furniture against visible references and assumes a 96 in
   ceiling; when the ceiling is the reference in frame and the real ceiling is
   9 ft, every dimension comes out about 11% short, which compounds to about 30%
   less volume – a truck too small, the dangerous direction. One question fixes
   that.

   Considered and set aside the same day: asking for full room dimensions (it
   demands the measuring the app promises to remove, and one known wall length
   does not fix scale at other distances from the camera), and estimating box
   counts for loose items (later – the camera cannot see inside cabinets,
   closets or drawers). A related question stays open and is being measured
   rather than guessed: whether loose contents the camera cannot see are missing
   from truck volume today. Josh is recording a rough box count per room during
   the eval photo session so the eval can tell.

   Scope as recommended: once per move, not per room; quick choices for "no"
   (7, 9, 10, 12 ft, or other) instead of typed text; "not sure" is treated as
   8 ft, today's behaviour. **Shipped the same day** as sprint item E2b – see
   `docs/sprint-2026-09-14.md`.

### Decision needed from the Chairman

**Sweep for everyone, or for Premium only – and how each is funded.** Raised
by the Chairman, who asked for it as a decision with funding for both
scenarios. Full working in the Sweep Capture Decision memo; the essentials:

The sweep's own cost does not decide it. It adds $0.11–$0.22 per move over
tapping. Costs are per *started* move – an inventory costs the same whether or
not the person ever books or buys – so every funding figure has to carry the
people who don't.

- **A · Sweep for everyone.** Funded by commission on truck bookings made
  through Loadsy's links, by Premium sales subsidising free users, or – until
  either exists – by investment, as the cost of acquiring users. To break even
  on a 3-bed house at a 10% booking rate, a booking must earn $5.68 in
  commission, against $3.47 for tapping alone: 64% more, so a costlier free
  tier rather than a different problem. Needs a per-device cap on detection
  calls, because re-sweeps multiply the cost. Always keeps the free promise.
- **B · Sweep for Premium only.** Funded by the Premium purchase itself, which
  covers even the worst-case sweep ($0.94) at any price above $1.35 after a 30%
  store commission, or $1.11 after 15%. Free users keep tapping at $0.17–$0.35
  per started move, funded as in A. Cannot ship before Premium payments exist,
  and there are none today. Keeps the free promise only if the sweep is no more
  accurate than tapping – because the Premium screen tells free users they never
  need Premium to learn what size truck they need.

No commission rate or booking rate is known, since no affiliate agreement
exists; the figures above are what those rates would have to be, not forecasts.
Confirm Apple's current commission terms before setting a price.

**Recommended rule:** let the eval choose. If the sweep proves *more accurate*,
choose A and fund it from booking commissions, capped per device. If it proves
*as accurate, with less effort*, choose B – it sells convenience and pays for
itself, but waits on billing. **Either way, start the affiliate applications
now:** the free tier loses money on every started move until a commission
arrives, so they fund both scenarios, and the 09-08 round-table already noted
their lead time. This question is therefore tied to the still-open revenue
posture decision from 09-08 – with no revenue, both scenarios are paid for by
investors.

### Still open from the memo

Approving phases 0–2, an owner and date for the 20 eval photos (none exist yet),
re-adding `expo-camera` and `expo-sensors`, and accepting roughly $0.28–$0.57
of model cost per move with no v1 revenue.

---

## 2026-09-08 — Full round-table

**Headline: the build compiles clean on Josh's Mac.** Confirmed by Josh this
session. `npm install` succeeded and `tsc --noEmit` passes on real installed
dependencies — not just in the zero-dependency sandbox. This retires the single
largest standing risk in the project: every line of the SDK-57 dependency
correction and the `File`/`Paths` migration in `layout-view.tsx` was written
from docs and had never been compiled. It holds.

Status is now: **verified code, unverified product.** Nothing has run on a
screen.

### Round-table

**Product** — Seven screens plus the §3.1 breakdown modal are implemented and
compiling. The next gate is the first launch, not more code. Two deferred edge
cases stand (`Alert.alert` web fallbacks, AsyncStorage write debounce); neither
blocks a device run. Standing item #4 from the 09-03 review — splash
`imageWidth: 200` on tablets — becomes testable the moment the app launches, so
it rides along with the first run rather than being scheduled separately.

**Engineering / Integrations** — This is the blocker nobody has costed yet. The
app runs end-to-end on `EXPO_PUBLIC_USE_MOCKS=true`. The `false` path has never
executed against anything, because **there is no backend**. `/v1/detect` does
not exist. Photo-based inventory is the product's whole premise and it is
currently a mock returning canned furniture. Capture quality thresholds are
implemented and tested but fed a hard-coded `1` for brightness and sharpness. No
API host, no auth, no storage, no cost model for inference. Everything else on
the roadmap is downstream of a decision here.

**Design** — Branding shipped 09-03 and is in the repo. Two open items from that
review: panel-seam vs. tape-tick hierarchy at 60px (nice-to-have), and the
lowercase "loadsy" wordmark still reading as a system font (post-launch).
Neither blocks submission. Design's real next deliverable is the App Store
screenshot set, which cannot start until the app renders on a device.

**Vendor Relations** — Five vendors appear in the list; U-Haul and Penske are
the v1 deep-link targets. To Design's knowledge no affiliate agreement has been
applied for with any of them. Affiliate approval typically wants a live product
or at least a working demo and a real domain, which puts this behind the first
build rather than in front of it — but the applications have lead time and
should be started, not finished, now.

**Sales / Revenue** — Follows directly: with no affiliate agreements signed, v1
ships with a $0 revenue path. That may be the right call for a launch — get
installs, prove the funnel, monetize in v1.1 — but it should be a deliberate
decision rather than a default. The "pro packing plan" paid tier is the other
lever and requires no vendor cooperation, only StoreKit.

**Marketing** — TryLoadsy.com status unknown to the team; registration and a
landing page are the cheapest pre-launch asset and gate the affiliate
applications above. Standing item #3 from 09-03 (tape-forward icon A/B variant)
remains a v2 test. No App Store listing copy, keyword set, or description draft
exists.

**Security** — Three items. (1) EXIF strip on production assets
(`exiftool -all= assets/*.png`) — carried from 09-03, still owed before build.
(2) **A privacy policy URL is mandatory for App Store submission and none
exists.** (3) The app takes photos of the inside of people's homes. Once a real
backend exists, where those images go, how long they are retained, and what the
App Privacy nutrition label declares become launch-blocking questions with legal
weight. Security's position: do not stand up the backend before deciding the
data retention policy, because the policy shapes the architecture.

**Management** — The critical path to submission is now:
backend decision → device run → screenshots + metadata → privacy policy →
Apple Developer enrollment → submit. Enrollment status is unknown and is a hard
dependency with its own lead time (an Organization account requires a D-U-N-S
number and can take weeks; an Individual account is same-day). If Josh intends
to ship as a company rather than as himself, that clock should start today — it
is the one task with a long tail that nobody is blocked on starting.

### Decisions needed from the Chairman

1. **Backend strategy for photo detection.** Three viable shapes: (a) on-device
   inference via Core ML / Vision — no server, no photo ever leaves the phone,
   which also collapses most of Security's concerns, but is the largest
   engineering change; (b) a thin hosted API in front of a vision model —
   closest to what the code already expects, real per-inference cost, real
   privacy surface; (c) ship v1 with manual inventory entry only and hold
   detection for v1.1 — fastest to the App Store, weakest product story.
   Everything downstream waits on this.
   *(Since resolved: (b), in its narrowest form. See `docs/build-state.md`.)*
2. **Apple Developer Program: Individual or Organization?** Determines whether
   enrollment is a same-day task or a multi-week one. **Still open.**
3. **Revenue posture for v1** — launch with no monetization and add affiliates
   in v1.1, or hold the launch until at least one affiliate agreement is live.
   **Still open.**

### Open questions

- Did `npx expo install --fix` change any dependency pin? A change would mean
  the installed `expo` disagrees with the `sdk-57` branch manifest — worth
  knowing.
- Is TryLoadsy.com registered?
- Has Apple Developer Program enrollment been started?

---

## 2026-09-03 — Branding review

Six items raised against the app icon, splash, and listing treatment. Recorded
in `docs/build-state.md` under the 09-03 branding section. Items 2, 3 and 5
remain open; item 4 (splash `imageWidth` on tablets) is testable at first device
run; item 6 (EXIF strip) is owed before the production build. Item 1 (panel-seam
vs. tape-tick hierarchy at 60px) was overtaken when the box truck was replaced
by the reserve mark.
