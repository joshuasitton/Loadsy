import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  assessOwnVehicle,
  BODY_TYPE_LABEL,
  BODY_TYPE_SINGULAR,
  BODY_TYPES,
  findOwnVehicle,
  tripLine,
  type BodyType,
  type OwnVehicle,
} from '../domain/ownVehicle';
import { modelYears, VEHICLE_MAKES, type VehicleMake } from '../domain/vehicleRequest';
import { sendVehicleRequest } from '../api/vehicleRequest';
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
              <NotListed />
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

/**
 * "Mine isn't listed": the truck, and – if the person chooses to say – which kind of
 * vehicle, so the next ones researched are the ones people drive. Decided 23 September.
 * Three picks from fixed lists and a button that says what it sends; nothing is sent
 * until it is pressed, and nothing typed is ever sent. See src/domain/vehicleRequest.ts.
 */
function NotListed() {
  const [body, setBody] = useState<BodyType | null>(null);
  const [make, setMake] = useState<VehicleMake | null>(null);
  const [year, setYear] = useState<string | null>(null);
  // Once per opening: the list only moves in January, and a re-render must not reorder it.
  const [years] = useState(() => modelYears(new Date()));
  const [sent, setSent] = useState(false);

  return (
    <View style={styles.group}>
      {/* A vehicle missing from the list gets the truck, never a guess at its size –
          see src/domain/ownVehicles.ts for why the list only holds published figures. */}
      <Text style={styles.note}>
        We only list vehicles whose cargo space the maker publishes, so the answer is right on
        the day. Yours isn’t here yet – the truck recommendation above is sized for your load.
      </Text>
      {sent ? (
        <Text style={styles.name}>Thanks – counted. We add vehicles in the order people ask for them.</Text>
      ) : (
        <>
          <SectionLabel>TELL US WHAT YOU DRIVE</SectionLabel>
          <View style={styles.choices}>
            {BODY_TYPES.map((b) => (
              <Choice key={b} label={BODY_TYPE_SINGULAR[b]} selected={body === b} onPress={() => setBody(b)} />
            ))}
          </View>
          <View style={styles.choices}>
            {VEHICLE_MAKES.map((m) => (
              <Choice key={m} label={m} selected={make === m} onPress={() => setMake(m)} />
            ))}
          </View>
          {/* One scrolling row: twenty-odd years as wrapped chips would push the button
              off the sheet. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
            {years.map((y) => (
              <Choice key={y} label={y} selected={year === y} onPress={() => setYear(y)} />
            ))}
          </ScrollView>
          <Text style={styles.note}>
            Sends only the type, make and year you pick – nothing about you, your phone or your
            move.
          </Text>
          <SecondaryButton
            title="Count my vehicle"
            disabled={body === null || make === null || year === null}
            onPress={() => {
              if (body === null || make === null || year === null) return;
              setSent(true);
              void sendVehicleRequest({ body, make, year });
            }}
          />
        </>
      )}
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
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
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  yearRow: { gap: space.sm, paddingRight: space.lg },
  choice: {
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.bg,
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  choiceText: { ...type.caption, color: colors.text },
  choiceTextSelected: { color: colors.accentText, fontWeight: '600' },
});
