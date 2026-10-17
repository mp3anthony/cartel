import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { chainColor, chainRingColor } from '../theme/chainColors';
import { pressScale, useReduceMotion } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

export type StoresRowEntry = { id: string; name: string; chain: string | null };

const CIRCLE = 52;
// Wide enough that the longest single word in a catalog Store name ("Christchurch") fits on one line at caption size (#223).
const TILE_WIDTH = 96;

/**
 * Home's Stores row (#144): the stores the user shops at as large chain-colour circles
 * with the name below, scrolling sideways. A tap starts or continues a shop there (the
 * caller decides how); it does not open the Store page. The circle mirrors `StoreBadge`'s
 * rules at a larger size (that component stays 16pt, no size prop): neutral border colour
 * for an unknown chain, a coloured ring where the chain needs one, and an outline for
 * PAK'nSAVE, whose yellow has near-zero contrast on a light surface. Names wrap at
 * spaces only (#214): tiles keep a fixed width, set so no catalog word breaks (#223), and
 * are top-aligned, so the row grows to the tallest name.
 */
export function StoresRow({
  stores,
  busyId,
  onPress,
}: {
  stores: StoresRowEntry[];
  busyId: string | null;
  onPress: (id: string) => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const reduceMotion = useReduceMotion();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {stores.map((store) => {
        const ring = chainRingColor(store.chain);
        const busy = busyId === store.id;
        return (
          <Pressable
            key={store.id}
            accessibilityRole="button"
            accessibilityLabel={`${store.name}, start or continue a shop`}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => onPress(store.id)}
            style={({ pressed }) => [styles.tile, pressScale(pressed, reduceMotion)]}
          >
            <View
              style={[
                styles.circle,
                { backgroundColor: chainColor(store.chain) ?? tokens.color.border },
                // Four Square and FreshChoice reds are nearly New World's, so they get a
                // coloured ring to tell the three apart (same rule as StoreBadge).
                ring !== null && [styles.ringed, { borderColor: ring }],
                // PAK'nSAVE's yellow needs an outline to stay visible on a light
                // surface; every other brand colour has enough contrast on its own.
                store.chain === 'paknsave' && styles.outlined,
              ]}
            >
              {busy ? <ActivityIndicator color={tokens.color.textPrimary} /> : null}
            </View>
            <Text style={styles.name}>
              {store.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    content: {
      alignItems: 'flex-start',
      gap: tokens.space.sm,
    },
    tile: {
      width: TILE_WIDTH,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      gap: tokens.space.xs,
    },
    circle: {
      width: CIRCLE,
      height: CIRCLE,
      borderRadius: tokens.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringed: {
      borderWidth: 3,
    },
    outlined: {
      borderWidth: 1,
      borderColor: tokens.color.textPrimary,
    },
    name: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.caption,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
  });
}
