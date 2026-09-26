# Dog portrait prints — project brief

Written 2026-09-26 in a Claude Code cloud session. A new product, not a Loadsy
feature: the customer photographs their dog, the app turns the photographs into
a printable figurine, we print it on Bambu Lab A1 printers with the AMS Lite and
post it to them. Up to four colours per print, because four is what the AMS Lite
holds.

Bambu's own website and wiki are blocked from the cloud container, so every
printer and filament fact below was checked against third-party guides that
reproduce Bambu's compatibility table, and each is marked **verified** or
**verify on the Mac**. Nothing marked "verify" should reach a customer-facing
menu until someone has opened the wiki table on Josh's Mac and confirmed it.
Nothing in this file is a commitment until the Chairman makes it one; the
decisions it needs are listed at the end and in `docs/leadership-standup.md`.

`dogprint/materials.ts` is the machine-readable form of the materials menu, and
`__tests__/dogprintMaterials.test.ts` pins the constraints that matter: every
material we offer feeds through the AMS Lite, nothing offered needs an enclosure
the A1 does not have, and no order can ask for more colours than the printer has
slots. Change the menu there and the test says whether the printer still agrees.

---

## What the customer sees

1. **Photograph the dog.** Five guided shots – front, left, right, back, and
   from above at a slant – against a plain floor or wall, dog standing or
   sitting still. The same capture discipline Loadsy uses (brightness and
   sharpness measured on-device, retake prompted before upload) transfers
   directly; `src/domain/imageStats.ts` and `src/domain/keyframes.ts` are the
   parts to lift.
2. **See the figurine.** A rotatable preview of the generated mesh, already
   coloured with the palette the printer will actually use. The preview is the
   contract: what they approve is what gets printed, in the real filament
   colours, not the photograph's colours.
3. **Choose size, material and colours.** Three sizes, a material from the menu
   below, and up to four colours picked from that material's swatches. The app
   proposes a palette from the photographs and shows the purge cost of each extra
   colour, so a customer who adds a fourth colour for the collar sees why it costs
   more.
4. **Order.** Price, turnaround, shipping. We print, check it, and post it.

Two things are deliberately not offered: a "surprise me" order without a preview
(the mesh generator will occasionally produce a dog with five legs, and the
customer must be the one who catches it), and free-text colour requests (every
colour is a filament we stock, chosen by swatch).

## How it is made

```
photos ──▶ image-to-3D API ──▶ GLB mesh + texture
                                     │
                     server post-processing (ours)
                     • make watertight, decimate, scale
                     • add plinth with name, orient for printing
                     • quantise texture to ≤4 stocked filament colours
                     • write 3MF with per-triangle colour groups
                                     │
                    Bambu Studio CLI, headless, in a container
                     • load A1 machine, process and filament presets
                     • slice → .gcode.3mf, grams, hours, purge grams
                                     │
                          preview + price ──▶ order ──▶ print farm
```

**Mesh generation is bought, not built.** In September 2026 the hosted
image-to-3D services all accept several photographs of one object and return a
textured mesh: Tripo's multiview endpoint takes two to four images, Meshy takes
one to four views and ships a printability check and repair step, and Hunyuan3D
3.1 is open weights and takes up to eight views. The choice is an evaluation, not
an argument: run the same twenty dogs through each and count how many meshes
print without hand repair. The pipeline must treat the generator as swappable,
the way Loadsy's `/v1/detect` treats its vision model.

**Colour is decided by us, not the generator.** Generated textures are
photographic; a printer with four slots needs every triangle assigned to one of
at most four filaments. The server quantises the texture to the material's real
swatch colours, with no dithering (dithering at 0.4 mm produces speckle, not
tone), and the customer approves the result. The 3MF Materials Extension carries
one colour group per triangle, and Bambu Studio maps groups to AMS slots by
order, group 0 to slot 1 and so on, not by hex value – so the order of colours in
the file is the order of spools in the AMS, and the print farm must load them in
that order. This is the single easiest way to ship a dog with its markings
inverted; the slicing step should verify slot order against the order file
before a job is released.

**Slicing is headless.** Bambu Studio's CLI loads machine, process and filament
presets from JSON, slices a plate and exports a `.gcode.3mf` the printer accepts
directly. It runs unmodified in Docker; Printago and Bambuddy both run print
farms on exactly this. Each slice writes hundreds of megabytes of temporary
files, so every job runs in its own temporary directory that is deleted when the
slice finishes. The sliced file gives filament grams and hours, which is where
the price comes from.

