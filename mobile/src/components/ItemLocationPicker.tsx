import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { foldItemName } from '../lib/itemName';
import {
  isSameAsCurrent,
  nudgeAisle,
  parseAisleDraft,
  pickerChips,
} from '../lib/itemLocationPicker';
import {
  aisleLabel,
  LAYOUT_ORDER_SEQUENCE,
  MAX_AISLE,
  parseLayoutLabel,
} from '../lib/layoutOrder';
import { pressFill, pressScale, useReduceMotion } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';
import { CheckIcon } from './RowIcons';
import { IconButton, PrimaryButton } from './ui';

const parse = (label: string | null) => parseLayoutLabel(label, foldItemName);

/**
 * The Item location picker (#154), shown in a `CompactItemRow`'s `editor` slot wherever an
 * Item location is set: Shopping Mode, the list screen's Location pin and the Item
 * catalog's edit. Locations are picked, never typed: one chip per entry of the Layout order
 * sequence, and "Aisle" reveals a number control that saves "Aisle 22" (the Store's
 * already-used aisle numbers show as quick chips). There is no "Other"; a missing entry is
 * reported through `onReportMissing` ("Missing one? Tell us").
 *
 * The rules (which chip is current, the aisle control, the no-op check) live in
 * `lib/itemLocationPicker.ts`. The current chip carries a check as well as the wash
 * (`.chip.selected` in `02-DESIGN-REFERENCE.html`), so it is never colour alone. Chips are
 * plain buttons: no radio, checked, selected or busy states, which react-native-web 0.21
 * does not map (docs/lessons.md). Accent fill is on press only, never on focus. Nothing
 * here autofocuses, so opening the picker never raises the keyboard; the number field only
 * takes it when tapped.
 */
