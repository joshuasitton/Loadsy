import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  assessOwnVehicle,
  BODY_TYPE_LABEL,
  BODY_TYPES,
  findOwnVehicle,
  tripLine,
  type OwnVehicle,
} from '../domain/ownVehicle';
import { OWN_VEHICLES } from '../domain/ownVehicles';
import type { Move } from '../domain/types';
import { Card, SecondaryButton, SectionLabel } from './components';
import { colors, radius, space, type } from './theme';

/**
 * "Will it fit in my own car?" – on the truck screen, beside the rentals. Decided
 * 23 September: in v1, and fitting in your own car is a good outcome.
 *
 * The answer is in trips, not yes or no – see src/domain/ownVehicle.ts. Nothing is
 * worked out here: the numbers and the sentence both come from the domain, so the
 * screen cannot describe a load the rule did not compute.
 */
export function OwnVehicleCard({
  move,
  onChoose,
}: {
  move: Move;
  onChoose: (id: string | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const vehicle = findOwnVehicle(move.ownVehicleId, OWN_VEHICLES);
  const fit = useMemo(() => (vehicle ? assessOwnVehicle(move, vehicle) : null), [move, vehicle]);

  return (
    <Card style={styles.card}>
      <SectionLabel>YOUR OWN VEHICLE</SectionLabel>
      {vehicle === null || fit === null ? (
        <>
          <Text style={styles.intro}>
            Moving it yourself? Pick what you drive and we’ll tell you how many trips it takes,
            and what won’t go in it.
          </Text>
          <SecondaryButton title="Choose your vehicle" onPress={() => setPickerOpen(true)} />
        </>
      ) : (
        <>
          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={styles.name}>{vehicle.label}</Text>
              {vehicle.seats ? <Text style={styles.note}>{vehicle.seats}</Text> : null}
            </View>
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Change vehicle, currently ${vehicle.label}`}
              hitSlop={10}
            >
              <Text style={styles.change}>Change</Text>
            </Pressable>
          </View>

          <Text style={styles.summary} accessibilityRole="header">
            {fit.summary}
          </Text>

          {fit.truckIsBetter ? (
            <Text style={styles.note}>
              That’s a lot of driving. The truck above does it in one trip.
            </Text>
          ) : null}

          {/* Trip by trip only while the car is a sensible plan – ten rows of trips is
              a list nobody follows, and the line above has already said so. */}
          {!fit.truckIsBetter && (fit.trips.length > 1 || fit.wontFit.length > 0)
            ? fit.trips.map((trip, index) => (
                <View key={index} style={styles.row}>
                  <Text style={styles.rowLabel}>Trip {index + 1}</Text>
                  <Text style={styles.note}>{tripLine(trip)}</Text>
                </View>
              ))
            : null}

          {fit.wontFit.length > 0 ? (
            <View style={styles.row}>
              <Text style={[styles.rowLabel, styles.no]}>Won’t fit</Text>
              <Text style={styles.note}>
                {fit.wontFit.map((i) => i.name).join(', ')}. Rent for these, or take them apart if
                they come apart. The pickups and trailers below say what does fit them.
              </Text>
            </View>
          ) : null}

          {fit.tight.length > 0 ? (
            <View style={[styles.row, styles.tight]}>
              <Text style={[styles.rowLabel, styles.amber]}>Measure first</Text>
              <Text style={styles.note}>
                {fit.tight.map((i) => i.name).join(', ')}{' '}
                {fit.tight.length === 1 ? 'fits' : 'fit'} by less than our photo estimate can
                promise. Measure {fit.tight.length === 1 ? 'it' : 'them'} and enter the size in
                your inventory, and the answer becomes exact.
              </Text>
            </View>
          ) : null}
        </>
      )}

      <VehiclePicker
        visible={pickerOpen}
        selectedId={vehicle?.id ?? null}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          onChoose(id);
          setPickerOpen(false);
        }}
      />
    </Card>
  );
}

function VehiclePicker({
  visible,
  selectedId,
  onClose,
  onPick,
}: {
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onPick: (id: string | null) => void;
}) {
  const [notListed, setNotListed] = useState(false);
  const groups = BODY_TYPES.map((body) => ({
    body,
    vehicles: OWN_VEHICLES.filter((v) => v.body === body),
  })).filter((g) => g.vehicles.length > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Your vehicle</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close vehicle list"
              hitSlop={10}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {groups.map((group) => (
              <View key={group.body} style={styles.group}>
                <SectionLabel>{BODY_TYPE_LABEL[group.body].toUpperCase()}</SectionLabel>
                {group.vehicles.map((v) => (
                  <VehicleRow key={v.id} vehicle={v} selected={v.id === selectedId} onPress={() => onPick(v.id)} />
                ))}
              </View>
            ))}

            {notListed ? (
              // A vehicle missing from the list gets the truck, never a guess at its size –
              // see src/domain/ownVehicles.ts for why the list only holds published figures.
              <Text style={styles.note}>
                We only list vehicles whose cargo space the maker publishes, so the answer is
                right on the day. Yours isn’t here yet – the truck recommendation above is sized
                for your load.
              </Text>
            ) : (
              <SecondaryButton title="Mine isn’t listed" onPress={() => setNotListed(true)} />
            )}

            {selectedId ? <SecondaryButton title="Clear my vehicle" onPress={() => onPick(null)} /> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function VehicleRow({ vehicle, selected, onPress }: { vehicle: OwnVehicle; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${vehicle.label}, ${vehicle.years}`}
      style={({ pressed }) => [styles.vehicleRow, selected && styles.vehicleRowSelected, pressed && styles.pressed]}
    >
      <Text style={styles.name}>{vehicle.label}</Text>
      <Text style={styles.note}>
        {[vehicle.years, vehicle.seats].filter(Boolean).join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  intro: { ...type.body, color: colors.textMuted },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space.md },
  headText: { flex: 1, gap: 2 },
  name: { ...type.bodyStrong, color: colors.text },
  change: { ...type.caption, color: colors.accent, fontWeight: '600' },
  summary: { ...type.heading, color: colors.text },
  row: { gap: 2, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border },
  rowLabel: { ...type.caption, color: colors.text, fontWeight: '600' },
  no: { color: colors.danger },
  amber: { color: colors.amber },
  tight: { backgroundColor: colors.amberDim, padding: space.sm, borderRadius: radius.sm, borderTopWidth: 0 },
  note: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: 'rgba(6,12,22,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: { ...type.heading, color: colors.text },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { color: colors.textDim, fontSize: 16 },
  sheetBody: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  group: { gap: space.sm },
  vehicleRow: {
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    gap: 2,
  },
  vehicleRowSelected: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  pressed: { opacity: 0.85 },
});
