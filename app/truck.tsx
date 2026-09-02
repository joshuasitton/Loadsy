import { useCallback, useRef, useState } from 'react';
import { formatCuFt } from '../src/ui/format';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  TRUCK_CAPACITY,
  TRUCK_CHIP_LABEL,
  TRUCK_LABEL,
  TRUCK_ROOM_EQUIVALENCE,
} from '../src/domain/truck';
import { TRUCK_SIZES, type TruckSize } from '../src/domain/types';
import { useMove } from '../src/state/moveStore';
import { Card, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/** Screen 3 — Truck Recommendation. */

/** Chip width plus the gap between chips, for scrolling the row by whole chips. */
const CHIP_STRIDE = 150 + space.sm;

const SIZE_GUIDE = [
  { size: 'van' as const, body: 'A few pieces of furniture and a car-load of boxes. Studios and dorm rooms.' },
  { size: '10ft' as const, body: 'A studio or small one-bedroom. Bed, sofa, dresser, and around fifteen boxes.' },
  { size: '15ft' as const, body: 'A one or two-bedroom apartment. The most common choice for apartment moves.' },
  { size: '20ft' as const, body: 'A two or three-bedroom home, including appliances and a garage worth of gear.' },
  { size: '26ft' as const, body: 'A four-bedroom home and up. If you are close to this, price a second trip too.' },
];

export default function TruckScreen() {
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const chipRow = useRef<ScrollView>(null);

  /**
   * Brings the recommended chip into view, leaving the one before it half
   * visible so the row still reads as scrollable.
   */
  const scrollToRecommended = useCallback(() => {
    const index = TRUCK_SIZES.indexOf(recommendation.size);
    if (index <= 0) return;
    chipRow.current?.scrollTo({ x: Math.max(0, (index - 0.4) * CHIP_STRIDE), animated: false });
  }, [recommendation.size]);
  // Preview only. Spec §3 Screen 3: tapping a chip must NOT change the recommendation.
  // Derived rather than seeded, so a recommendation that lands after mount (the
  // store hydrates from AsyncStorage a frame late on a cold deep link) doesn't
  // leave the screen claiming to preview a size the user never tapped.
  const [override, setOverride] = useState<TruckSize | null>(null);
  const previewing = override ?? recommendation.size;
  const [guideOpen, setGuideOpen] = useState(false);

  const previewCapacity = TRUCK_CAPACITY[previewing];
  const isPreviewingRecommendation = previewing === recommendation.size;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>WE RECOMMEND</Text>
          <Text style={styles.heroSize}>{TRUCK_LABEL[recommendation.size]}</Text>
          <Text style={styles.heroEquivalence}>{TRUCK_ROOM_EQUIVALENCE[recommendation.size]}</Text>
        </View>

        {recommendation.exceedsLargest ? (
          <Card style={styles.warning}>
            <Text style={styles.warningTitle}>This is more than one truckload</Text>
            <Text style={styles.warningBody}>
              Your inventory is past what a 26′ truck holds. Plan on two trips, or move some of it
              separately — we&apos;ll still price the 26′ for you.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.why}>
          <SectionLabel>WHY THIS SIZE</SectionLabel>
          <WhyRow label="Everything you listed" value={`${formatCuFt(recommendation.rawCuFt)} ft³`} />
          <WhyRow
            label={`Packing buffer (+${Math.round(recommendation.bufferPct * 100)}%)`}
            value={`${formatCuFt(recommendation.adjustedCuFt - recommendation.rawCuFt)} ft³`}
            hint="Real loads never stack perfectly — this is the gap between the boxes."
          />
          <View style={styles.whyDivider} />
          <WhyRow label="What you actually need" value={`${formatCuFt(recommendation.adjustedCuFt)} ft³`} emphasis />
          <WhyRow
            label={`${TRUCK_LABEL[recommendation.size]} holds`}
            value={`${recommendation.capacity.min}–${recommendation.capacity.max} ft³`}
          />
          {!recommendation.exceedsLargest ? (
            <Text style={styles.headroom}>
              That leaves about {formatCuFt(recommendation.headroomCuFt)} ft³ of headroom. We size up rather
              than fill a truck to its limit — a truck that is slightly too big costs a few
              dollars, one that is too small costs you the day.
            </Text>
          ) : null}
        </Card>

        <View>
          <SectionLabel>COMPARE SIZES</SectionLabel>
          {/*
            Scrolled so the recommendation is the first thing in view.
            
            The row is 800pt of chips in a 343pt window, in size order, and the
            recommendation can be anywhere in it — for a 15ft it started 94pt off
            the right edge with no scrollbar to hint that anything was there. The
            one chip this row exists to show was the one you could not see.
          */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            onContentSizeChange={scrollToRecommended}
            ref={chipRow}
          >
            {TRUCK_SIZES.map((size) => {
              const isRecommended = size === recommendation.size;
              const isActive = size === previewing;
              return (
                <Pressable
                  key={size}
                  onPress={() => setOverride(size)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                  accessibilityLabel={`${TRUCK_LABEL[size]}, ${TRUCK_CAPACITY[size].min} to ${TRUCK_CAPACITY[size].max} cubic feet. ${TRUCK_ROOM_EQUIVALENCE[size]}${isRecommended ? '. Recommended for your move' : ''}`}
                  style={[
                    styles.sizeChip,
                    isActive && styles.sizeChipActive,
                    isRecommended && styles.sizeChipRecommended,
                  ]}
                >
                  {isRecommended ? <Text style={styles.sizeChipBadge}>RECOMMENDED</Text> : null}
                  <Text style={styles.sizeChipTitle}>{TRUCK_CHIP_LABEL[size]}</Text>
                  <Text style={styles.sizeChipCuFt}>
                    {TRUCK_CAPACITY[size].min}–{TRUCK_CAPACITY[size].max} ft³
                  </Text>
                  <Text style={styles.sizeChipRooms}>{TRUCK_ROOM_EQUIVALENCE[size]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {!isPreviewingRecommendation ? (
            <Text style={styles.previewNote}>
              Previewing the {TRUCK_CHIP_LABEL[previewing]} — it holds {previewCapacity.min}–
              {previewCapacity.max} ft³ against your {formatCuFt(recommendation.adjustedCuFt)} ft³. Your
              recommendation is still the {TRUCK_CHIP_LABEL[recommendation.size]}.
            </Text>
          ) : null}
        </View>

        <SecondaryButton title="Need help choosing?" onPress={() => setGuideOpen(true)} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <StepNav
          current="/truck"
          blockedReason={
            move.rooms.length === 0 ? 'Add a room before looking up prices' : null
          }
          onAdvance={() => dispatch({ type: 'setStatus', status: 'truckAndPrice' })}
        />
      </View>

      <Modal
        visible={guideOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setGuideOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Truck size guide</Text>
              <Pressable
                onPress={() => setGuideOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close size guide"
                hitSlop={10}
                style={styles.iconButton}
              >
                <Text style={styles.iconButtonText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>
              {SIZE_GUIDE.map((entry) => (
                <View key={entry.size} style={styles.guideRow}>
                  <Text style={styles.guideTitle}>{TRUCK_LABEL[entry.size]}</Text>
                  <Text style={styles.guideCapacity}>
                    {TRUCK_CAPACITY[entry.size].min}–{TRUCK_CAPACITY[entry.size].max} ft³ ·{' '}
                    {TRUCK_ROOM_EQUIVALENCE[entry.size]}
                  </Text>
                  <Text style={styles.guideBody}>{entry.body}</Text>
                </View>
              ))}
              <Text style={styles.guideFootnote}>
                When you are between two sizes, size up. An extra few dollars beats a second trip.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function WhyRow({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.whyRow}>
      <View style={styles.whyRowMain}>
        <Text style={[styles.whyLabel, emphasis && styles.whyLabelEmphasis]}>{label}</Text>
        <Text style={[styles.whyValue, emphasis && styles.whyValueEmphasis]}>{value}</Text>
      </View>
      {hint ? <Text style={styles.whyHint}>{hint}</Text> : null}
    </View>
  );
}


const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.xl },
  hero: { gap: space.xs, marginTop: space.sm },
  heroLabel: { ...type.label, color: colors.accent },
  heroSize: { ...type.display, color: colors.text },
  heroEquivalence: { ...type.body, color: colors.textMuted },
  warning: { backgroundColor: colors.amberDim, borderColor: colors.amber, gap: space.xs },
  warningTitle: { ...type.bodyStrong, color: colors.amber },
  warningBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  why: { gap: space.md },
  whyRow: { gap: 2 },
  whyRowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: space.md,
  },
  whyLabel: { ...type.body, color: colors.textMuted, flex: 1 },
  whyLabelEmphasis: { color: colors.text, fontWeight: '600' },
  whyValue: { ...type.bodyStrong, color: colors.text },
  whyValueEmphasis: { color: colors.accent, fontSize: 17 },
  whyHint: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  whyDivider: { height: 1, backgroundColor: colors.border },
  headroom: { ...type.caption, color: colors.textDim, marginTop: space.xs },
  chipRow: { gap: space.sm, paddingRight: space.lg },
  sizeChip: {
    width: 150,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: 2,
  },
  sizeChipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  sizeChipRecommended: { borderColor: colors.accent },
  sizeChipBadge: { ...type.label, fontSize: 8, color: colors.accent },
  sizeChipTitle: { ...type.heading, color: colors.text },
  sizeChipCuFt: { ...type.caption, color: colors.textMuted },
  sizeChipRooms: { ...type.caption, color: colors.textDim, fontSize: 12, lineHeight: 16 },
  previewNote: { ...type.caption, color: colors.textDim, lineHeight: 18, marginTop: space.md },
  footer: {
    padding: space.lg,
    paddingBottom: space.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(6,12,22,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { ...type.heading, color: colors.text },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { color: colors.textDim, fontSize: 16 },
  modalBody: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  guideRow: { gap: 2 },
  guideTitle: { ...type.bodyStrong, color: colors.text },
  guideCapacity: { ...type.caption, color: colors.accent },
  guideBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  guideFootnote: { ...type.caption, color: colors.textDim, lineHeight: 19, fontStyle: 'italic' },
});
