import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Glyphs for the controls on a `CompactItemRow` (#102): a map pin for "set or correct
 * this item's location", a six-dot grip for the drag handle (used from Slice 3), and a
 * pencil (edit) and a tick (confirm) for the Item catalog rows (#148).
 *
 * Drawn with `react-native-svg` paths, the same approach as `ScopeIcon`: no icon font,
 * nothing to load, so they are there on first paint in both themes. Stroke / fill is
 * `textSecondary` (measured against both palettes' surfaces). Neither is the only
 * carrier of meaning: the control that holds the glyph owns the accessible name, so
 * the `Svg` is hidden from assistive tech. Not pressable themselves.
 */
const SIZE = 20;

/** `color` lets a pressed `IconButton` recolour the glyph (#156); at rest it is `textSecondary`. */
export function PinIcon({ color }: { color?: string } = {}) {
  const tokens = useTheme();
  const stroke = color ?? tokens.color.textSecondary;

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Circle
        cx={12}
        cy={9.5}
        r={2.5}
        stroke={stroke}
        strokeWidth={2}
        fill="none"
      />
    </Svg>
  );
}

export function EditIcon({ color }: { color?: string } = {}) {
  const tokens = useTheme();
  const stroke = color ?? tokens.color.textSecondary;

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M4 20l1-4L16 5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path d="M14 7l3 3" stroke={stroke} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function CheckIcon({ color }: { color?: string } = {}) {
  const tokens = useTheme();
  const stroke = color ?? tokens.color.textSecondary;

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const DOTS = [
  [9, 6],
  [15, 6],
  [9, 12],
  [15, 12],
  [9, 18],
  [15, 18],
];

export function DragHandleIcon() {
  const tokens = useTheme();

  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {DOTS.map(([cx, cy]) => (
        <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.75} fill={tokens.color.textSecondary} />
      ))}
    </Svg>
  );
}
