/**
 * The size and quality every photo is sent to the detector at.
 *
 * Separate from `prepareUpload.ts` for one reason: that file imports
 * `expo-image-manipulator`, a native module plain Node cannot load, and the
 * detection eval has to prepare its photos to exactly these numbers without it.
 * An eval that sent full-resolution originals would show the model more detail
 * than any user's photo carries, and report accuracy the app cannot deliver.
 */

/**
 * Long edge of the uploaded image, in pixels.
 *
 * Not arbitrary. 1568x1176 divides evenly by 28, the tile size vision models
 * quantise to, so nothing is spent padding a partial tile. And deliberately not
 * smaller: scale is inferred from small reference objects – an outlet plate, a door
 * casing – and those are exactly what disappears first when a room photo shrinks.
 */
export const UPLOAD_LONG_EDGE = 1568;

/**
 * JPEG quality for the upload. 0.8 sits above the point where compression
 * artifacts start eating fine edges, which is what the detector reads to size
 * things.
 */
export const UPLOAD_QUALITY = 0.8;
