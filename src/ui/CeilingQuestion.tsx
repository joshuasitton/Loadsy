import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  CEILING_CHOICES_FT,
  formatCeiling,
  parseCeilingFeet,
  STANDARD_CEILING_IN,
} from '../domain/ceiling';
import { Card, SectionLabel } from './components';
import { colors, radius, space, type } from './theme';

/**
 * "Are your ceilings the standard 8ft high?" – asked once per move, before the
 * first photo.
 *
 * The detector sizes furniture against the ceiling when it is the reference in
 * frame, and assumes 8 ft. A 9 ft ceiling makes every size about 11% short, which
 * compounds to about 30% less volume: a truck too small. See src/domain/ceiling.ts.
 *
 * Kept to one tap for most people. "Yes" answers it; "No" offers quick heights
 * instead of a text box, because a typed height arrives as "9 feet", "108" or
 * "9'6"" and a tap cannot be misread. "Other" is there for the rest, and says so
 * plainly when it cannot read what was typed rather than guessing.
 *
 * Once answered it folds to a single line with a way to change it, so it never
 * sits between the person and the camera again.
 */
export function CeilingQuestion({
  value,
  onAnswer,
}: {
  /** Inches, or null when not yet answered. */
  value: number | null;
  onAnswer: (inches: number) => void;
}) {
  const [reopened, setReopened] = useState(false);
  const [saidNo, setSaidNo] = useState(false);
  const [other, setOther] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);

  function answer(inches: number) {
    onAnswer(inches);
    setReopened(false);
    setSaidNo(false);
    setOther('');
    setOtherError(null);
  }

  function submitOther() {
    const inches = parseCeilingFeet(other);
    if (inches === null) {
      setOtherError('Enter the height in feet, like 8.5 or 9\'6" – between 6 and 20 ft.');
      return;
    }
    answer(inches);
  }

  if (value !== null && !reopened) {
    const standard = value === STANDARD_CEILING_IN;
    return (
      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          Ceilings: {formatCeiling(value)}
          {standard ? ' (standard)' : ''}
        </Text>
        <Pressable
          onPress={() => {
            setReopened(true);
            setSaidNo(!standard);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Change ceiling height, now ${formatCeiling(value)}`}
          style={({ pressed }) => [styles.change, pressed && styles.pressed]}
        >
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <SectionLabel>CEILING HEIGHT</SectionLabel>
      <Text style={styles.question}>Are your ceilings the standard 8 ft high?</Text>
      <Text style={styles.why}>
        Loadsy sizes furniture against the ceiling, so a taller one changes every measurement.
      </Text>

      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Standard 8 foot ceilings?">
        <Option
          label="Yes"
          selected={value === STANDARD_CEILING_IN && !saidNo}
          onPress={() => answer(STANDARD_CEILING_IN)}
          accessibilityLabel="Yes, standard 8 foot ceilings"
        />
        <Option
          label="No"
          selected={saidNo}
          onPress={() => setSaidNo(true)}
          accessibilityLabel="No, a different ceiling height"
        />
      </View>

      {saidNo ? (
        <View style={styles.heights}>
          <Text style={styles.prompt}>How high are they?</Text>
          <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Ceiling height">
            {CEILING_CHOICES_FT.map((feet) => (
              <Option
                key={feet}
                label={`${feet} ft`}
                selected={value === feet * 12}
                onPress={() => answer(feet * 12)}
                accessibilityLabel={`${feet} foot ceilings`}
              />
            ))}
          </View>
          <View style={styles.otherRow}>
            <TextInput
              value={other}
              onChangeText={(text) => {
                setOther(text);
                setOtherError(null);
              }}
              onSubmitEditing={submitOther}
              placeholder="Other, in feet"
              placeholderTextColor={colors.textDim}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              style={styles.input}
              accessibilityLabel="Other ceiling height, in feet"
            />
            <Pressable
              onPress={submitOther}
              disabled={other.trim() === ''}
              accessibilityRole="button"
              accessibilityLabel="Use this ceiling height"
              accessibilityState={{ disabled: other.trim() === '' }}
              style={({ pressed }) => [
                styles.use,
                other.trim() === '' && styles.useDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.useText, other.trim() === '' && styles.useTextDisabled]}>Use</Text>
            </Pressable>
          </View>
          {otherError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {otherError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** A choice with a full 44pt target – the shared Chip is 38pt, and this one gates the camera. */
function Option({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      // A radio with `aria-checked`, set directly. Checked in the browser:
      // react-native-web emits nothing for `accessibilityState.selected` on a
      // button, nor for `accessibilityState.checked` on a radio – so a screen reader
      // could not tell which height was chosen. The ARIA prop reaches both platforms.
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      aria-checked={selected}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm },
  question: { ...type.heading, color: colors.text },
  why: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  option: {
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { ...type.bodyStrong, color: colors.text },
  optionTextSelected: { color: colors.accentText },
  heights: { gap: space.xs, marginTop: space.sm },
  prompt: { ...type.caption, color: colors.textMuted },
  otherRow: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  input: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    ...type.body,
  },
  use: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useDisabled: { backgroundColor: colors.disabled },
  useText: { ...type.bodyStrong, color: colors.accentText },
  useTextDisabled: { color: colors.disabledText },
  error: { ...type.caption, color: colors.danger, lineHeight: 19 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  summaryText: { ...type.body, color: colors.textMuted },
  change: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  changeText: { ...type.bodyStrong, color: colors.accent },
  pressed: { opacity: 0.7 },
});
