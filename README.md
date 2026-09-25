# Loadsy

**Right size truck. Right plan.**

React Native + Expo implementation of the Loadsy MVP Technical Spec.

`CLAUDE.md` is the short orientation for anyone — or anything — arriving cold.
`docs/build-state.md` is where the project stands and how it got there,
`docs/leadership-standup.md` is the decision log, and `APP_STORE.md` is the
release checklist. This file is the reasoning behind the code.

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

Live at **<https://loadsy--demo.expo.app>**, deployed with:

```bash
npm run demo:deploy
```

That exports with `EXPO_PUBLIC_DEMO_MODE=true` and deploys it under the `demo`
alias, so the URL is stable and can be handed to someone in a meeting. It is
deliberately not the production deployment. Until 21 September it was: the script
ran `eas deploy --prod`, and <https://loadsy.expo.app> is also the host every
installed iOS build calls for `/v1/detect` – so each demo deploy replaced the
endpoint real users depend on with whatever the demo branch had, under the
`preview` environment's variables rather than production's. Production is now
deployed only by `npm run deploy:prod`, from a plain export with demo mode and
mocks off – see "The backend". To run the demo build locally instead:

```bash
npm run demo
```

Demo mode adds the sign-in screen, the sign-out control in every header, and the
prepared-inventory bar. It follows the same rule as `EXPO_PUBLIC_USE_MOCKS` — **on
in development, off in a release, an explicit value winning either way** — so any
dev server shows the whole experience and a store build still cannot carry a
bundled password by accident.

It used to be off unless the flag was exactly `"true"`, which meant
`npx expo start --web` ran with it off. Nothing signs in when it is off, so the
sign-out control correctly rendered nothing and the app looked like it had lost a
feature — two dev servers behaving differently for a reason that appeared nowhere
on screen. To get the old behaviour deliberately: `EXPO_PUBLIC_DEMO_MODE=false`.

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

### What is on which screen

Sign out sits in the navigation header of **every** screen that has one, via
`screenOptions` rather than per-screen, so it cannot go missing from one of them.
It renders nothing when signed out, which is why it is invisible with demo mode
off — there is no session to end.

Back/forward `StepNav` is on the **four flow steps only**: Inventory, Truck Size,
Where to Rent, Packing Plan. The dashboard is the hub the flow starts
from, and Capture, Truck Layout and Past Moves are detours off a step rather than
steps — all four use the header's back control instead. Putting "Next →" on a
screen that is not in the flow would have to invent an answer to what comes next.

### The mark

The cargo bed seen end-on, packed with four pieces and no gap between them: a tall piece on
end, a wide one above two narrow ones, and the last piece in drawn dark. It is the view the
app's own load diagram uses, and the one thing Loadsy computes that no competitor does – not a
truck, but the solved load inside one.

The pieces are uneven on purpose. Four equal boxes read as a folder icon; this reads as a
solution, which is what the packer actually returns. One number sets the composition – the gap
is 6 units everywhere – and every piece's size follows from it and from the pack filling 70% of
the grid, centred, so nothing is placed by eye.

**What it trades.** Of the three directions drawn, this was the least literal. Someone who has
built a plan in the app will recognise their own load; someone who hasn't may read it as a grid
or a chart, and it says nothing about moving by itself. Two earlier versions made the opposite
bet – an L monogram whose empty corner was the sizing reserve, then the same L with a truck cut
into that corner for recognition – and were set aside for this one. Pair it with the wordmark
until the product is known.

**The dark piece is close to the line.** Ink on the green ground is 3.03:1, just clear of the
3:1 WCAG floor for graphics. Against the white pieces beside it the contrast is 16:1, and those
shared edges are what actually define it. `verify-marks.mjs` pins the ratio, because a palette
change that took it under would leave a hole where a piece should be.

It replaced a side-view box truck, which was the category's stock image — the same picture
U-Haul, Budget, PODS and Lugg resolve to — and whose only distinguishing detail, a tape
measure along the roof, disappeared below about 64px.

