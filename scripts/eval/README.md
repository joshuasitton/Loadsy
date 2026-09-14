# Detection eval harness

Answers one question before any money is committed to a live model:

> **Does vision-based measurement size the truck correctly?**

Everything downstream of detection is already exercised by the mock layer. This
measures the part that is not.

## Why volume error, not label accuracy

Calling a loveseat a "sofa" changes one word on a screen the user can edit, and the
name never enters a calculation. Getting its length wrong by 20 inches changes ~17
ft³ — and `recommendTruckSize` is a step function over fixed capacity bands, so
near a boundary ~50 ft³ flips a truck class. Volume error IS the product.

The harness therefore reports, in priority order:

1. **Room-level volume error** — median absolute, plus whole-move bias. Bias matters
   far more than spread: random error averages out over a move, bias does not.
2. **Truck-size accuracy** — does the predicted truck match the measured one, and
   critically, **how often is it too small**. Those are not symmetric errors.
3. **Failures, latency and cost** — a request the route would have cut off at its
   timeout is a failure a user sees, so it is counted, not quietly scored as zero.

## It measures what ships, or it measures nothing

An eval that differs from the app in any way reports on a product nobody uses. This
one used to differ in five: it carried its own out-of-date copy of the prompt, sent
full-resolution originals where the app sends 1568px, sent each photo alone where the
app sends a room's photos together, read the model's answer with its own lenient
parser, and hard-coded the packing buffer. Each of those would have made the numbers
look better than the app can deliver.

So every step now goes through the app's own code, and `__tests__/detectRequest.test.ts`
fails if a copy creeps back in:

| Step | Shared with the app |
|---|---|
| Prompt, message, response budget, model | `buildDetectBody` in `src/vision/detectRequest.ts` |
| Photo size and quality | `src/media/uploadSpec.ts` |
| One request per room, at most 4 photos | `MAX_PHOTOS` in `src/domain/capture.ts` |
| Reading the answer | `parseDetectedItem` in `src/api/detect.ts` |
| Truck size | `DEFAULT_PACKING_BUFFER_PCT` and `recommendTruckSize` |
| Deadline | `UPSTREAM_TIMEOUT_MS` |

### What happens to each photo before it is sent

The app re-saves every photo at 1568px before upload; the eval does the same with
macOS `sips`, in an order each step of which was probed against real `sips` behaviour:

1. **Turned upright.** Phones often store a portrait photo as landscape pixels plus a
   rotation tag, and `sips` ignores that tag. The eval reads it and rotates the pixels.
2. **Resized and saved as JPEG once**, at 1568px and quality 0.8, never enlarged.
3. **Every metadata block removed** — GPS location, camera details, the rotation tag.
   Removing the tag is not only privacy: `sips` writes the original tag into its output
   even after rotating, so a file that kept it would be turned twice.
4. **Checked before sending.** If any identifying metadata is left, the photo is refused.

Verified on this project against photos written by Apple's own ImageIO with a real GPS
location and a rotation tag, in both JPEG and HEIC: the bytes the eval sends carry no
GPS, no EXIF and no rotation tag, and come out the right way up. Every intermediate copy
is written to a private temporary folder that is deleted however the run ends.

Mac only, because `sips` is.

## Taking the photos

Photos of real rooms — your own home is exactly right. Twenty photos across four or
five rooms is enough to see whether this works at all. It is not enough to tune
thresholds.

**Name each photo by room, then photo number:**

```
living-room-1.jpg
living-room-2.jpg
bedroom-1.heic
bedroom-2.heic
```

Every photo of one room goes to the model together, in one request, exactly as the
capture screen sends it — so the app's advice about a second angle gets measured too.
At most 4 photos a room, the app's limit. A room whose name ends in a number keeps it
by adding the photo number after: `bedroom-2-1.jpg` is room `bedroom-2`.

JPEG, PNG and HEIC all work, so no iPhone setting needs changing, and location data is
removed before anything is sent.

**Shoot the way the app tells users to:** from the doorway, wide, corners in; then a
second photo from another corner; lights on, phone still. Leave the rooms as they are —
ordinary clutter is a more honest test than a tidied room — and include a harder room
or two: dim, cluttered, furniture partly hidden. Keep people, mail and screens out of
frame.

