import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space, type } from './theme';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Primary call to action.
 *
 * `disabled` is a real prop wired to `Pressable.disabled`, not a style flag —
 * spec §3 Screen 2 requires the disabled state to be programmatic so the CTA
 * genuinely cannot fire while low-confidence items are unresolved.
 */
export function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const isInert = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isInert}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isInert, busy: loading }}
      style={({ pressed }) => [
        styles.primaryButton,
        isInert && styles.primaryButtonDisabled,
        pressed && !isInert && styles.primaryButtonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.accentText} />
      ) : (
        <Text style={[styles.primaryButtonText, isInert && styles.primaryButtonTextDisabled]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.secondaryButtonDisabled,
        pressed && !disabled && styles.cardPressed,
      ]}
    >
      <Text style={[styles.secondaryButtonText, disabled && styles.secondaryButtonTextDisabled]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  tone,
  title,
  message,
  children,
}: {
  tone: 'amber' | 'green' | 'danger' | 'neutral';
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const toneStyle = {
    amber: { bg: colors.amberDim, fg: colors.amber },
    green: { bg: colors.greenDim, fg: colors.green },
    danger: { bg: colors.dangerDim, fg: colors.danger },
    neutral: { bg: colors.surfaceRaised, fg: colors.textMuted },
  }[tone];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: toneStyle.bg, borderColor: toneStyle.fg }]}
    >
      <Text style={[styles.bannerTitle, { color: toneStyle.fg }]}>{title}</Text>
      {message ? <Text style={styles.bannerMessage}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

/**
 * Spec §5: "estimated" language must appear on EVERY price surface, not only the
 * breakdown sheet. This is the one component every price is rendered through.
 */
export function EstimateTag({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.estimateTag}>
      <Text style={styles.estimateTagText}>{compact ? 'EST.' : 'ESTIMATED'}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  cardPressed: { opacity: 0.7 },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonPressed: { opacity: 0.85 },
  primaryButtonDisabled: { backgroundColor: colors.disabled },
  primaryButtonText: { ...type.bodyStrong, color: colors.accentText, fontSize: 16 },
  primaryButtonTextDisabled: { color: colors.disabledText },
  secondaryButton: {
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  secondaryButtonDisabled: { borderColor: colors.disabled },
  secondaryButtonText: { ...type.bodyStrong, color: colors.text },
  secondaryButtonTextDisabled: { color: colors.disabledText },
  chip: {
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 38,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...type.caption, color: colors.textMuted, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  banner: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.lg,
    gap: space.xs,
  },
  bannerTitle: { ...type.bodyStrong },
  bannerMessage: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  sectionLabel: { ...type.label, color: colors.textDim, marginBottom: space.sm },
  estimateTag: {
    backgroundColor: colors.amberDim,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  estimateTagText: { ...type.label, color: colors.amber, fontSize: 9 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
});