The geometry lives in `src/ui/markGeometry.ts` and nothing else defines it. `<Mark />`
draws it as SVG inside the app; `npm run brand:icons` rasterises the same numbers into the
four PNGs and then reads those PNGs back to check them. That second half is not ceremony:
the Android layer is white and ink shapes on transparency, so it looks empty in any viewer with
a white background, and an icon that shipped empty would look exactly like one that shipped
correctly. The check decodes the file and counts pixels instead – including inside each of the
three gaps, because a mark whose gaps had closed would still look like a green square with shapes
on it.

It caught a real error on the first run. The mark cleared Android's 264px safe *square*
and overshot its safe *circle* by 41px, which a launcher with a circular mask would have
trimmed to a stump.

There is no SVG rasteriser on this machine and none was added. The PNGs are encoded with
`node:zlib`, which ships with the runtime — four static files that change once a year did
not seem worth a build dependency.

### Free and Premium

Free ends where the answer is complete. A free account photographs its rooms, gets a
truck size and where to rent it, and never sees a wall on the way — that is the
whole of steps 1 and 2 on the dashboard, and it is a product somebody can finish.
Premium is the work that starts after the truck is booked: the load order and the
solved layout, plus Reservations and Moving Day when they are written.

The line is drawn once, in `src/domain/tier.ts`, and in terms of `MoveStatus` — the
only vocabulary the dashboard's five rows and the flow's five screens already share.
The routes are derived from the statuses, which is what stops the dashboard offering a
row the flow refuses to open. Truck Layout is the exception that has to be listed by
hand: it is a detour off Packing Plan rather than a step in `FLOW`, so nothing derives
it, and leaving it out would put the most expensive computation in the app one URL away
from free.

**Premium is not shipping with the MVP.** There is no billing anywhere in this
repository — no products, no receipts, no server — so the wall describes, says plainly
that there is nothing to buy, and takes an "interested" boolean that never leaves the
device. `src/billing/tier.ts` holds the two flags and, more importantly, `honour()`:
the single function that decides what tier a build will accept from storage.
`{"tier":"premium"}` in AsyncStorage is one line of devtools away, and a build with
nothing to sell and no demo has to answer "free" to it. Everything resolving a tier goes
through that function, and `__tests__/tier.test.ts` pins it.

**A store build of the MVP has no Premium in it at all.** `PREMIUM_REACHABLE` is false
there – nothing to sell, no demo – and since 21 September that also means nothing is
drawn: no tier line on the dashboard, no wall, no Premium screen (the URL answers with
the dashboard), and no "SOON" rows for Reservations and Moving Day. The Packing Plan
and the Truck Layout are simply the end of the flow. Apple rejects apps that show
features which are not available (guideline 2.1), and a wall that says "not for sale
yet" in front of finished software is exactly that. `dashboardStatuses()` in
`src/domain/tier.ts` is the one place that decides which stages a build draws, and
`__tests__/tier.test.ts` pins that the shipped stages are a prefix of the model's order
– so the current step has the same index in both builds and the progress bar cannot
disagree with itself. The domain rule about where Free ends is unchanged; the build
declines to apply it when there is nothing on the other side.

Demo builds can flip between the tiers — the toggle is in the demo bar, and the wall
carries one too. That exists because the solver is the most convincing thing Loadsy
does and it now sits behind a lock; a walkthrough has to be able to show both sides,
without a purchase existing. `PREMIUM_FOR_SALE` defaults off in **every** environment,
including development, unlike `USE_MOCKS` and `DEMO_MODE`: those default on in dev
because a developer wants the convenient thing, and this one defaults off because a
developer wants to be looking at the screen users will actually get.

### Every screen is a row on My Move

The dashboard's rows come from `dashboardRows()` in `src/domain/tier.ts`, which derives
them from `FLOW` and appends Truck Layout – the detour off the Packing Plan – and, only
where Premium is present, the two "SOON" stubs. They used to be a hand-written list of
three, and the first store build (22 September) could not reach Where to Rent or Truck
Layout from My Move at all: both existed, both were in the flow, and neither had a row.
Deriving the list is what makes that impossible to repeat, and `__tests__/tier.test.ts`
pins that every `FLOW` route is a row.