**These photos never enter the repository.** The whole `eval-photos/` folder is
ignored by git.

## Ground truth

`eval-photos/truth.json`, one entry per **room**, keyed by the room part of the photo
names:

```json
{
  "living-room": {
    "roomName": "Living Room",
    "items": [
      { "name": "3-Seat Sofa", "lengthIn": 84, "widthIn": 36, "heightIn": 34 },
      { "name": "Coffee Table", "lengthIn": 48, "widthIn": 24, "heightIn": 18 }
    ]
  }
}
```

Measure with a tape. Ground truth derived from another model measures agreement, not
accuracy, and would validate exactly the shared priors that cause the failure mode.

- **List every item that would go on the truck.** Leave out anything built in — fitted
  wardrobes, cabinets, radiators, ceiling lights — as the detector is told to.
- **Length** is the longest side along the floor, **width** the shorter (depth),
  **height** floor to top — to the outermost points, legs and handles included, to the
  nearest inch.
- A mattress and its frame are two items; so are things stacked on each other.

- **Several identical things measured once:** `"count": 6` on the dining chair. Each
  becomes its own item, because the model is told to list one entry per physical object.
- **Name things plainly** — "Sofa", "Dresser", "Floor Lamp". The scorer pairs the model's
  items with yours by name and size, and already knows a couch is a sofa and a chest of
  drawers is a dresser. When it pairs something wrongly or misses a pairing you can see
  is right, add the model's word: `"aka": ["end table"]`.
- **Ceiling height, if it isn't 8 ft:** add `"ceilingFt": 9` to the room. It reaches the
  model exactly as the app's answer to "Are your ceilings the standard 8ft high?" does, so
  the eval measures that question as well. Leave it out for a standard 8 ft ceiling.

Keys written in the older one-photo format — `"bedroom.jpg"` — still work. The file is
checked before anything is sent: a missing height or a zero would quietly change a room's
volume and every number after it, so a live run refuses to start until it is fixed.

`scripts/eval/example-truth.json` is a complete example to copy from. Its rooms are
invented, and it is what `--mock` scores against.

## Running it

Five modes, cheapest first.

**Mock** — scores the mock detector against `example-truth.json`. Reads no photos, needs
no key, costs nothing. Proves the scoring works:

```bash
npm run eval:detect -- --mock
```

**Dry run** — prepares every photo and builds every request exactly as a live run would,
then sends nothing. Shows each photo's final size, whether it was turned upright, that its
metadata is gone, which rooms are ready, and what a live run would cost. **Run this before
every live run:**

```bash
npm run eval:detect -- --dry-run
```

**Live** — asks for the vision key, with nothing echoed, and checks it before sending
anything. Run it in your own terminal; nobody else should handle the key:

```bash
npm run eval:detect -- --label first-look
```

The eval asks rather than reading an environment variable you set by hand, because
doing that in zsh failed three ways on the first real run, each looking like "not set" or
a bare 401: a variable set but not exported, so npm never saw it; an older key still
exported in the same window; and stray characters from a copy. Pasted keys have a
terminal's paste markers and line endings taken off; a character no key contains, such
as a smart dash, is refused rather than repaired. The key stays in the process's memory
and is never written or printed — only its length and an 8-character fingerprint.
`VISION_API_KEY`, if it is set, is used instead of asking; `unset VISION_API_KEY` to be
asked. `--check-key` tests a key with two tiny requests and says what is wrong with it.

**Inventory** — a live run with no measurements at all: only photos and the ceiling height,
which the app asks before the first photo. It prints what the app would have found – every
item with its size and volume, identical objects counted together (`Dining Chair ×4`), the
ones the app would ask you to check, and the truck for the photographed rooms – and saves
the answer like any other run:

```bash
npm run eval:detect -- --inventory --ceiling-ft 9
```

`--ceiling-ft` is required, because the app will not open the camera without an answer:
`8` for standard, otherwise the real height (`9`, `9.5`, `9'6"`). Runs once per room unless
`--runs` says otherwise. Nothing in it is scored, so it says nothing about accuracy yet —
**once `truth.json` is written, score that same saved answer with `--from`.** That is worth
doing in this order: the answer was given before any measurement existed, so it cannot have
been influenced by one. The reverse risk is yours, not the model's — measure with a tape
and don't copy its numbers into `truth.json`, or the eval scores the model against itself.

