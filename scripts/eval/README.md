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

- **Ceiling height, if it isn't 8 ft:** add `"ceilingFt": 9` to the room. It reaches the
  model exactly as the app's answer to "Are your ceilings the standard 8ft high?" does, so
  the eval measures that question as well. Leave it out for a standard 8 ft ceiling.

Keys written in the older one-photo format — `"bedroom.jpg"` — still work.

## Running it

Three modes, cheapest first.

**Mock** — scores the mock detector. Reads no photos, needs no key, costs nothing. Proves
the scoring works:

```bash
npm run eval:detect -- --mock
```

**Dry run** — prepares every photo and builds every request exactly as a live run would,
then sends nothing. Shows each photo's final size, whether it was turned upright, that its
metadata is gone, which rooms are ready, and an estimated cost. **Run this before every
live run:**

```bash
npm run eval:detect -- --dry-run
```

**Live** — needs the vision key in your own terminal; nobody else should handle it:

```bash
VISION_API_KEY=sk-ant-... npm run eval:detect
```

Add `--dir <folder>` to any of them to point somewhere other than `./eval-photos`.

A live run reports each room's error and truck, then the pass-bar numbers, latency p50 and
p95 against the route's 11-second limit, and the real token count and cost from the API.
Rooms that fail are listed with the reason. `unparseable answer (stop_reason: max_tokens)`
means the model's thinking used up the response budget before it finished the JSON —
sprint item E2.

The two files that shipped in `eval-photos/` are 22-byte placeholders, not photos. Mock
mode uses them; the dry run and a live run say so and refuse to send them.

## Pass bar

From the error-budget analysis:

- median absolute room-level volume error **≤ 15%**
- truck size exact **≥ 85%**, within one size **≥ 98%**
- **under-sized ≤ 5%** — the binding constraint, and not symmetric with over-sizing