**Retention is the opposite of Loadsy's.** Loadsy's backend keeps nothing; this
one must keep the mesh and the sliced file until the parcel is delivered, and
the photographs at least until the customer approves the preview. Photographs of
a dog are usually photographs of a home, and sometimes of a person. The privacy
label, retention period and deletion path are product decisions, not
implementation details, and they are on the decision list.

## The printer, and what it rules out

Bambu Lab A1 with AMS Lite. Verified against third-party summaries of Bambu's
specification sheet:

| | |
|---|---|
| Build volume | 256 × 256 × 256 mm |
| Hotend / bed maximum | 300 °C / 100 °C |
| Enclosure | none – an open frame |
| Nozzle as shipped | 0.4 mm stainless steel; hardened steel hotend is an optional part costing roughly a fast-food meal |
| AMS Lite | four spools, so four colours per print without a manual swap |

The open frame is the constraint that matters. ABS, ASA, PC and the nylons warp
and crack without an enclosure, and Bambu lists them as "not recommended" for
the A1. That leaves PLA, PETG and TPU, and of those the AMS Lite feeds only the
stiff ones. The figurine product lives entirely inside PLA and PETG, and that is
fine: a figurine sits on a shelf.

## Materials menu

**One material family per print.** PLA and PETG do not bond to each other, so
the four slots hold four colours of *one* material, never a mix. The menu is a
choice of material, then a choice of up to four of its colours.

### Standard – offered from day one, stainless nozzle, verified AMS Lite compatible

| Material | Why it is on the menu | Watch for |
|---|---|---|
| **PLA Matte** – the default | Hides layer lines better than any other finish, which on a fur texture is the difference between "a print" and "a figurine". Widest colour range after Basic. | Slightly more brittle than Basic; thin tails and ears need a minimum thickness rule in post-processing. |
| **PLA Basic** | The widest palette Bambu makes and the cheapest spool, so the broadest choice of markings colours. Glossier than Matte, so layer lines show more. | Nothing. It is the safe choice. |
| **PLA Silk+** | A high-gloss, near-metallic finish for a gift or trophy look. Verified AMS Lite compatible. | Must print the outer wall slowly; more purge to change colour cleanly. Not for fine fur detail. |
| **PETG HF** | Survives a hot car dashboard, a sunny windowsill or a garden, where PLA softens. | Stringier, so fine detail is worse; needs the textured plate. Offer it as "outdoor / dashboard", not as a finish. |

### Specialty – needs the hardened steel hotend fitted; AMS Lite status to verify on the Mac

Bambu recommends a 0.4 mm hardened steel nozzle for every particle-filled PLA,
because the particles wear a stainless nozzle out in tens of hours. Fitting the
hardened hotend to every printer costs little and removes a whole class of
"why is the nozzle oval" failures, so the recommendation is to fit it
everywhere and treat the stainless nozzle as the spare.

| Material | What it offers | Status |
|---|---|---|
| **PLA Sparkle** | Glitter fleck; popular for "sparkly dog" gifts. | Verified AMS Lite compatible in two guides; hardened nozzle. |
| **PLA Marble** | Stone look for a plinth or a monochrome bust. | Hardened nozzle verified; AMS Lite compatibility conflicting between guides – **verify**. |
| **PLA Wood** | Warm, sandable, hides layers well; a single-colour "carved" figurine. | Not on any AMS Lite compatibility list found – **verify**, expect "external spool only", which means single colour. |
| **PLA Galaxy / PLA Metal** | Metallic fleck finishes. | Hardened nozzle; AMS Lite compatibility – **verify**. |

### Not offered, and why

| Material | Reason |
|---|---|
| **PLA Glow** | Bambu says do not feed it through the AMS Lite – it is hard and rough and causes feed failures. Abrasive, too. A single-colour glow figurine from the external spool is possible later; it is not a four-colour material. |
| **TPU 95A HF** | Not AMS or AMS Lite compatible. Bambu's separate "TPU for AMS" is designed to feed through the AMS Lite, so a *squishy* single-material dog toy is a possible second product; it is not a colour option for the figurine. |
| **PLA-CF / PETG-CF** | Feed through the AMS Lite, but come in dark colours only, need the hardened nozzle, and wear the AMS's PTFE tubes. Nothing a figurine needs. |
| **PLA Silk Multi-Color** | Bambu does not recommend it on A-series printers – the filament can rotate and the colour transitions come out uneven. |
| **ABS, ASA, PC, PA** | Need an enclosure the A1 does not have. |
| **Support for PLA/PETG** | A real option, but it is a *slot*, not a colour: using breakaway support material leaves three colour slots. See below. |

