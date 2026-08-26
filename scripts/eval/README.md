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

1. **Room-level volume error** — median absolute, plus signed P10/P90 so systematic
   bias is visible. Bias matters far more than spread: random error averages over
   the volume-weighted item count, bias does not.
2. **Truck-size accuracy** — does the predicted truck match the measured one, and
   critically, **how often is it too small**. Those are not symmetric errors.
3. **Volume-weighted recall** — how much measured volume the detector missed
   entirely. Missed items are 100% under-size, the dangerous direction.

## Running it

Dry run against the mock detector — no API key, no cost, proves the harness works:

```bash
npm run eval:detect -- --mock
```

Against a real model, once you have photos and ground truth:

```bash
VISION_API_KEY=sk-ant-... npm run eval:detect -- --dir ./eval-photos
```

## Ground truth

`eval-photos/truth.json`, one entry per photo. Measure with a tape — ground truth
derived from another model measures agreement, not accuracy, and would validate
exactly the shared priors that cause the failure mode.

```json
{
  "living-room.jpg": {
    "roomName": "Living Room",
    "items": [
      { "name": "3-Seat Sofa", "lengthIn": 84, "widthIn": 36, "heightIn": 34 },
      { "name": "Coffee Table", "lengthIn": 48, "widthIn": 24, "heightIn": 18 }
    ]
  }
}
```

Twenty photos across four or five real rooms is enough to see whether this works at
all. It is not enough to tune thresholds — for that, see the 150-room set the
research proposes.

## Pass bar

From the error-budget analysis:

- median absolute room-level volume error **≤ 15%**
- truck size exact **≥ 85%**, within one size **≥ 98%**
- **under-sized ≤ 5%** — the binding constraint, and not symmetric with over-sizing
