import Svg, { Circle, Path } from 'react-native-svg';

/**
 * Glyphs for the circular header controls (#157) and the bottom pill's Settings item: a back chevron and a close X, drawn at
 * the weight of the HS site's header icons. `react-native-svg` paths like `RowIcons`, so
 * nothing loads and both themes work on first paint. `color` is required: the control
 * recolours the glyph on press, so there is no sensible default. The control that holds
 * the glyph owns the accessible name, so the `Svg` is hidden from assistive tech.
 */
const SIZE = 18;

function HeaderGlyph({ color, d }: { color: string; d: string }) {
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
        d={d}
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function BackIcon({ color }: { color: string }) {
  return <HeaderGlyph color={color} d="M14.5 6l-6 6 6 6" />;
}

/** The gear (#158): a dashed outer ring for the teeth, a ring and a hub; same as the design reference. Drawn as the Settings item in the bottom pill (`BottomNav`). */
export function SettingsIcon({ color }: { color: string }) {
  return (
    <Svg
      width={SIZE}
      height={SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={12}
        cy={12}
        r={6.2}
        stroke={color}
        strokeWidth={3.2}
        strokeDasharray="2.43 2.43"
        strokeLinecap="butt"
        fill="none"
      />
      <Circle cx={12} cy={12} r={4.4} stroke={color} strokeWidth={1.9} fill="none" />
      <Circle cx={12} cy={12} r={1.6} stroke={color} strokeWidth={1.9} fill="none" />
    </Svg>
  );
}

export function CloseIcon({ color }: { color: string }) {
  return <HeaderGlyph color={color} d="M7 7l10 10M17 7L7 17" />;
}