## The four-colour budget

Four slots does not mean four colours are free. Every change of filament on the
A1 purges around six grams with default settings, four to five when tuned, and
takes time. A figurine whose four colours all appear in every layer – a spotted
dog with a coloured collar and a plinth in a fourth colour – changes filament
three times per layer, and a 120 mm figurine at 0.2 mm layers is six hundred
layers. That is several kilograms of purged filament for a print that itself
weighs under a hundred grams: the purge costs more than the dog.

This is why the design step, not the customer, decides how colours are laid
out, and why the app shows the purge cost of each colour before the order is
placed. Rules the post-processing step follows:

- **Band colours by height where the dog allows it.** A plinth in colour two
  under a dog in colour one costs one change in the whole print. Markings that
  span the whole height cost a change on every layer they touch.
- **Prefer two colours.** Body plus markings covers most dogs. Offer four, price
  four honestly, and let the purge estimate do the persuading.
- **Flush into infill and into the object.** Bambu Studio can direct purged
  filament into the infill and interior of the model instead of the waste chute,
  which cuts purge grams substantially and is free to enable.
- **Batch orders by palette.** The purge per layer is the same whether the plate
  holds one dog or four, so four dogs sharing a palette on one plate cost a
  quarter of the purge each. The print farm queue should group orders by
  material and colour set, not by arrival time.
- **Support material spends a slot.** Design out supports instead – a plinth,
  a sitting or standing pose with legs under the body, tail against a leg.
  Where a pose genuinely needs support, print PLA-on-PLA tree supports in the
  body colour rather than spend a colour slot on breakaway material.

## Sizes and price inputs

Three sizes, all comfortably inside the 256 mm cube, so a plate holds several:

| Size | Height | Rough filament, solid dog at 15% infill |
|---|---|---|
| Small | 80 mm | 25–40 g |
| Medium | 120 mm | 60–90 g |
| Large | 160 mm | 130–200 g |

Filament is about two cents a gram for PLA Basic and Matte, more for Silk+ and
the specialty finishes. At those weights the material in a single-colour dog is
cheap; purge, print hours, handling, QA, packaging and postage are the cost.
Price is a Chairman decision; the inputs the pipeline can supply per order are
sliced grams, purge grams, print hours and material.

## What already exists in this repository that carries over

- **Guided capture with quality gating** – `app/capture.tsx`,
  `src/domain/imageStats.ts`, `src/domain/keyframes.ts`. Brightness and focus
  measured on-device before upload.
- **A pass-through API pattern that keeps the vendor key off the device** –
  `app/v1/detect+api.ts`. The image-to-3D call is the same shape.
- **The zero-dependency domain convention** – pure TypeScript, tested by Node's
  runner with nothing installed. `dogprint/materials.ts` follows it.
- **Tier gating and the demo mode** – `src/billing/`, `src/demo/` – if the
  product ever needs a free preview and a paid print.

Whether this becomes a second app, a second flow in the Loadsy app, or its own
repository is the first decision below. The brief and the catalogue live here
for now because this is where the conventions are.

## Decisions needed

1. **Where it lives.** A new repository (recommended: a different product, a
   different privacy story, a different backend), or a second app in this one.
2. **Name.**
3. **Which mesh generator to evaluate first** – Tripo, Meshy, or self-hosted
   Hunyuan3D. Recommended: run all three on the same twenty dogs from the Mac,
   score printability without hand repair, then commit.
4. **Fit the hardened steel hotend to every printer.** Recommended yes; it is
   cheap and it unlocks the specialty menu.
5. **Photo and mesh retention** – how long, and the deletion path. Decides the
   privacy label.
6. **Price** – by size, by material, by colour count, and whether a fourth
   colour is a flat surcharge or priced from the purge estimate.
7. **Turnaround promise**, given batching by palette delays a lone four-colour
   order until a plate fills or a deadline passes.
8. **Verify on the Mac** the four "verify" rows above against Bambu's wiki
   compatibility table before any of them is offered.

## Sources consulted

Bambu's own pages were blocked from the container. The facts above come from
SimplyPrint's A1 compatibility page, the 3DPros printer database, the Filamino
and FilamentSpecs Bambu filament guides, the NorthForged AMS Lite compatibility
guide, Siraya Tech's TPU-on-AMS guide, Bambu community forum threads on TPU and
PLA compatibility, the filamentcalcs purge-waste guide, the Bambu Studio GitHub
wiki's command-line page, and Printago's and Bambuddy's headless-slicing
documentation.