Two rows share a stage – Truck Size and Where to Rent are both `truckAndPrice` – so a
row's state is decided by its stage against the move's, not by its position: both read as
current when the move is there. The progress bar counts rows, and "Step n" is the first
current one.

### The welcome screen

`app/welcome.tsx` is shown once per phone, on the first launch of a release build, and
never again – the flag is `src/onboarding/welcome.ts`, read once in the root layout before
anything is drawn so the dashboard cannot flash first. It is three lines on what the app
does and a Get Started button; no pages, no account, nothing to skip on later opens. Asked
for after the first TestFlight install, where an empty dashboard was the right screen for
the fiftieth launch and a cold one for the first. It does not appear under `DEMO_MODE`,
where the sign-in screen is already the front door, but `/welcome` still opens for looking
at it. The tagline is left off it: the three lines already say what the app does. The
tagline itself lost "Right price." on 25 September – v1 shows no prices, and it was the
first thing a reviewer read – and now lives once, as `TAGLINE` in `src/domain/site.ts`.

### Moving through the flow

The four working screens — Inventory, Truck Size, Where to Rent, Packing Plan —
are one ordered list in `src/domain/flow.ts`, and `StepNav` derives both
directions from it. Back and forward therefore cannot disagree about what follows
what; `__tests__/flow.test.ts` asserts they are inverses.

Forward navigates with `replace`, not `push`. These are steps in one flow rather
than a stack of pages, so walking forward and back a few times should not build a
history the user then has to unwind.

For a free account the fifth step is locked, and `StepNav` turns its forward button
into "Unlock Packing Plan" rather than hiding it. The counter still reads "of 5" —
the step exists, it is just not theirs yet, and a denominator that changed with the
tier would make two demo builds disagree about how long the flow is. The lock is
checked *after* the confidence gate, deliberately: telling somebody their inventory is
incomplete is more use than telling them about a paywall they would reach afterwards
anyway. Fix first, then upsell.

### The load plan is an order of operations

People load in the order the plan is printed, which makes the sequence a set of
instructions rather than a grouping. Two consequences shape `src/domain/packing.ts`:

- **The groups are tiers, named for when they are loaded** — "Load first — the
  heavy base", not "Against the Back Wall". A group is a section of the deck
  filled in one pass, several items deep; only the first two or three pieces
  touch the wall behind the cab, so naming the group after that wall promised
  something visibly untrue of the rest.
- **Placement is a property of the item**, owned by the guidance rule that also
  writes the sentence describing it. It used to be decided twice — by category
  and weight here, and in prose in `itemGuidance.ts` — with nothing keeping the
  two in step. They diverged: a rug was told to go "at the very back, under
  everything else" while being listed fourth of five, so anyone following the
  plan put the rug on top of their furniture.

`__tests__/packing.test.ts` reads each rule's own sentence and fails if it
contradicts the zone it assigns, which is how that class of bug stays fixed.

Within a tier: biggest first, id as the tiebreak so the plan stays deterministic.

### The truck layout

Three tabs on Screen 6. Two are the zone summaries; **Load It** is a solved 3D
load, played back one piece at a time in the order the plan prescribes.

`src/truckmap/layout.ts` is a small bin-packing solver. Packing boxes into a box
optimally is NP-hard, so it does the achievable thing instead: try six
deterministic arrangements and keep the best. Within a pass it turns each piece
both ways on the deck, lays down anything that will not stand, and settles every
placement down-then-forward-then-to-a-wall until it touches something.

Two hard guarantees, both asserted in `__tests__/truckLayout.test.ts`:

- **No two pieces occupy the same space.**
- **Nothing floats** — every piece rests on the deck or on at least 70% support.

The search is deliberately narrow, because most of the freedom is not ours. Load
order *between* groups is fixed: the plan prints heavy base, then long and tall,
then boxes, and people load in the order they read. Order *within* a group is a
knob. Pose is constrained by the guidance rule that writes the instruction, with
flatter poses as fallbacks rather than alternatives.

Scoring, in order: most pieces placed, then the shortest load, then the lowest
centre of mass, then agreement with the printed group order — two loads of equal
length are not equally good if one is stacked tall, or if it puts the box wall in
front of the wardrobe while the plan says otherwise.

