import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  CORNER_R,
  GRID,
  MARK_INK,
  MARK_PINE,
  MARK_WHITE,
  RESERVE,
  TILE_R,
  TRUCK_BODY,
  TRUCK_CAB,
  TRUCK_R,
  TRUCK_WHEELS,
  markPath,
} from './markGeometry';

/**
 * The Loadsy mark, drawn from the same numbers as the app icon.
 *
 * `tile` is the difference between a logo and an app icon: on the ink tile it is
 * the thing on the home screen, and unmounted it is a mark that can sit on any
 * light surface. Both come from one geometry — see `markGeometry.ts` for why
 * that matters.
 */
export function Mark({
  size = 40,
  tile = true,
  accessibilityLabel,
}: {
  size?: number;
  /** Draw the ink ground behind it. False gives the mark alone, for light surfaces. */
  tile?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`} {...a11y(accessibilityLabel)}>
      {tile ? <Rect width={GRID} height={GRID} rx={TILE_R} fill={MARK_INK} /> : null}
      <Path d={markPath()} fill={tile ? MARK_WHITE : MARK_INK} />
      <Rect
        x={RESERVE.x0}
        y={RESERVE.y0}
        width={RESERVE.x1 - RESERVE.x0}
        height={RESERVE.y1 - RESERVE.y0}
        rx={CORNER_R}
        fill={MARK_PINE}
      />
      {/*
        Painted in ink rather than masked out. On the tile the ground IS ink, so
        this is a true knockout; off the tile the L is ink too, so a dark truck on
        the green square reads the same. One fill covers both, and an SVG <Mask>
        would have needed a unique id per instance for no visible gain.
      */}
      <Rect
        x={TRUCK_BODY.x0}
        y={TRUCK_BODY.y0}
        width={TRUCK_BODY.x1 - TRUCK_BODY.x0}
        height={TRUCK_BODY.y1 - TRUCK_BODY.y0}
        rx={TRUCK_R}
        fill={MARK_INK}
      />
      <Rect
        x={TRUCK_CAB.x0}
        y={TRUCK_CAB.y0}
        width={TRUCK_CAB.x1 - TRUCK_CAB.x0}
        height={TRUCK_CAB.y1 - TRUCK_CAB.y0}
        rx={TRUCK_R}
        fill={MARK_INK}
      />
      {TRUCK_WHEELS.map((wheel) => (
        <Circle key={wheel.cx} cx={wheel.cx} cy={wheel.cy} r={wheel.r} fill={MARK_INK} />
      ))}
    </Svg>
  );
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
