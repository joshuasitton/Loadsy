# Loadsy — Leadership Standup Log

Running log of leadership round-tables. Newest first. Josh is Chairman of the
Board and sole human authority; every "decision needed" below waits on him.

Imported from the claude.ai "Loadsy App" project on 2026-09-11. Entries are kept
as they were written — a standup is a record of what the team believed on a
date, and editing it after the fact destroys the only thing it is for. Where an
entry has since been overtaken, `docs/build-state.md` says so at the top.

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
