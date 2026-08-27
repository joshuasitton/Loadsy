/**
 * The demo control strip.
 *
 * Off unless EXPO_PUBLIC_DEMO_MODE is exactly "true", so a store build cannot
 * carry it by accident — the default is silence, and enabling it takes a
 * deliberate line in eas.json. It is not a debug menu: it is the thing you tap
 * in front of an audience, so it stays small, says what it will do before it
 * does it, and never sits between a real user and the app.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/authStore';
import { useMove } from '../state/moveStore';
import { colors, radius, space, type } from '../ui/theme';
import { DEMO_MODE } from './mode';
import { buildDemoMove, DEMO_SCENARIOS } from './scenarios';

export function DemoBar() {
  const { dispatch, move } = useMove();
  const { signOut } = useAuth();
  const [expanded, setExpanded] = useState(false);

  if (!DEMO_MODE) return null;

  const loaded = move.id.startsWith('move-demo-')
    ? DEMO_SCENARIOS.find((s) => move.id === `move-demo-${s.id}`)
    : undefined;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          loaded ? `Demo: ${loaded.label} loaded. Change scenario` : 'Load a demo scenario'
        }
        style={styles.header}
      >
        <Text style={styles.badge}>DEMO</Text>
        <Text style={styles.headerText} numberOfLines={1}>
          {loaded ? loaded.label : 'Load a prepared move'}
        </Text>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          {DEMO_SCENARIOS.map((scenario) => {
            const isLoaded = loaded?.id === scenario.id;
            return (
              <Pressable
                key={scenario.id}
                onPress={() => {
                  dispatch({ type: 'loadMove', move: buildDemoMove(scenario) });
                  setExpanded(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Load ${scenario.label}. ${scenario.blurb}`}
                style={({ pressed }) => [
                  styles.option,
                  isLoaded && styles.optionLoaded,
                  pressed && styles.optionPressed,
                ]}
              >
                <Text style={styles.optionLabel}>{scenario.label}</Text>
                <Text style={styles.optionBlurb}>{scenario.blurb}</Text>
              </Pressable>
            );
          })}

          <View style={styles.footerRow}>
            <Pressable
              onPress={() => {
                dispatch({ type: 'reset' });
                setExpanded(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Start over with an empty move"
              style={({ pressed }) => [styles.reset, pressed && styles.optionPressed]}
            >
              <Text style={styles.resetLabel}>Start over — empty move</Text>
            </Pressable>

            {/*
              The way back to the sign-in screen, which is also where the demo
              controls for the next person live. Without it a tester who signs in
              once has no route back short of clearing site data.
            */}
            <Pressable
              onPress={() => {
                setExpanded(false);
                void signOut();
              }}
              accessibilityRole="button"
              accessibilityLabel="Sign out and return to the sign-in screen"
              style={({ pressed }) => [styles.reset, pressed && styles.optionPressed]}
            >
              <Text style={styles.resetLabel}>Sign out</Text>
            </Pressable>
          </View>

          <Text style={styles.note}>
            Prepared inventories, so a walkthrough never depends on a camera. Everything
            downstream — sizing, prices, the load plan — is computed from them exactly as
            it would be from photographs.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  badge: {
    ...type.label,
    fontSize: 9,
    color: colors.accentText,
    backgroundColor: colors.accent,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  headerText: { ...type.caption, color: colors.text, flex: 1 },
  chevron: { ...type.caption, color: colors.textMuted },
  body: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.md,
    gap: space.sm,
  },
  option: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: space.md,
    gap: 2,
  },
  optionLoaded: { borderColor: colors.accent },
  optionPressed: { opacity: 0.7 },
  optionLabel: { ...type.bodyStrong, color: colors.text },
  optionBlurb: { ...type.caption, color: colors.textMuted },
  footerRow: { flexDirection: 'row', gap: space.sm },
  reset: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.md,
    alignItems: 'center',
  },
  resetLabel: { ...type.caption, color: colors.textMuted },
  note: { ...type.caption, fontSize: 12, color: colors.textDim, lineHeight: 17 },
});
