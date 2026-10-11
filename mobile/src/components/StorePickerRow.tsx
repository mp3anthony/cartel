import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';
import { StoreBadge } from './StoreBadge';
import { IconButton } from './ui';

const ICON_SIZE = 20;
/** The row's border width. Constant, so selecting never shifts the layout. */
const BORDER_WIDTH = 2;

/** An open book, drawn like `PinIcon` in `RowIcons.tsx`: same size, stroke and caps. */
function BookIcon({ color }: { color: string }) {
  return (
    <Svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * One Store on the Stores screen (#147): the whole row picks the Store, and a book icon
 * at the right end opens that Store's Item catalog.
 *
 * The book is a sibling of the select control, not nested inside it: two nested
 * Pressables would both react to one tap (see `CheckTarget` in `ui.tsx`).
 *
 * Selection shows as a 2px accent border. The border is always 2px wide and only its
 * colour changes (surface at rest, accent when selected), so the row never changes
 * size. The border appearing is a cue that does not rely on colour alone. There is no
 * `overflow: 'hidden'` on the container, because that clips keyboard focus rings on
 * web; the select control carries matching left-corner radii instead so its press tint
 * follows the container's rounded corners.
 *
 * This is not `Row` from `ui.tsx`: `Row` is the whole Pressable, and shared primitives
 * are not widened for one caller. Not Home's `StoresRow` either, which is a separate
 * component.
 */
export function StorePickerRow({
  chain,
  label,
  storeName,
  selected,
  onSelect,
  onOpenCatalog,
}: {
  chain: string | null | undefined;
  label: string;
  storeName: string;
  selected: boolean;
  onSelect: () => void;
  onOpenCatalog: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={[styles.container, selected && styles.containerSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={selected ? `${label}, selected` : label}
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={({ pressed }) => [styles.select, pressed && styles.selectPressed]}
      >
        <StoreBadge chain={chain} />
        <Text numberOfLines={1} style={styles.label}>
          {label}
        </Text>
      </Pressable>
      <IconButton
        icon={(color) => <BookIcon color={color} />}
        accessibilityLabel={`View catalog for ${storeName}`}
        onPress={onOpenCatalog}
      />
    </View>
  );
}

function createStyles(tokens: Tokens) {
  const innerRadius = tokens.radius.md - BORDER_WIDTH;

  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: BORDER_WIDTH,
      borderColor: tokens.color.surface,
    },
    containerSelected: {
      borderColor: tokens.color.accent,
    },
    select: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTarget,
      paddingLeft: tokens.space.md,
      paddingVertical: tokens.space.xs,
      borderTopLeftRadius: innerRadius,
      borderBottomLeftRadius: innerRadius,
    },
    selectPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    label: {
      flex: 1,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
    },
  });
}
