import { useMemo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import type { Tokens } from '../theme/tokens';

/**
 * The shared surface every screen sits on. Centralising it is what keeps the ground
 * colour, the gutter and the safe-area handling from drifting screen by screen.
 *
 * `edges` exists because a screen inside the navigator already has a header holding
 * the top inset, and insetting again pads twice. Screens outside the navigator take
 * the default and inset on all four sides themselves.
 *
 * This SafeAreaView is the one from `react-native-safe-area-context`, never the
 * react-native core one. They are not interchangeable: core pads on iOS only, the
 * context version reports real insets everywhere. Mixing them means one of the two
 * is wrong on every platform.
 *
 * `align` and `scroll` both default to the shape every Slice 1 screen already has —
 * a short, vertically centred column that does not scroll. That shape cannot back a
 * list, so lists opt in; nothing else changes.
 *
 * `scroll` uses a ScrollView and deliberately not a FlatList. A grocery list is tens
 * of rows, so virtualisation buys nothing measurable, and a FlatList inside a
 * flex-centred container is the classic way to get a zero-height list or a
 * nested-virtualisation warning — real costs paid for an imaginary benefit.
 *
 * `maxWidth` applies in both modes. Without it the web build — the agreed review
 * surface — renders list rows the full width of a desktop window.
 */
export function Screen({
  children,
  edges = ['top', 'bottom', 'left', 'right'],
  align = 'center',
  scroll = false,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  align?: 'center' | 'top';
  scroll?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const centred = align === 'center';

  if (scroll) {
    return (
      <SafeAreaView edges={edges} style={styles.ground}>
        <ScrollView
          style={styles.scrollFrame}
          contentContainerStyle={[
            styles.scrollContent,
            centred && styles.scrollContentCentred,
          ]}
          // A list screen carries a text field and buttons at once. Without this, the
          // first tap on a button only dismisses the keyboard and the press is lost.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={styles.ground}>
      <View style={[styles.content, !centred && styles.contentTop]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

/** For screens the navigator renders: its header has already taken the top inset. */
export const NAVIGATOR_EDGES: readonly Edge[] = ['bottom', 'left', 'right'];

export function Heading({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <Text style={styles.body}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  return <View style={styles.card}>{children}</View>;
}

/**
 * There is one accent in this app, so there is one primary button. A screen with two
 * of them has no primary action, which is a design problem rather than a styling one.
 */
export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        pressed && styles.primaryButtonPressed,
        inactive && styles.buttonInactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tokens.color.accentContrast} />
      ) : (
        <Text style={styles.primaryButtonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.secondaryButtonPressed,
        disabled && styles.buttonInactive,
      ]}
    >
      <Text style={styles.secondaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  ...inputProps
}: { label: string } & TextInputProps) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={tokens.color.textSecondary}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

/**
 * Errors are never colour alone — the design reference forbids it, and a red string
 * with no words is not an explanation anyway.
 */
export function ErrorNote({ message }: { message: string }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View accessibilityRole="alert" style={styles.errorRow}>
      <Text style={styles.errorMark}>!</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/**
 * One line of a list: an optional leading element, a label, an optional trailing one.
 *
 * `leading` is a generic slot rather than the coloured section chip the design
 * reference describes, because that chip needs store sections and those arrive in
 * Slice 6. A slot now costs nothing; a chip now would be a component with no data.
 *
 * `onPress` is optional and the row is a plain View without it. A row whose only
 * actions live in its trailing controls is not itself a button, and announcing it as
 * one gives a screen reader a control that does nothing.
 */
export function Row({
  label,
  leading,
  trailing,
  onPress,
}: {
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const contents = (
    <>
      {leading}
      <Text numberOfLines={1} style={styles.rowLabel}>
        {label}
      </Text>
      {trailing}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{contents}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {contents}
    </Pressable>
  );
}

/**
 * The circular check control from the design reference's list-row anatomy.
 *
 * Checked is signalled by a glyph *and* the accent fill, never the fill alone — the
 * same rule ErrorNote follows, and the one the design reference states outright.
 * Colour-only state is invisible to anyone who cannot separate these two hues.
 *
 * The drawn circle is smaller than the target it sits in. Inflating the circle to
 * 44pt to make it tappable would put a control the size of the row's text next to
 * that text; padding the touchable instead keeps the 44pt floor without the weight.
 *
 * `accessibilityLabel` is required because the visible content is a glyph. In a Row
 * the neighbouring label reads as the name to a sighted user, but nothing in the
 * accessibility tree connects the two, so the control has to name itself.
 *
 * `size` and `label` are Shopping Mode's addition (Slice 5), both optional and
 * backward compatible — every call site that omits them renders exactly as before.
 * `label`, when present, folds the row's label into this same `Pressable` rather
 * than leaving `CheckTarget` a bare circle for a `Row`'s `leading` slot to wrap in
 * its *own* `onPress`. `Row`'s own doc comment already establishes why: a circle
 * nested inside another row's touchable is two nested `Pressable`s reacting to one
 * tap, which is the pattern to avoid, not a component to build. Folding the label in
 * here keeps it to one `Pressable` and reuses the dual `aria-checked`/
 * `accessibilityState` spelling below rather than re-deriving that react-native-web
 * 0.21 gap for a second component. Checked state on the label is strikethrough plus
 * muted colour, on top of the same glyph-and-fill the bare circle already uses —
 * colour is never the only signal, on the label any more than on the circle.
 */
export function CheckTarget({
  checked,
  onToggle,
  accessibilityLabel,
  disabled = false,
  size = 'default',
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: 'default' | 'large';
  label?: string;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const large = size === 'large';

  const circle = (
    <View
      style={[
        styles.checkCircle,
        large && styles.checkCircleLarge,
        checked && styles.checkCircleChecked,
      ]}
    >
      {checked ? (
        <Text style={[styles.checkGlyph, large && styles.checkGlyphLarge]}>✓</Text>
      ) : null}
    </View>
  );

  if (label !== undefined) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={accessibilityLabel}
        aria-checked={checked}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={({ pressed }) => [
          styles.checkRow,
          pressed && styles.rowPressed,
          disabled && styles.buttonInactive,
        ]}
      >
        {circle}
        <Text
          numberOfLines={2}
          style={[styles.checkRowLabel, checked && styles.checkRowLabelChecked]}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel}
      // Both spellings of the same fact, and both are needed. `accessibilityState` is
      // what the native platforms read; react-native-web 0.21 ignores it for `checked`
      // and emits `aria-checked` only from the `aria-checked` prop — measured on the
      // web build, where the checkbox otherwise announced with no state whatsoever.
      // A role of "checkbox" with no checked state is worse than no role at all.
      aria-checked={checked}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={({ pressed }) => [
        large ? styles.touchTargetLarge : styles.touchTarget,
        pressed && styles.touchTargetPressed,
        disabled && styles.buttonInactive,
      ]}
    >
      {circle}
    </Pressable>
  );
}

/**
 * A button whose whole face is one text glyph.
 *
 * `accessibilityLabel` is required rather than optional: a glyph carries no name, so
 * an unlabelled one is announced as its own character or as nothing at all. Making
 * the type demand it is the only version of that rule that cannot be forgotten.
 *
 * `disabled` exists so the ends of a list can refuse a move without the control
 * disappearing. Hiding it instead would shift every other control in the row the
 * moment an item reaches the top or bottom, which is a moving target to tap.
 */
export function IconButton({
  glyph,
  accessibilityLabel,
  onPress,
  disabled = false,
}: {
  glyph: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.touchTarget,
        pressed && styles.touchTargetPressed,
        disabled && styles.buttonInactive,
      ]}
    >
      <Text style={styles.iconGlyph}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * What a list shows before it has anything in it.
 *
 * The action is typed as a pair: either both `actionLabel` and `onAction` or neither.
 * A label with no handler is a button that does nothing, and a handler with no label
 * is a button nobody can see — both are compile-time avoidable.
 */
export function EmptyState({
  heading,
  body,
  ...action
}: {
  heading: string;
  body: string;
} & (
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: undefined; onAction?: undefined }
)) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.emptyState}>
      <Heading>{heading}</Heading>
      <Body>{body}</Body>
      {action.actionLabel ? (
        <PrimaryButton label={action.actionLabel} onPress={action.onAction} />
      ) : null}
    </View>
  );
}

/**
 * An in-place confirmation, rendered as part of the screen rather than over it.
 *
 * Not `Alert.alert`, and this is not a style preference: react-native-web does not
 * implement `Alert`, so on the Vercel build — the only surface this project has ever
 * verified anything on — the call is a silent no-op. A confirmation that silently
 * does not appear is worse than none, because the code reads as if it asked.
 *
 * The confirm action reuses PrimaryButton. Cartel has one accent and therefore one
 * primary action; while this card is on screen, this is it.
 */
export function Confirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View accessibilityRole="alert">
      <Card>
        <Body>{message}</Body>
        <View style={styles.confirmActions}>
          <PrimaryButton label={confirmLabel} onPress={onConfirm} busy={busy} />
          {/* Fixed copy, unlike every other label in this file. "Cancel" is the one
              word a reader never has to read twice, and a configurable version only
              invites each caller to invent its own way of saying nothing happened. */}
          <SecondaryButton label="Cancel" onPress={onCancel} disabled={busy} />
        </View>
      </Card>
    </View>
  );
}