**The playback order is derived, not the order the solver placed things.** The
solver works group by group and fills where it can, so its own sequence hops
between lanes; `project` sorts back to front so nearer pieces paint over further
ones. Both are right for what they do and neither is a load order. `loadSequence`
derives one — front to back, bottom to top — under two rules that cannot be
broken: a piece goes in after whatever holds it up, and after anything already
blocking its way. A test walks the sequence piece by piece and fails if either is
violated.

The occasional step back towards the cab is the second rule working: a television
riding on top of a stack cannot go in until the stack is there.

**The printed plan and the diagram share that sequence.** Every row on the
packing screen carries its load number, the animation counts up to the same
numbers, and each group lists its pieces in that order. Groups still interleave —
the solver sometimes finds a better place for a box than the group order would
suggest — and the numbers make that visible rather than hiding it, which is the
point: the number is the thing to follow.

**Two views of one solve**, the convention of any engineering drawing: from the
side for the stacking, from above for which wall a piece is against. A side
elevation alone can never answer the second question — half the load is hidden
behind the other half. Pieces further from the viewer are drawn dimmer, so the
depth the projection throws away is at least visible.

Bed dimensions are U-Haul's published interiors. They deliberately do **not**
replace `TRUCK_CAPACITY`, which is what sizing decisions are made from: the 10'
capacity counts an over-cab compartment the deck does not describe, and the larger
trucks lose deck to wheel wells.

### No prices in v1

Decided 15 September, when live testing reached the prices screen and it failed: it
called `/v1/quotes`, which was never built. The prices every demo had shown were
computed on the phone from a table of rental rates nobody had sourced, with availability
dates made up per vendor – labelled "estimated", but presented as local prices. A
release build would have shown every user the error; fixing it by showing the table
would have shown them guesses. Live prices mean partnerships and a service to run, and
the company is kept low-overhead. So v1 recommends the size and links to each rental
company, whose own site gives the price.

The trip step and the location permission went with it: addresses, mileage and the move
date were collected only to price the truck, and a location prompt promising "truck
rental rates near you" would have described something the app no longer does. The next
section describes a screen now removed – `app/trip.tsx` is in the git history – and its
domain code, which stays. The quote code in `src/api/rentals.ts`, `src/api/mocks/quotes.ts`
and `src/domain/quotes.ts` is kept, tested and unused until prices return.

### Pickups and trailers

Decided 18 September: offered at launch beside the truck. The truck stays the
recommendation – enclosed, no tow vehicle, and what the load plan is solved for – and the
truck screen says, for an 8 ft pickup, a 5×8 open trailer and 5×8 and 6×12 cargo trailers,
whether this load fits and why not.

A truck is sized by volume because everything in a home goes through its door. These are
not, so `src/domain/vehicleFit.ts` checks three things: every piece must fit the space in
some square-on orientation – and through an enclosed trailer's door, which is smaller than
its inside – and the buffered load must fit the space less the same 15% reserve a truck
keeps. A pickup's width is the gap between its wheel wells, 50 in, because that is the
width a sofa gets. An open bed's height is Loadsy's own rule, 42 in above its floor – about
the top of a pickup's cab – not a specification. Payload is shown, not checked: the
inventory knows a weight class, not pounds.

Every dimension is from a published specification, cited in `src/domain/smallVehicles.ts`;
where sources disagreed the smaller figure is used, and volume is computed from the
dimensions because published cubic feet run 8–10% high. `src/domain/rentalOffers.ts` lists
only companies that rent each vehicle – Penske and Budget Truck rent neither pickups nor
trailers, and only U-Haul rents enclosed trailers – because a company listed for a vehicle
it does not have is a wasted trip. Two known limits, both erring towards "doesn't fit":
detection sees furniture assembled, so a bed frame that would come apart is judged whole
(the screen says so), and a wide flat piece such as a mattress is held to the wheel-well
width although it could ride above the wells.

The company's site is the main action on Where to Rent and opens inside the app – the route
an affiliate link will need. "Near me" is a maps search, so the nearest branch is found
without Loadsy asking where anyone is.