export function ItemLocationPicker({
  itemName,
  currentLabel,
  usedAisles,
  onPick,
  onCancel,
  onReportMissing,
  busy = false,
}: {
  itemName: string;
  /** The item's stored Item location at this Store, or null if it has none yet. */
  currentLabel: string | null;
  /** The Store's aisle numbers already in use, ascending (`usedAisleNumbers`). */
  usedAisles: readonly number[];
  /** Called with the chosen label, never for the one the item already has. */
  onPick: (label: string) => void;
  onCancel: () => void;
  onReportMissing: () => void;
  busy?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const reduceMotion = useReduceMotion();

  const chips = useMemo(
    () => pickerChips(currentLabel, parse, LAYOUT_ORDER_SEQUENCE),
    [currentLabel],
  );
  const currentPlace = useMemo(() => parse(currentLabel), [currentLabel]);
  const currentAisle = currentPlace.kind === 'aisle' ? currentPlace.aisle : null;

  const [aisleOpen, setAisleOpen] = useState(false);
  const [draft, setDraft] = useState(currentAisle === null ? '' : String(currentAisle));
  const aisle = parseAisleDraft(draft, MAX_AISLE);

  function choose(label: string) {
    if (busy) return;
    if (isSameAsCurrent(label, currentLabel)) {
      onCancel();
      return;
    }
    onPick(label);
  }

  function openAisles() {
    setAisleOpen((open) => !open);
  }

  const caption =
    currentLabel === null
      ? `Item location for ${itemName}`
      : `New item location for ${itemName} · now ${currentLabel}`;

  return (
    <View role="group" accessibilityLabel={`Item location for ${itemName}`} style={styles.picker}>
      <View style={styles.captionLine}>
        <Text numberOfLines={2} style={styles.caption}>
          {caption}
        </Text>
        <IconButton glyph="✕" accessibilityLabel="Cancel" onPress={onCancel} disabled={busy} />
      </View>

      <View style={styles.chips}>
        {chips.map((chip) =>
          chip.kind === 'area' ? (
            <PickerChip
              key={chip.label}
              label={chip.label}
              current={chip.isCurrent}
              disabled={busy}
              onPress={() => choose(chip.label)}
            />
          ) : (
            <PickerChip
              key="aisles"
              label={chip.isCurrent && currentAisle !== null ? aisleLabel(currentAisle) : 'Aisle'}
              current={chip.isCurrent}
              expanded={aisleOpen}
              disabled={busy}
              onPress={openAisles}
            />
          ),
        )}
      </View>

      {aisleOpen ? (
        <View style={styles.aislePanel}>
          <View style={styles.aisleControl}>
            <IconButton
              glyph="−"
              accessibilityLabel="Lower aisle number"
              onPress={() => setDraft(String(nudgeAisle(aisle, -1, MAX_AISLE)))}
              disabled={busy || aisle === null || aisle <= 1}
            />
            <TextInput
              accessibilityLabel="Aisle number"
              placeholder="No."
              placeholderTextColor={tokens.color.textSecondary}
              value={draft}
              onChangeText={(text) => setDraft(text.replace(/\D/g, ''))}
              inputMode="numeric"
              keyboardType="number-pad"
              maxLength={3}
              editable={!busy}
              onSubmitEditing={() => {
                if (aisle !== null) choose(aisleLabel(aisle));
              }}
              returnKeyType="done"
              blurOnSubmit={false}
              submitBehavior="submit"
              style={styles.aisleInput}
            />
            <IconButton
              glyph="+"
              accessibilityLabel="Higher aisle number"
              onPress={() => setDraft(String(nudgeAisle(aisle, 1, MAX_AISLE)))}
              disabled={busy || (aisle !== null && aisle >= MAX_AISLE)}
            />
            <PrimaryButton
              label={aisle === null ? 'Save' : `Save ${aisleLabel(aisle)}`}
              onPress={() => {
                if (aisle !== null) choose(aisleLabel(aisle));
              }}
              busy={busy}
              disabled={aisle === null}
            />
          </View>

          {usedAisles.length > 0 ? (
            <View style={styles.usedAisles}>
              <Text style={styles.usedCaption}>Aisles used at this store</Text>
              <View style={styles.chips}>
                {usedAisles.map((n) => (
                  <PickerChip
                    key={n}
                    label={aisleLabel(n)}
                    current={currentAisle === n}
                    disabled={busy}
                    onPress={() => choose(aisleLabel(n))}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Missing one? Tell us"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onReportMissing}
        style={({ pressed }) => [
          styles.missingLink,
          pressed && styles.missingLinkPressed,
          pressScale(pressed, reduceMotion),
          busy && styles.inactive,
        ]}
      >
        <Text style={styles.missingLabel}>Missing one? Tell us</Text>
      </Pressable>
    </View>
  );
}

/**
 * One pill. The Pressable is the 44pt hit box and scales; the 36pt pill inside carries the
 * fill (rest: surface, current: accent wash and accent border plus a check, pressed:
 * accent). `expanded` is set only on the Aisles chip, which opens the number control.
 */
function PickerChip({
  label,
  current,
  expanded,
  disabled,
  onPress,
}: {
  label: string;
  current: boolean;
  expanded?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const reduceMotion = useReduceMotion();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={current ? `${label}, current` : label}
      accessibilityState={expanded === undefined ? { disabled } : { disabled, expanded }}
      {...(expanded === undefined ? null : { 'aria-expanded': expanded })}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chipTarget,
        pressScale(pressed, reduceMotion),
        disabled && styles.inactive,
      ]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.chip,
            current && styles.chipCurrent,
            pressed && styles.chipPressed,
            pressFill(pressed, reduceMotion),
          ]}
        >
          {current ? <CheckIcon color={pressed ? tokens.color.accentContrast : tokens.color.accent} /> : null}
          <Text
            style={[
              styles.chipLabel,
              pressed && styles.chipLabelPressed,
              pressFill(pressed, reduceMotion),
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const CAPTION_LINE_HEIGHT = 19.5;

function createStyles(tokens: Tokens) {
  const missingExtra = tokens.minTouchTarget - CAPTION_LINE_HEIGHT;
  return StyleSheet.create({
    picker: {
      flex: 1,
      gap: tokens.space.xs,
    },
    captionLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
    },
    caption: {
      flex: 1,
      minWidth: 0,
      fontSize: tokens.fontSize.caption,
      lineHeight: CAPTION_LINE_HEIGHT,
      color: tokens.color.textSecondary,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: tokens.space.sm,
      rowGap: 0,
    },
    chipTarget: {
      minHeight: tokens.minTouchTarget,
      justifyContent: 'center',
      borderRadius: tokens.radius.pill,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      minHeight: 36,
      paddingHorizontal: tokens.space.md,
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.color.border,
      backgroundColor: tokens.color.surface,
    },
    chipCurrent: {
      backgroundColor: tokens.color.accentWash,
      borderColor: tokens.color.accent,
    },
    chipPressed: {
      backgroundColor: tokens.color.accent,
      borderColor: tokens.color.accent,
    },
    chipLabel: {
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    chipLabelPressed: {
      color: tokens.color.accentContrast,
    },
    inactive: {
      opacity: 0.5,
    },
    aislePanel: {
      gap: tokens.space.xs,
    },
    aisleControl: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: tokens.space.xs,
    },
    aisleInput: {
      width: 72,
      minHeight: tokens.minTouchTarget,
      textAlign: 'center',
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    usedAisles: {
      gap: 0,
    },
    usedCaption: {
      fontSize: tokens.fontSize.caption,
      lineHeight: CAPTION_LINE_HEIGHT,
      color: tokens.color.textSecondary,
    },
    // A real 44pt box (hitSlop does nothing on react-native-web) cancelled out with negative
    // margins so the picker keeps its compact height; see `pendingConfirm` in ui.tsx.
    missingLink: {
      alignSelf: 'flex-start',
      minHeight: tokens.minTouchTarget,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.sm,
      marginVertical: -(missingExtra / 2),
    },
    missingLinkPressed: {
      opacity: 0.5,
    },
    missingLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      color: tokens.color.accent,
    },
  });
}
