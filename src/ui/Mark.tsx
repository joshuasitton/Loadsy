import { Platform } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import {
  CORNER_R,
  GRID,
  LAST,
  MARK_GROUND,
  MARK_LAST,
  MARK_PIECE,
  PIECES,
  TILE_R,
  type Box,
} from './markGeometry';

/**
 * The Loadsy mark, drawn from the same numbers as the app icon.
 *
 * `tile` is the difference between a logo and an app icon: on the green tile it
 * is the thing on the home screen, and without it the mark can sit on any light
 * surface. Both come from one geometry — see `markGeometry.ts` for why that
 * matters.
 */
export function Mark({
  size = 40,
  tile = true,
  accessibilityLabel,
}: {
  size?: number;
  /** Draw the green ground behind it. False gives the pieces alone, for light surfaces. */
  tile?: boolean;
  accessibilityLabel?: string;
}) {
  // Off the tile the white pieces would vanish into a white screen, so they take
  // the ground's green instead. The last piece is ink either way.
  const piece = tile ? MARK_PIECE : MARK_GROUND;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} {...a11y(accessibilityLabel)}>
      {tile ? <Rect width={GRID} height={GRID} rx={TILE_R} fill={MARK_GROUND} /> : null}
      {PIECES.map((box) => (
        <Rect
          key={`${box.x0},${box.y0}`}
          {...rect(box)}
          rx={CORNER_R}
          fill={box === LAST ? MARK_LAST : piece}
        />
      ))}
    </Svg>
  );
}

function rect(box: Box) {
  return { x: box.x0, y: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 };
}

/**
 * Accessibility props that the running platform actually reads.
 *
 * react-native-svg forwards unknown props straight to the DOM on web, so the
 * React Native names arrive as invalid attributes and React logs an error for
 * each one — which is how `accessibilityElementsHidden` and
 * `importantForAccessibility` announced themselves here. layout-view.tsx hit the
 * same edge from the other direction, with the label rather than the hiding.
 *
 * Unlabelled means decorative: the wordmark beside the mark already says
 * "Loadsy", and a screen reader announcing the name twice is noise.
 */
function a11y(label: string | undefined): Record<string, unknown> {
  if (Platform.OS === 'web') {
    return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
  }
  return label
    ? { accessible: true, accessibilityRole: 'image', accessibilityLabel: label }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };
}