### Your own vehicle

Decided 23 September: in v1, and "it fits in your own car" is a good outcome even though
nobody rents anything. The truck screen has a Your Own Vehicle card: pick what you drive,
and it says how many trips the load takes, which pieces go in each, and which never go in
it at all.

The answer is in trips because the question is different. A rental is yes or no – you
rent the one that fits. Your car is already in the driveway, so "no" is rarely the useful
answer; "three trips, and the sofa goes in something else" is. `src/domain/ownVehicle.ts`
uses the same fit rule as a pickup or trailer – `itemFits`, which now takes any
`CargoSpace` so there is still one rule – and then splits what fits into car-loads,
biggest piece first, each held to the same 15% reserve a truck keeps. Past three trips the
card says the truck does it in one, and stops listing trips nobody would follow.

A car is not a box, so it is turned into a conservative one: floor length with the rear
seats folded, width between the wheelhouses, the lower of the interior and the opening
height, and the liftgate opening as a door the piece has to pass. "Cargo volume" in cubic
feet is never used – it is measured with luggage-sized blocks, and says nothing about
whether a dresser gets past the tailgate.

**Tight pieces are the new failure, and they are handled by asking for a tape measure.**
A truck's error is the sum of many pieces' errors, which mostly cancel. In a car one
dresser is the whole answer, and the detector's per-dimension error (σ ≈ 0.15, see
`truck.ts`) is bigger than any margin a car can spare. So an *estimated* piece that fits
by less than 10% every way is listed under "Measure first": one measurement, entered in
the inventory, and the answer for that piece is exact. A size the person entered is never
tight.

**The list holds only published figures, and is short on purpose.** `src/domain/ownVehicles.ts`
follows the rule `smallVehicles.ts` does – a cited source, the smaller figure where sources
disagree – and `__tests__/ownVehicle.test.ts` refuses an entry without one. At first commit
it has one entry, the full-size 8 ft pickup, taken from the rental entry rather than
copied. The research to fill it could not be done from the cloud session that built the
feature, because its network blocks manufacturer sites and a search summary is not a
source; `docs/own-vehicle-research.md` lists what to fetch. A vehicle not listed gets
"Mine isn't listed" and the truck, never a guessed size: a car said to fit that does not
is the one answer that costs the person their moving day.

The choice is stored on the move, on the device, like the ceiling height, and is never
sent.

**"Mine isn't listed" is counted** (decided later on 23 September), because it is the
number that says which vehicle to research next. The person picks, in this order, a body
type, a model year, a make and a model, all from fixed lists, and presses "Count my
vehicle"; nothing is sent before that, and nothing typed is ever sent, because a free-text
box is where a name or a phone number would arrive. The model says which vehicle to
research and the year says which generation of it – one CR-V is several cargo floors.

The years run from next year back twenty, then "Older" and "Not sure", computed from the
date so the list does not stop a year short every January. The models are
`VEHICLE_MODELS` – names only, so unlike the cargo figures they need no source – offered
for the chosen make and type with "Other" last; a make with no model of that type asks
nothing more, and the route refuses a model that does not belong to its make and type, so a
count can never name a Honda Tacoma. `/v1/vehicle-request` writes one log line –
`{"event":"vehicle_not_listed","body":"suv","year":"2019","make":"Honda","model":"CR-V"}`
– and keeps nothing else. `src/domain/vehicleRequest.ts` is
the contract for both ends, and it refuses a request with any extra field rather than
dropping it, so the payload can only grow by someone changing that function and its test.

The counts live in the deployment's logs rather than a database, because a table would be
a second thing to secure and pay for, holding four words a row. Read them from the EAS
dashboard, filtering on `vehicle_not_listed`. How long the logs are kept is the hosting
plan's, not Loadsy's, so read them before each research round rather than expecting a
year of history. Each address is counted three times an hour at most, in memory – one
person's taps should not outvote everyone else's – and a mock or demo build sends nothing,
so testers never reorder the list.

This is the first thing Loadsy's server keeps, so the App Store answer moved off "Data
Not Collected" to Product Interaction, not linked to the user – see `APP_STORE.md`. The
privacy page says the same.

