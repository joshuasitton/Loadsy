import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TRUCK_LABEL } from '../src/domain/truck';
import type { CompletedMove } from '../src/domain/moveHistory';
import { useHistory } from '../src/state/historyStore';
import { Card, Screen, SectionLabel } from '../src/ui/components';
import { formatDate, formatDateTime } from '../src/ui/format';
import { colors, radius, space, type } from '../src/ui/theme';

/**
 * Moves already made.
 *
 * Everything shown here is what the record says, not what the current algorithm
 * would say about the same inventory. Truck sizes and volumes are frozen at the
 * moment a move was completed — see src/domain/moveHistory.ts for why that
 * matters more than it first appears.
 */
export default function HistoryScreen() {
  const { history, loaded, remove } = useHistory();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  if (!loaded) {
    return (
      <Screen>
        <View style={styles.centre}>
          <Text style={styles.muted}>Looking up your moves…</Text>
        </View>
      </Screen>
    );
  }

  if (history.length === 0) {
    return (
      <Screen>
        <View style={styles.centre}>
          <Text style={styles.emptyTitle}>No completed moves yet</Text>
          <Text style={styles.emptyBody}>
            When you finish a move, it lands here — the truck you took, what was in it, and
            when. Handy the next time you move, and for anyone who asks what fits in a 15
            footer.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>
          {history.length === 1 ? '1 COMPLETED MOVE' : `${history.length} COMPLETED MOVES`}
        </SectionLabel>

        {history.map((record) => {
          const isOpen = expanded === record.id;
          const isConfirming = confirmingDelete === record.id;
          return (
            <Card key={record.id} style={styles.card}>
              <Pressable
                onPress={() => {
                  setExpanded(isOpen ? null : record.id);
                  setConfirmingDelete(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={accessibleSummary(record)}
                style={({ pressed }) => [styles.header, pressed && styles.pressed]}
              >
                <View style={styles.headerBody}>
                  <Text style={styles.date}>{formatDate(record.completedAt)}</Text>
                  <Text style={styles.truck}>{TRUCK_LABEL[record.truckSize]}</Text>
                  <Text style={styles.meta}>
                    {record.roomCount} {record.roomCount === 1 ? 'room' : 'rooms'} ·{' '}
                    {record.itemCount} items · {Math.round(record.rawCuFt)} ft³
                    {record.originZip ? ` · from ${record.originZip}` : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
              </Pressable>

              {isOpen ? (
                <View style={styles.detail}>
                  <View style={styles.figures}>
                    <Figure label="LOADED" value={`${Math.round(record.rawCuFt)} ft³`} />
                    <Figure label="WITH BUFFER" value={`${Math.round(record.adjustedCuFt)} ft³`} />
                    <Figure label="TRUCK" value={TRUCK_LABEL[record.truckSize]} />
                  </View>

                  {record.moveDate ? (
                    <Text style={styles.meta}>Moving day: {formatDate(record.moveDate)}</Text>
                  ) : null}
                  <Text style={styles.meta}>Completed {formatDateTime(record.completedAt)}</Text>

                  {record.rooms.map((room, index) => (
                    <View key={`${record.id}-room-${index}`} style={styles.room}>
                      <Text style={styles.roomName}>{room.name}</Text>
                      <Text style={styles.roomItems}>
                        {room.items.length === 0
                          ? 'No items recorded'
                          : room.items.map((i) => i.name).join(' · ')}
                      </Text>
                    </View>
                  ))}

                  {/*
                    Two taps, in place, rather than a system alert. Alert.alert is
                    a no-op on react-native-web, and this app's demo runs there —
                    a delete that silently does nothing is worse than no delete.
                  */}
                  {isConfirming ? (
                    <View style={styles.confirmRow}>
                      <Pressable
                        onPress={() => void remove(record.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Yes, delete this move permanently"
                        style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
                      >
                        <Text style={styles.dangerText}>Delete permanently</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setConfirmingDelete(null)}
                        accessibilityRole="button"
                        accessibilityLabel="Keep this move"
                        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
                      >
                        <Text style={styles.cancelText}>Keep it</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setConfirmingDelete(record.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete the move completed ${formatDate(record.completedAt)}`}
                      style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
                    >
                      <Text style={styles.cancelText}>Delete this record</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
            </Card>
          );
        })}

        <Text style={styles.footnote}>
          Kept on this device only. Loadsy has no account behind it yet, so these records do
          not follow you to another phone — and nobody else can see them either.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

/** One sentence a screen reader can read instead of four separate fragments. */
function accessibleSummary(record: CompletedMove): string {
  return [
    `Move completed ${formatDate(record.completedAt)}.`,
    `${TRUCK_LABEL[record.truckSize]}.`,
    `${record.roomCount} rooms, ${record.itemCount} items, ${Math.round(record.rawCuFt)} cubic feet.`,
  ].join(' ');
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  muted: { ...type.body, color: colors.textMuted },
  emptyTitle: { ...type.title, color: colors.text, textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  card: { padding: 0, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  headerBody: { flex: 1, gap: 2 },
  date: { ...type.caption, color: colors.textDim },
  truck: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted },
  chevron: { ...type.caption, color: colors.textMuted },
  pressed: { opacity: 0.7 },
  detail: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: space.lg,
    gap: space.md,
  },
  figures: { flexDirection: 'row', gap: space.sm },
  figure: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    padding: space.md,
    gap: 2,
  },
  figureLabel: { ...type.label, fontSize: 9, color: colors.textDim },
  figureValue: { ...type.bodyStrong, color: colors.text },
  room: { gap: 2 },
  roomName: { ...type.bodyStrong, color: colors.text },
  roomItems: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  confirmRow: { flexDirection: 'row', gap: space.sm },
  danger: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerDim,
    paddingVertical: space.md,
  },
  dangerText: { ...type.caption, color: colors.text, fontWeight: '600' },
  cancel: {
    flex: 1,
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
  },
  cancelText: { ...type.caption, color: colors.textMuted },
  footnote: { ...type.caption, fontSize: 12, color: colors.textDim, lineHeight: 17, marginTop: space.sm },
});