**Saved run** — scores an earlier live run again, against today's `truth.json`. No key, no
cost:

```bash
npm run eval:detect -- --from eval-results/2026-09-15-10-00-first-look.json
```

Options for any of them:

| Option | What it does |
|---|---|
| `--runs <n>` | Asks the model n times per room. Default **3**, or 1 with `--inventory`. |
| `--ceiling-ft <h>` | The home's ceiling, told to the model for every room as the app does. Overrides `ceilingFt` in `truth.json`. |
| `--label <text>` | Names the saved file, so `e2-before` and `e2-after` can be found again. |
| `--compare <file>` | Prints this run beside a saved one. |
| `--max-photos <n>` | Sends only each room's first n photos. |
| `--every-answer` | Item-by-item detail for every answer, not just each room's first. |
| `--dir <folder>` | Photos somewhere other than `./eval-photos`. |

### Why three runs, and why answers are saved

The model does not give the same answer twice. One run per room is an anecdote: a sofa
missed once might be missed one time in ten or every time, and those need different
fixes. Three runs show the spread and which items are missed in how many answers.

Every answer is written to `eval-results/` the moment it arrives — the model's raw text,
timing and token counts, plus fingerprints of the photos and of the request. Three things
follow from that:

- **Scoring changes cost nothing.** Answers are read with the app's parser when they are
  scored, not when they arrive, so a corrected measurement in `truth.json`, a new `aka`, or
  a change to the parser is applied to an old run with `--from`.
- **A change can be measured before and after.** Save a run, change the prompt or the
  response budget, run again with `--compare`. The comparison says whether the photos were
  identical — if they were not, a better number may just be a better photo — and whether
  the request changed.
- **An interrupted run keeps what it paid for.** The file is rewritten after every answer.

`eval-results/` is ignored by git. It holds no photos, but it does hold an inventory of the
rooms they show.

### Waiting past the deadline

The route gives up on the model at 11 seconds. The eval waits up to two minutes instead,
and scores each answer twice: **as a user would get it**, where a late answer is a failure,
and **as the model gave it**. A request cut off at 11 seconds costs the same and teaches
nothing; a late one says whether the fix is speed or accuracy.

### What the report shows

For each room, one line per answer:

```
  answer 1   111.3 ft³   -9%   sizing -11.3 · missed +0.0 · extras +0.0   5.0s · 900 out · end_turn
```

The room's error, split into the three things that cause it, which add up to it exactly:

- **sizing** — items found but measured wrong
- **missed** — items that go on the truck and are not in the answer. The dangerous kind:
  every one shrinks the truck.
- **extras** — items in the answer that were not measured: one object counted twice from two
  angles (flagged as a likely double count), something that is not there, or something left
  out of `truth.json`

Then how far the answers spread, which items were missed in how many answers, and one
answer item by item: each pairing with the long side, short side, height and volume error.
**Read the pairings.** They are matched by name and size, which is a guess; a wrong pairing
is fixed with `aka`, and `--from` rescores for free.

The summary gives the pass-bar numbers as a user would get them, then item-level numbers:
how much of the measured volume was found at all, the median signed error of each side
(minus is too small; height is where a wrong ceiling assumption shows), and the whole
move — every room's answer added together and sized as one truck, run by run, which is the
number the app actually shows. Latency, the largest answer against the 4,000-token budget,
how many were cut off at `max_tokens`, and the real cost from the API close it.
`unparseable answer (stop_reason: max_tokens)` means the model's thinking used up the
response budget before the JSON was finished — sprint item E2.

### How much to trust a small run

One room rarely fills a van, so room-by-room truck accuracy says almost nothing: nearly
every room is "van → van". With fewer than four rooms the report says it is a smoke test,
and it is. What two rooms *can* show is direction — sides consistently short, a kind of
item missed every time, one object double counted across photos. **Don't tune the prompt
to them**: a prompt that fixes two rooms in one house has learned that house.

## Pass bar

From the error-budget analysis:

- median absolute room-level volume error **≤ 15%**
- truck size exact **≥ 85%**, within one size **≥ 98%**
- **under-sized ≤ 5%** — the binding constraint, and not symmetric with over-sizing
