import { useMemo, useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
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
import { scrimColor, type Tokens } from '../theme/tokens';

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
  scrollRef,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  align?: 'center' | 'top';
  scroll?: boolean;
  /** Handle on the ScrollView (only used when `scroll`), e.g. to scroll to an error. */
  scrollRef?: Ref<ScrollView>;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const centred = align === 'center';

  if (scroll) {
    return (
      <SafeAreaView edges={edges} style={styles.ground}>
        <ScrollView
          ref={scrollRef}
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
 *
 * `compact` is the composer-plus shape: a fixed 44x44 square carrying a single glyph
 * (e.g. "+") that sits beside a one-line field. The width is fixed so swapping the
 * glyph for the busy spinner never shifts the row's layout. Pair it with
 * `accessibilityLabel`, since a bare glyph has no useful spoken name. Reusable by
 * any screen that wants the same one-line add composer.
 */
export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  keepFocus = false,
  accessibilityLabel,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  compact?: boolean;
  /**
   * For a button sitting next to a "keep typing to add the next one" composer field
   * (add an item, create a list/location) — a plain tap on this button would
   * otherwise shift DOM focus to it first, blurring that field and, on a real
   * device, dismissing the on-screen keyboard before `onPress` ever runs. The
   * `blurOnSubmit={false}`/`editable`-always-true fix on those fields (see
   * HANDOFF) only keeps the keyboard open across a *Return-key* submit — it does
   * nothing for a tap on this button, a separate code path with the same visible
   * symptom. `onMouseDown`'s preventDefault stops that browser default focus
   * shift while it's still the same event dispatch, so the field never blurs in
   * the first place; `onPress` still fires normally off the subsequent click.
   * Web-only (`onMouseDown` isn't a thing on native, where tap-elsewhere-blurs
   * isn't reachable behind the pre-existing `keyboardShouldPersistTaps="handled"`
   * on `Screen`'s ScrollView), and only opted into by the specific buttons next
   * to those fields — not a blanket default, matching how narrowly the Return-key
   * fix itself was scoped.
   */
  keepFocus?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const inactive = busy || disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      {...(keepFocus && Platform.OS === 'web'
        ? { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault() }
        : null)}
      style={({ pressed }) => [
        styles.primaryButton,
        compact && styles.primaryButtonCompact,
        pressed && styles.primaryButtonPressed,
        inactive && styles.buttonInactive,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tokens.color.accentContrast} />
      ) : (
        <Text style={[styles.primaryButtonLabel, compact && styles.primaryButtonLabelCompact]}>
          {label}
        </Text>
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

/**
 * `required` only ever adds a visible marker to the label — it never validates
 * anything itself. Every caller already has its own `canSubmit`-style check
 * for what's actually mandatory; this prop just has to agree with that check,
 * not replace it.
 *
 * `style` is destructured out on purpose rather than left inside `inputProps`.
 * Passing it straight through as `{...inputProps}` after `style={styles.input}`
 * would let a caller's own `style` silently replace the whole box — background,
 * border, radius, everything — instead of adding to it, since a later `style`
 * prop in JSX wins outright rather than merging. Pulling it out and combining
 * both into one array (`[styles.input, style]`) is what lets a caller like a
 * multiline textarea add `minHeight` without losing its box.
 *
 * `label` is optional for a slim, label-less field (e.g. a one-line composer whose
 * placeholder carries the prompt). A field with no visible label must supply its
 * own `accessibilityLabel` — the type pair below enforces that.
 */
export function Field({
  label,
  required = false,
  style,
  ...inputProps
}: { required?: boolean } & TextInputProps &
  ({ label: string } | { label?: undefined; accessibilityLabel: string })) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.field}>
      {label ? (
        <Text style={styles.fieldLabel}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={tokens.color.textSecondary}
        style={[styles.input, style]}
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
 */
export function CheckTarget({
  checked,
  onToggle,
  accessibilityLabel,
  disabled = false,
}: {
  checked: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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
        styles.touchTarget,
        pressed && styles.touchTargetPressed,
        disabled && styles.buttonInactive,
      ]}
    >
      <View style={[styles.checkCircle, checked && styles.checkCircleChecked]}>
        {checked ? <Text style={styles.checkGlyph}>✓</Text> : null}
      </View>
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
 * The compact list-item row shared by Shopping Mode and the add-to-list screen: leading check circle, name, an optional right-aligned neutral pill, and a
 * pencil, on one ~52pt line with a hairline divider inset to the text edge — the
 * density redesign of #76, replacing a 100pt-per-item stack of a check row plus a
 * separate tag row.
 *
 * Circle + name are one `Pressable` (the check-off target) and the pill and pencil are
 * its *siblings*, never nested inside it — `CheckTarget`'s own doc comment names the
 * two-touchables-react-to-one-tap anti-pattern this avoids. The pill is display only.
 * It ellipsis-truncates at 40% of the row so a long section name can't crowd out the
 * item name, and it is right-aligned (next to the pencil, which is always present)
 * so pills of different widths still end at the same edge and aisle changes read as a
 * column. Neutral on purpose: `accent` stays reserved for actions.
 *
 * `editor` replaces the whole line while a row is being edited (see `InlineRowEditor`)
 * so the row *becomes* the editor rather than growing a stacked form beneath it.
 * `footer` renders inside the row above its divider, for per-row detail lines.
 */
export function CompactItemRow({
  name,
  checked,
  onToggle,
  disabled = false,
  pill,
  onEdit,
  editLabel,
  editDisabled = false,
  editor,
  footer,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  pill?: string | null;
  onEdit: () => void;
  editLabel: string;
  editDisabled?: boolean;
  editor?: ReactNode;
  footer?: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View>
      {editor ? (
        <View style={styles.compactLine}>{editor}</View>
      ) : (
        <View style={styles.compactLine}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel={name}
            // Both spellings — see CheckTarget for why react-native-web 0.21 needs both.
            aria-checked={checked}
            accessibilityState={{ checked, disabled }}
            disabled={disabled}
            onPress={onToggle}
            style={({ pressed }) => [
              styles.compactCheck,
              pressed && styles.rowPressed,
              disabled && styles.buttonInactive,
            ]}
          >
            <View style={[styles.checkCircle, checked && styles.checkCircleChecked]}>
              {checked ? <Text style={styles.checkGlyph}>✓</Text> : null}
            </View>
            <Text
              numberOfLines={2}
              style={[styles.compactName, checked && styles.checkRowLabelChecked]}
            >
              {name}
            </Text>
          </Pressable>

          {pill ? (
            <View style={styles.compactPill}>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.compactPillLabel}>
                {pill}
              </Text>
            </View>
          ) : null}

          <IconButton
            glyph="✏"
            accessibilityLabel={editLabel}
            onPress={onEdit}
            disabled={editDisabled}
          />
        </View>
      )}
      {footer}
      <View style={styles.compactDivider} />
    </View>
  );
}

/**
 * The editor a `CompactItemRow` turns into: a small field with ✓ and ✕ beside it,
 * replacing the stacked Field + Save + Cancel blocks. `busy` freezes the whole line
 * while a write is in flight, so neither button can double-submit. `children`, when
 * given, render on a second line beneath it (the add-to-list screen puts reorder and
 * remove there); without them it is the same single line as ever.
 */
export function InlineRowEditor({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmit,
  onCancel,
  busy = false,
  submitDisabled = false,
  maxLength,
  children,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  busy?: boolean;
  submitDisabled?: boolean;
  maxLength?: number;
  children?: ReactNode;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.inlineEditor}>
      <View style={styles.inlineEditorLine}>
        <TextInput
          accessibilityLabel={accessibilityLabel}
          placeholder={placeholder}
          placeholderTextColor={tokens.color.textSecondary}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="sentences"
          autoFocus
          maxLength={maxLength}
          editable={!busy}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          blurOnSubmit={false}
          style={styles.inlineInput}
        />
        <IconButton
          glyph="✓"
          accessibilityLabel="Save"
          onPress={onSubmit}
          disabled={busy || submitDisabled}
        />
        <IconButton glyph="✕" accessibilityLabel="Cancel" onPress={onCancel} disabled={busy} />
      </View>
      {children ? <View style={styles.inlineEditorLine}>{children}</View> : null}
    </View>
  );
}

/**
 * The second line a `CompactItemRow` shows (via its `footer` slot) when someone has
 * proposed a new location for the item: small muted "Proposed: X" and a compact
 * text-style Confirm on its right (#78). Only rendered on affected rows, so everyday
 * rows stay one line. Inset to the row's text edge, like the divider.
 *
 * Confirm is text-styled rather than a `PrimaryButton`: it's a per-row secondary
 * action, and accent colour is what marks it as tappable. The Pressable is a real
 * `minTouchTarget` tall (not `hitSlop`, which react-native-web 0.21 ignores) and
 * cancelled out with negative margins so the line keeps its compact height — see
 * `pendingConfirm` for why the extra height leans downward. Honest caveat: the box
 * overhangs ~7px into the next row, whose own controls paint later and win hit-testing
 * there, so the effective target is ~36px where a row follows and the full 44px only on
 * the last row.
 */
export function PendingCorrectionLine({
  proposedSection,
  onConfirm,
  busy = false,
}: {
  proposedSection: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.pendingLine}>
      <Text numberOfLines={2} style={styles.pendingLabel}>
        {`Proposed: ${proposedSection}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Confirm new location ${proposedSection}`}
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onConfirm}
        style={({ pressed }) => [
          styles.pendingConfirm,
          pressed && styles.pendingConfirmPressed,
          busy && styles.buttonInactive,
        ]}
      >
        <Text style={styles.pendingConfirmLabel}>Confirm</Text>
      </Pressable>
    </View>
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
 * A high-visibility, in-flow confirmation — deliberately not an overlay, for the
 * same reason Confirm above isn't one: react-native-web has no Alert, so anything
 * that isn't rendered as part of the document never appears on the one verified
 * surface. "Hard to miss" here comes from weight (icon, bold text, border,
 * elevation), not from floating above the content.
 *
 * Positive-only for now (no `kind` prop) — the only caller today is a success
 * confirmation, and adding negative/neutral kinds without a real second caller
 * would be speculative. Color is never the only signal, matching ErrorNote's own
 * rule: the check glyph carries the meaning, `positive` just accents it, and it's
 * never used as a text-bearing fill (tokens.ts has no measured positiveWash to
 * fill with).
 *
 * Dismiss is local-only and never wired back to caller state: tapping the "x"
 * hides this instance for the rest of its mount but does not touch anything the
 * caller passed in. No auto-dismiss timer — the one caller today (ShoppingScreen's
 * `justFinished`) only ever flips true after the list is archived, and `toggle()`
 * early-returns once a list is archived, so nothing in that screen resets
 * `justFinished` back to false within a single mount. It persists until the
 * screen unmounts by construction, not by a timer, so this component doesn't
 * need one either.
 */
export function Banner({ message }: { message: string }) {
  const tokens = useTheme();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <Text style={styles.bannerGlyph}>✓</Text>
      <Text style={styles.bannerText}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss confirmation"
        onPress={() => setDismissed(true)}
        style={({ pressed }) => [styles.touchTarget, pressed && styles.touchTargetPressed]}
      >
        <Text style={styles.iconGlyph}>×</Text>
      </Pressable>
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

/**
 * A single-select dropdown: a Field-shaped trigger showing the current value,
 * opening a Modal list of options on tap. Reuses `NavMenu`'s established
 * Modal-popover shape (the same reason it uses `Modal` rather than an
 * absolutely-positioned `View` — see that component's own doc comment)
 * instead of `SegmentedControl`, which stays reserved for a bounded 2-3
 * option exclusive choice shown inline (Light/Dark/System, the chain
 * picker). This is for a caller that wants the choice to read as a real
 * dropdown/picker, closed until tapped.
 *
 * Centred on screen rather than anchored under the trigger like NavMenu's
 * popover — this dropdown can open from anywhere in a scrolling form, not
 * just a fixed header icon, so there's no one corner to hang it from.
 */
export function Select<T extends string>({
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
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? 'Choose an option'}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.input,
          styles.selectTrigger,
          pressed && styles.rowPressed,
        ]}
      >
        <Text style={styles.selectValue}>{selected?.label ?? ''}</Text>
        <Text style={styles.selectChevron}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.selectScrim}
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
        >
          <View style={styles.selectPopover} onStartShouldSetResponder={() => true}>
            {options.map((option) => (
              <Row
                key={option.value}
                label={option.label}
                trailing={option.value === value ? <Text style={styles.iconGlyph}>✓</Text> : null}
                onPress={() => {
                  setOpen(false);
                  onChange(option.value);
                }}
              />
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Height the `PendingCorrectionLine` row occupied before its Confirm target was
// enlarged (13px caption + 2 * space.xs vertical padding, rounded).
const PENDING_LINE_HEIGHT = 24;

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
    primaryButtonCompact: {
      width: tokens.minTouchTarget,
      paddingHorizontal: 0,
    },
    primaryButtonPressed: {
      backgroundColor: tokens.color.accentPressed,
    },
    primaryButtonLabel: {
      color: tokens.color.accentContrast,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
    },
    primaryButtonLabelCompact: {
      fontSize: tokens.fontSize.title,
      lineHeight: tokens.fontSize.title,
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
    requiredMark: {
      color: tokens.color.negative,
      fontWeight: '700',
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
    checkCircle: {
      width: tokens.space.lg,
      height: tokens.space.lg,
      borderRadius: tokens.radius.pill,
      borderWidth: 2,
      borderColor: tokens.color.border,
      alignItems: 'center',
      justifyContent: 'center',
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
    checkRowLabelChecked: {
      color: tokens.color.textSecondary,
      textDecorationLine: 'line-through',
    },
    // Compact item row (#77). Shared by Shopping Mode and the add-to-list screen.
    // `compactDivider` is inset past the circle (24) and its gap (16) so the hairline
    // starts at the text edge, not the screen edge.
    compactDivider: {
      height: StyleSheet.hairlineWidth,
      marginLeft: tokens.space.lg + tokens.space.md,
      backgroundColor: tokens.color.border,
    },
    compactLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
      minHeight: 52,
    },
    compactCheck: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.md,
      minHeight: 52,
      paddingVertical: tokens.space.sm,
    },
    compactName: {
      flex: 1,
      fontSize: tokens.fontSize.body,
      lineHeight: tokens.fontSize.body * 1.35,
      color: tokens.color.textPrimary,
    },
    compactPill: {
      maxWidth: '40%',
      borderRadius: tokens.radius.pill,
      borderWidth: 1,
      borderColor: tokens.color.border,
      paddingHorizontal: tokens.space.sm,
      paddingVertical: 2,
    },
    compactPillLabel: {
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
    pendingLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.sm,
      // Text edge of a CompactItemRow (circle 24 + gap 16), matching compactDivider.
      paddingLeft: tokens.space.lg + tokens.space.md,
      paddingBottom: tokens.space.sm,
    },
    pendingLabel: {
      flex: 1,
      fontSize: tokens.fontSize.caption,
      color: tokens.color.textSecondary,
    },
    // 44pt touch target inside a ~24pt line. The extra height mostly goes *below* the
    // line (into its bottom padding, the divider, and the next row, whose own controls
    // paint later and win any overlap). Only `space.xs` extends upward — that is the
    // gap under the pencil in the row above, so Confirm can't steal its taps.
    // `paddingBottom` re-centres the label on the 24pt line despite the lopsided box.
    pendingConfirm: {
      minHeight: tokens.minTouchTarget,
      justifyContent: 'center',
      paddingHorizontal: tokens.space.sm,
      marginTop: -tokens.space.xs,
      marginBottom: -(tokens.minTouchTarget - PENDING_LINE_HEIGHT - tokens.space.xs),
      paddingBottom: tokens.minTouchTarget - PENDING_LINE_HEIGHT - 2 * tokens.space.xs,
    },
    // Opacity, not `rowPressed`'s background: the lopsided 44pt box would paint that
    // over the divider and into the next row.
    pendingConfirmPressed: {
      opacity: 0.5,
    },
    pendingConfirmLabel: {
      fontSize: tokens.fontSize.caption,
      fontWeight: '600',
      color: tokens.color.accent,
    },
    inlineEditor: {
      flex: 1,
      gap: tokens.space.xs,
    },
    inlineEditorLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.space.xs,
    },
    inlineInput: {
      flex: 1,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.color.border,
      minHeight: tokens.minTouchTarget,
      paddingHorizontal: tokens.space.md,
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
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
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.space.sm,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      borderWidth: 2,
      borderColor: tokens.color.positive,
      padding: tokens.space.lg,
      ...tokens.elevation.card,
    },
    bannerGlyph: {
      color: tokens.color.positive,
      fontSize: tokens.fontSize.title,
      fontWeight: '700',
      lineHeight: tokens.fontSize.title,
    },
    bannerText: {
      flex: 1,
      color: tokens.color.textPrimary,
      fontSize: tokens.fontSize.body,
      fontWeight: '600',
      lineHeight: tokens.fontSize.body * 1.5,
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
    selectTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectValue: {
      fontSize: tokens.fontSize.body,
      color: tokens.color.textPrimary,
    },
    selectChevron: {
      fontSize: tokens.fontSize.body,
      color: tokens.color.textSecondary,
    },
    selectScrim: {
      flex: 1,
      backgroundColor: scrimColor,
      justifyContent: 'center',
      alignItems: 'center',
      padding: tokens.space.lg,
    },
    selectPopover: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: tokens.color.surface,
      borderRadius: tokens.radius.lg,
      padding: tokens.space.sm,
      gap: tokens.space.xs,
      ...tokens.elevation.card,
    },
  });
}
