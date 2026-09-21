/**
 * How to photograph a room so the model can size it.
 *
 * Shown on the capture screen before the first photo, and on the help page. One list,
 * because advice kept in two places drifts, and the copy on the help page would be the
 * one nobody updates. Pure: nothing here knows about a screen.
 */
export interface PhotoTip {
  title: string;
  body: string;
}

export const PHOTO_TIPS: readonly PhotoTip[] = [
  { title: 'Shoot from the doorway', body: 'A wide frame beats a close-up — Loadsy needs the whole room to judge scale.' },
  { title: 'Then one from another corner', body: 'A second angle shows what the first hid, and lets Loadsy check its own sizes. It is the single biggest thing you can do for accuracy.' },
  { title: 'Get the corners in', body: 'Corners give the walls a reference, which is how furniture depth gets estimated.' },
  { title: 'Turn the lights on', body: 'Bright and still. A dark or blurry photo means guessy measurements.' },
] as const;
