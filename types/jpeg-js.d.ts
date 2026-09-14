/**
 * The slice of jpeg-js that src/media/frameSignals.ts uses.
 *
 * Declared here rather than taken from the package because this is the entire
 * surface we depend on, and writing it down is what stops a future version
 * quietly widening it. It also means `tsc --noEmit` gives the same answer before
 * and after `npm install`, which matters in this project: most of the reasoning
 * about this code happens in an environment that has no npm registry, and a
 * typecheck that only passes on one machine is not a typecheck.
 *
 * jpeg-js is a pure-JavaScript decoder with no native module and no config
 * plugin, which is why it is the dependency here: expo-image-manipulator can
 * resize and re-encode a frame, but nothing in the Expo SDK will hand back raw
 * pixels, and measuring focus requires the pixels.
 */
declare module 'jpeg-js' {
  export interface RawImageData {
    width: number;
    height: number;
    /** RGBA, row-major, four bytes per pixel. */
    data: Uint8Array;
  }

  export function decode(
    jpegData: Uint8Array | ArrayBuffer,
    options?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ): RawImageData;
}