/**
 * A small scope marker. The wash is decoration and the text is the information —
 * `accentWash` is too pale to carry meaning on its own, which is what its own token
 * comment says, so the label is ordinary primary text that happens to sit on it.
 */
export function Badge({ label }: { label: string }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.badge}>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

/**
 * A bordered track of mutually-exclusive options. Not a button — three
 * PrimaryButtons side by side would violate the app's "one accent, one
 * primary button per screen" rule (see PrimaryButton's own comment); this is
 * the standard idiom for a bounded exclusive choice instead. The selected
 * segment uses accentWash + accent text, deliberately not a solid accent
 * fill, so it reads as a state marker (like Badge) rather than a second
 * primary action.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label?: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.segmentedWrap}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" style={styles.segmentedTrack}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && !selected && styles.segmentPressed,
              ]}
            >
              <Text
                style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(tokens: Tokens) {
  return StyleSheet.create({
    ground: {
      flex: 1,
      backgroundColor: tokens.color.ground,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
      gap: tokens.space.md,
      maxWidth: 480,
      width: '100%',
      alignSelf: 'center',
    },
    contentTop: {
      justifyContent: 'flex-start',
    },
    // The width cap belongs to the scroller, not its contents: put it on the content
    // container instead and the scrollbar ends up 480pt from the edge of the window.
    scrollFrame: {
      flex: 1,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: tokens.space.lg,
      // Vertical padding matches the gap, so the first and last rows sit the same
      // distance from the edges as they do from each other. The non-scrolling layout
      // needs none of this: centring keeps its content off both edges for free.
      paddingVertical: tokens.space.md,
      gap: tokens.space.md,
    },
    scrollContentCentred: {
      justifyContent: 'center',
    },
    heading: {
      fontSize: tokens.fontSize.display,
      fontWeight: '700',
      color: tokens.color.textPrimary,
    },
    body: {
      fontSize: tokens.fontSize.body,
      lineHeight: tokens.fontSize.body * 1.5,
      color: tokens.color.textSecondary,
    },
    card: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.lg,
      gap: tokens.space.sm,
      ...tokens.elevation.card,
    },
    primaryButton: {
      backgroundColor: tokens.color.accent,
      borderRadius: tokens.radius.md,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
    },
    primaryButtonPressed: {
      backgroundColor: tokens.color.accentPressed,
    },
    primaryButtonLabel: {
      color: tokens.color.accentContrast,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      backgroundColor: tokens.color.surface,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.space.lg,
    },
    secondaryButtonPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    secondaryButtonLabel: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    buttonInactive: {
      opacity: 0.5,
    },
    field: {
      gap: tokens.space.xs,
    },
    fieldLabel: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
      fontWeight: '600',
    },
    input: {
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.sm,
    },
    errorMark: {
      color: tokens.color.negative,
      fontSize: tokens.fontSize.body,
      fontWeight: '700',
    },
    errorText: {
      flex: 1,
      color: tokens.color.negative,
      fontSize: tokens.fontSize.caption,
      lineHeight: tokens.fontSize.caption * 1.5,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.xs,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
    },
    rowPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    rowLabel: {
      flex: 1,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
    },
    // Shared by every glyph-only control here. The box is the 44pt floor; what gets
    // drawn inside it is the component's business and is always smaller.
    touchTarget: {
      width: tokens.minTouchTarget,
      height: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tokens.radius.pill,
    },
    touchTargetPressed: {
      backgroundColor: tokens.color.surfaceSunken,
    },
    // Shopping Mode's bare-circle sizing (size="large", no label) — same shape as
    // touchTarget, floored at the large tier instead of the default one.
    touchTargetLarge: {
      width: tokens.minTouchTargetLarge,
      height: tokens.minTouchTargetLarge,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tokens.radius.pill,
    },
    checkCircle: {
      width: tokens.space.lg,
      height: tokens.space.lg,
      borderRadius: tokens.radius.pill,
      borderWidth: 2,
      borderColor: tokens.color.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Shopping Mode's larger circle — bigger than the default row's, still well
    // short of the 64pt touch target box it sits inside.
    checkCircleLarge: {
      width: tokens.space.xl,
      height: tokens.space.xl,
    },
    checkCircleChecked: {
      backgroundColor: tokens.color.accent,
      borderColor: tokens.color.accent,
    },
    checkGlyph: {
      color: tokens.color.accentContrast,
      fontSize: tokens.fontSize.caption,
      fontWeight: '700',
      lineHeight: tokens.fontSize.caption,
    },
    checkGlyphLarge: {
      fontSize: tokens.fontSize.title,
      lineHeight: tokens.fontSize.title,
    },
    // Shopping Mode's full-width row: circle and label in one Pressable, floored at
    // the large touch target rather than the default one — see CheckTarget's doc
    // comment for why this isn't a Row wrapping a bare CheckTarget.
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: tokens.minTouchTargetLarge,
      paddingHorizontal: tokens.space.md,
      paddingVertical: tokens.space.sm,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
    },
    checkRowLabel: {
      flex: 1,
      fontSize: tokens.fontSize.large,
      color: tokens.color.textPrimary,
    },
    checkRowLabelChecked: {
      color: tokens.color.textSecondary,
      textDecorationLine: 'line-through',
    },
    iconGlyph: {
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.title,
      lineHeight: tokens.fontSize.title,
    },
    emptyState: {
      paddingVertical: tokens.space.xl,
      gap: tokens.space.md,
    },
    confirmActions: {
      gap: tokens.space.sm,
    },
    badge: {
      alignSelf: 'flex-start',
      backgroundColor: tokens.color.accentWash,
      borderRadius: tokens.radius.pill,
      paddingHorizontal: tokens.space.sm,
      paddingVertical: tokens.space.xs,
    },
    badgeLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      color: tokens.color.textPrimary,
    },
    segmentedWrap: {
      gap: tokens.space.xs,
    },
    segmentedTrack: {
      flexDirection: 'row',
      backgroundColor: tokens.color.surfaceSunken,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      minHeight: tokens.minTouchTarget,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.space.sm,
    },
    segmentPressed: {
      backgroundColor: tokens.color.surface,
    },
    segmentSelected: {
      backgroundColor: tokens.color.accentWash,
    },
    segmentLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      color: tokens.color.textSecondary,
    },
    segmentLabelSelected: {
      color: tokens.color.accent,
    },
  });
}