### Nobody names a room

Decided 18 September: "stuff is stuff" – take pictures, get a truck size, find a truck.
Naming rooms was a question the answer never needed, asked before the one thing the person
came to do, and an apartment move or a pile in a garage does not divide into rooms anyway.
So Capture is "Add photos", the inventory is one list, and Past Moves shows one list.

Rooms were hidden, not removed. A set of photos is still one request, labelled "Photos 1",
"Photos 2" (`nextPhotoSetName`), with hand-added items under "Added by hand" – because the
set is the unit the model de-duplicates within: two photos of one sofa in one request are
one sofa. Taking the grouping out of the data would have meant either one request for
every photo in the home, past the route's limit and its minute, or no de-duplication at
all. Between sets, the double-count check (`src/domain/duplicates.ts`) still asks – now
"Is it one piece, or two?", since there is no room to ask about. "It's one" deletes the
second listing rather than marking it, so the inventory and the truck agree without a
reconciling step.

What went with the names: the coverage card, which listed the storage spaces with no room
of that name yet, became a fixed checklist – closets, kitchen
cabinets, storage, balcony or garage – and the Packing Plan lost its By Room tab, which
would have grouped things under "Photos 2".

### Where the move starts and ends

Its own step, `app/trip.tsx`, between Inventory and Truck Size — full street
addresses for both ends, plus the distance.

**Only the ZIP is required.** Everything Loadsy computes from a location is
ZIP-level: rates, availability and depot coverage are published that way, and the
distance estimate reads ZIPs too. Someone who knows they are moving to 78745 but
has not signed a lease can still get a truck size and a comparison. Half-typed
addresses are stored as typed — street first, ZIP last is how most people write
one — while the ZIP a quote is built from stays empty until it is real.

**The address never leaves the device.** The quote request carries the ZIP and
the mileage, nothing else. `APP_STORE.md`'s "Data Not Collected" answer depends
on that, so adding a geocoding service is the moment the privacy label changes.

`src/domain/trip.ts` turns those two ends and an optional user-entered mileage
into the trip a quote is built from. Two things
depend on it, and both change the ranking rather than only the totals:

- **The one-way drop fee** applies only when the truck is left somewhere else.
  Every quote used to carry it, so a local move was priced $50–75 high — and
  since the fee differs by vendor, the cheapest truck for driving across town was
  being decided partly by a fee for not driving across town.
- **Mileage and fuel** scale with distance and dominate the base rate on a long
  move. Deriving them from the origin ZIP alone, as Loadsy used to, priced every
  trip as if it were across town.

`estimateTripMiles` is an openly-labelled stand-in — real road miles need a
geocoder and a routing service, and there is neither yet. It leans long rather
than short, because under-stating distance under-states exactly the lines that
decide a long-haul comparison. That is also why the figure is editable and why
the screen asks the user to check it above 400 miles.

### The backend

Two endpoints, deployed with the app itself. `app/v1/detect+api.ts` is the backend
proper; `app/v1/vehicle-request+api.ts` counts "Mine isn't listed" into the log and is
described under "Your own vehicle".

Detection exists for exactly one reason: the vision model's API key must never reach the
device. Everything else Loadsy computes runs on the client because it can —
volumes, truck sizing, prices and the packing plan are all pure functions of the
inventory. A key is the only thing that cannot ship, so it is the whole backend.

```bash
npm run deploy:prod
```

That is a plain `expo export -p web` – so demo mode and mocks are off – followed by
`eas deploy --prod --environment production`: the production URL and the production
secrets, named together on purpose. A bare `eas deploy` takes a preview URL and the
`preview` environment, where the key is not set, and the route answers 503. That is
correct, and baffling if you expected production. The demo has its own script and
its own alias for the same reason; see "The hosted demo".

Set the key as an EAS environment secret — **never** as an `EXPO_PUBLIC_` variable,
which is bundled into the app in plaintext:

```bash
npx eas-cli@latest env:create production --name VISION_API_KEY --scope project --visibility secret
```

