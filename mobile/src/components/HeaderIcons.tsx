import Svg, { Path } from 'react-native-svg';

/**
 * Glyphs for the circular header controls (#157): a back chevron and a close X, drawn at
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

export function CloseIcon({ color }: { color: string }) {
  return <HeaderGlyph color={color} d="M7 7l10 10M17 7L7 17" />;
}
