# Own-vehicle research – what to fetch, and how to enter it

The Your Own Vehicle card (README, "Your own vehicle") is only as good as
`src/domain/ownVehicles.ts`, and at first commit that list has one entry. This is the work
to fill it. It has to run somewhere with open web access – Josh's Mac. The cloud session
that built the feature was refused by every manufacturer site it tried, and a search
engine's summary is not a source: the one summary it did get gave a 6.5 ft pickup bed as
68.9 in long, which is shorter than the 5.5 ft bed beside it.

## The rule

Every number is read on a published page, and the page is cited on the entry. Where two
sources disagree, the smaller figure goes in, with both cited. A vehicle whose figures are
not published is left out – "Mine isn't listed" and the truck is a better answer than a
guess, because a car said to fit that does not costs the person their moving day.
`__tests__/ownVehicle.test.ts` refuses an entry without a source, a car without an opening,
or a car whose inside is taller than its opening.

## What each entry needs

| Field | Pickup | Minivan, SUV, car |
|---|---|---|
| `lengthIn` | bed length at the floor, tailgate closed | floor length behind the front seats, rear rows folded or stowed |
| `widthIn` | width between the wheel wells | width between the wheelhouses |
| `loadHeightIn` | `OPEN_BED_LOAD_HEIGHT_IN` (42 in) – Loadsy's rule, not a spec | the lower of the cargo height and the opening height |
| `door` | none – a bed loads from above | liftgate or hatch opening, width and height |
| `seats` | `null` | which rows are folded, as the figure was published – "2nd and 3rd rows stowed" |
| `years` | the model years the published figures cover | same |

Cargo volume in cubic feet is **not** one of these, and is never a substitute. It is
measured with luggage-sized blocks (SAE J1100) and says nothing about whether a dresser
passes the tailgate.

## Where to look, in order

Makers' media sites publish the most complete tables – floor length, wheelhouse width and
opening sizes are usually on the "specifications" or "dimensions" tab. The consumer site
often gives cubic feet only.

Start with the pickups and minivans: their figures are published most completely, and
they are what someone moving themselves most often drives.

**Pickups**

- Ford F-150, 5.5 ft and 6.5 ft beds – the F-150 technical specifications PDF on
  fromtheroad.ford.com (the 8 ft bed's source in `smallVehicles.ts` is the 2026 edition)
- Chevrolet Silverado 1500, short and standard beds – media.chevrolet.com, specifications
  tab; check whether the GMC Sierra 1500's beds are the same and say so if they are
- Ram 1500, 5 ft 7 in and 6 ft 4 in beds – ramtrucks.com specifications, or the Stellantis
  media site
- Toyota Tacoma, 5 ft and 6 ft beds; Toyota Tundra, 5.5 ft and 6.5 ft beds –
  pressroom.toyota.com, specifications
- Ford Maverick – fromtheroad.ford.com
- Honda Ridgeline – hondanews.com, specifications

**Minivans**

- Chrysler Pacifica and Voyager – media.stellantisnorthamerica.com, specifications
- Honda Odyssey – hondanews.com
- Toyota Sienna – pressroom.toyota.com
- Kia Carnival – kiamedia.com

**SUVs and crossovers** – many publish only cubic feet; list the ones that do not

- Toyota RAV4, Highlander – pressroom.toyota.com
- Honda CR-V, Pilot – hondanews.com
- Chevrolet Equinox, Tahoe – media.chevrolet.com
- Ford Explorer, Expedition – media.ford.com
- Jeep Grand Cherokee – media.stellantisnorthamerica.com
- Subaru Outback, Forester – media.subaru.com
- Hyundai Tucson – hyundainews.com; Kia Telluride – kiamedia.com
- Nissan Rogue – usa.nissannews.com
- Tesla Model Y – tesla.com specifications

**Cars and hatchbacks** – the least likely to be published; try, and leave out what is not

- Honda Civic hatchback, Subaru Crosstrek, Toyota Prius, Mazda CX-30

## Entering one

Add it to `OWN_VEHICLES` in `src/domain/ownVehicles.ts` with a comment quoting the figures
as the page gives them, as `smallVehicles.ts` does, then run `npm test`. The picker groups
entries by `body` and shows them in list order, so put the most common first within a body
type.
