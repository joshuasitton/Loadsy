/**
 * Limits that both ends of the capture pipeline have to agree on.
 *
 * MAX_PHOTOS lived in two places — `MAX_ANGLES` in app/capture.tsx and
 * `MAX_PHOTOS` in app/v1/detect+api.ts — with a comment in the client saying it
 * mirrored the server. A comment is not a mechanism. If the two had drifted, the
 * client would have offered a fifth angle and the route would have answered 400
 * on a capture the user had already spent four photographs building.
 *
 * The route is bundled from this repository, so it can import this the same way a
 * screen does. One definition, and the mirror is gone.
 */

/**
 * Photographs accepted per room.
 *
 * Every extra angle is billed and adds latency against the client's deadline, and
 * the returns fall off fast — the fourth shot of a room mostly re-photographs what
 * the first three already showed. Four is generous for a room and still fits
 * inside the upstream timeout.
 */
export const MAX_PHOTOS = 4;