**Cost.** The route's URL ships in every bundle, and until App Attest nothing proves
a request came from Loadsy, so `src/vision/rateLimit.ts` bounds what one address can
ask for – twenty photo sets in fifteen minutes, and three hundred per process from
everyone – and answers 429 with a `Retry-After` beyond that, before the body is read.
The capture screen says what a 429 means rather than blaming the photo. The counters
live in process memory and serverless hosting runs many processes, so this is sized
for a person, not proof against a script: the spend limit on the API key is the hard
cap, and App Attest is the v1.1 fix.

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
returned, and neither is written to disk or into a log. That keeps photos off the App
Store privacy label entirely. If retention is ever added, the label has to change with
it.

### Building for a device without Xcode

This machine has only the Command Line Tools, so `expo run:ios` and the simulator
are unavailable. EAS Build compiles on Apple hardware in the cloud instead, which is
what makes TestFlight, screenshots and submission reachable from here.

`eas.json` is committed and ready, and the project is already linked: `app.json`
carries the EAS project id and the `jdsitton` owner, and `eas.json` pins the App Store
Connect app id (`ascAppId`). What is left needs your Expo and Apple accounts, so it runs
on the Mac, not in a cloud session – Apple's sign-in asks for a two-factor code.

```bash
npx eas-cli login
npx eas-cli credentials -p ios
```

In `credentials`, choose the `production` profile and let EAS generate the distribution
certificate and the provisioning profile for `com.loadsy.app`; you never touch either by
hand again. In the same menu, let it create an **App Store Connect API key** as well.
Without the key every `eas submit` stops for an Apple ID and a two-factor code; with it,
and with `ascAppId` pinned, submission runs with no prompt at all. All of it needs an
active Apple Developer Program membership, and the key needs the Admin or Account Holder
role.

Then build, and send the build to TestFlight:

```bash
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

**The three profiles:**

| Profile | What it is | Use it for |
|---|---|---|
| `development` | Dev client, simulator build | Running against a local Metro server |
| `preview` | Release build, ad hoc distribution, demo mode and mocks | Screenshots and demos on registered iPhones |
| `production` | Release build, store credentials, live backend | TestFlight and App Store submission |

**`preview` is not TestFlight.** Internal distribution is Apple's ad hoc route: the build
installs only on iPhones registered to the account first (`npx eas-cli device:create`),
and it is never uploaded to App Store Connect. TestFlight is reached only through a
`production` build and `eas submit` – which is also the build a tester should use, since
`preview` runs the demo inventories rather than the real detector.

`production` sets `autoIncrement`, and `cli.appVersionSource` is `remote`, so EAS owns
the build number — the `buildNumber` in `app.json` is no longer the source of truth.
Bump `version` there for a marketing version change; leave the build number alone.

`development` and `preview` pin `EXPO_PUBLIC_USE_MOCKS` and `EXPO_PUBLIC_DEMO_MODE`
on. `production` pins neither – they default off in a release – and points
`EXPO_PUBLIC_API_BASE_URL` at `https://loadsy.expo.app`, so a production build measures
real photos through the deployed `/v1/detect`. That route answers 503 until the
`VISION_API_KEY` secret is set on the `production` environment (see "The backend"), so
set it before the first TestFlight build: a tester whose photos all fail learns nothing
about the app.

---

## What's built

The screens from spec §3, less prices – see "No prices in v1" above:

| Route | Spec | What it does |
|---|---|---|
| `app/index.tsx` | Screen 7 | My Move dashboard, 5-step tracker bound to `MoveStatus` |
| `app/capture.tsx` | Screen 1 | Camera + gallery capture, tips card, photo quality gate |
| `app/inventory.tsx` | Screen 2 | One inventory list, confidence and double-count gate, add by hand |
| `app/truck.tsx` | Screen 3 | Recommendation with the raw → buffered → capacity breakdown; trips in your own vehicle |
| `app/rent.tsx` | Screen 4 | Where to rent the truck or a pickup or trailer that fits – each company's site, and "near me" |
| `app/packing.tsx` | Screen 5 | Load plan in numbered groups, weight-class aware |
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
npm test        # every test file in __tests__/, no dependencies required
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
