import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canLeaveInventory, confidenceBannerCopy, isUnresolved, markConfirmed, unresolvedCount } from '../src/domain/confidence';
import type { InventoryItem, ItemCategory, WeightClass } from '../src/domain/types';
import { cubicFeetFor, roomCubicFeet } from '../src/domain/volume';
import { useMove } from '../src/state/moveStore';
import { shouldPromptCoverage, uncoveredAreas } from '../src/domain/coverage';
import { resolveRoomId } from '../src/domain/rooms';
import { Banner, Card, Chip, Divider, PrimaryButton, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 2 — Inventory Review. */

const CATEGORIES: ItemCategory[] = ['furniture', 'box', 'appliance', 'fragile', 'other'];
const WEIGHTS: WeightClass[] = ['light', 'medium', 'heavy'];

export default function InventoryScreen() {
  const router = useRouter();
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [addingToRoom, setAddingToRoom] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');

  const unresolved = unresolvedCount(move);
  // The single source of truth for the CTA — programmatic, per spec §3 Screen 2.
  const canAdvance = canLeaveInventory(move);

  const totals = useMemo(
    () => ({ items: move.rooms.reduce((n, r) => n + r.items.length, 0), cuFt: recommendation.rawCuFt }),
    [move.rooms, recommendation.rawCuFt],
  );

  function advance() {
    dispatch({ type: 'setStatus', status: 'truckAndPrice' });
    router.push('/truck');
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {unresolved > 0 ? (
          <Banner
            tone="amber"
            title={confidenceBannerCopy(unresolved)}
            message="We weren't sure about these. Confirm or correct them and your truck estimate gets a lot sharper."
          />
        ) : totals.items > 0 ? (
          <Banner tone="green" title="Inventory looks good" message={`${totals.items} items · ${totals.cuFt} ft³ before packing buffer`} />
        ) : null}

        {move.rooms.length === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Photograph a room, or add rooms and items by hand — both work.
            </Text>
            <PrimaryButton title="Capture a room" onPress={() => router.push('/capture')} />
          </Card>
        ) : null}

        {move.rooms.map((room) => (
          <View key={room.id} style={styles.room}>
            <View style={styles.roomHeader}>
              <Text style={styles.roomName}>{room.name}</Text>
              <Text style={styles.roomTotal}>{roomCubicFeet(room)} ft³</Text>
            </View>

            {room.items.length === 0 ? (
              <Text style={styles.roomEmpty}>No items in this room yet.</Text>
            ) : (
              room.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onEdit={() => setEditing(item)}
                  onConfirm={() => dispatch({ type: 'updateItem', item: markConfirmed(item) })}
                  onRemove={() => dispatch({ type: 'removeItem', itemId: item.id })}
                />
              ))
            )}

            <SecondaryButton
              title="+ Add item"
              onPress={() => setAddingToRoom(room.id)}
              accessibilityLabel={`Add an item to ${room.name}`}
            />
          </View>
        ))}

        {shouldPromptCoverage(move) ? (
          <Card style={styles.coverage}>
            <SectionLabel>EASY TO MISS</SectionLabel>
            <Text style={styles.coverageBody}>
              A room left out is the one thing a truck estimate can&apos;t recover from — we can
              size for a sofa measured wrong, not for a garage we never saw. Tap anything you
              still need to add.
            </Text>
            <View style={styles.coverageChips}>
              {uncoveredAreas(move).map((area) => (
                <Chip
                  key={area.id}
                  label={area.label}
                  active={false}
                  onPress={() =>
                    dispatch({
                      type: 'addRoom',
                      id: resolveRoomId(move, area.label, `room-${Date.now()}`),
                      name: area.label,
                    })
                  }
                  accessibilityLabel={`Add ${area.label}. ${area.hint}`}
                />
              ))}
            </View>
          </Card>
        ) : null}

        <Card style={styles.addRoom}>
          <SectionLabel>ADD A ROOM BY HAND</SectionLabel>
          <View style={styles.addRoomRow}>
            <TextInput
              value={newRoomName}
              onChangeText={setNewRoomName}
              placeholder="Garage"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              accessibilityLabel="New room name"
            />
            <SecondaryButton
              title="Add"
              accessibilityLabel="Add room"
              onPress={() => {
                const name = newRoomName.trim();
                if (!name) return;
                dispatch({
                  type: 'addRoom',
                  id: resolveRoomId(move, name, `room-${Date.now()}`),
                  name,
                });
                setNewRoomName('');
              }}
            />
          </View>
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        {!canAdvance && totals.items > 0 ? (
          <Text style={styles.footerHint}>
            {unresolved} {unresolved === 1 ? 'item still needs' : 'items still need'} a quick check
          </Text>
        ) : null}
        <PrimaryButton
          title="See my truck size"
          onPress={advance}
          disabled={!canAdvance}
          accessibilityHint={
            canAdvance ? undefined : 'Confirm the flagged items before continuing'
          }
        />
      </View>

      <ItemEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(item) => {
          dispatch({ type: 'updateItem', item });
          setEditing(null);
        }}
      />

      <ItemCreator
        roomId={addingToRoom}
        onClose={() => setAddingToRoom(null)}
        onCreate={(item) => {
          dispatch({ type: 'addItems', roomId: item.roomId, items: [item] });
          setAddingToRoom(null);
        }}
      />
    </Screen>
  );
}

function ItemCard({
  item,
  onEdit,
  onConfirm,
  onRemove,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  const flagged = isUnresolved(item);
  const { lengthIn, widthIn, heightIn } = item.dimensions;

  return (
    <View style={[styles.itemCard, flagged && styles.itemCardFlagged]}>
      <View style={styles.itemTop}>
        <View style={styles.itemNameBlock}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {lengthIn}″ × {widthIn}″ × {heightIn}″ · {item.cubicFeet} ft³
          </Text>
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
          hitSlop={10}
          style={styles.iconButton}
        >
          <Text style={styles.iconButtonText}>✕</Text>
        </Pressable>
      </View>

      {flagged ? (
        <>
          <Text style={styles.itemReason}>{item.confidenceReason}</Text>
          <View style={styles.itemActions}>
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              accessibilityLabel={`Edit the size of ${item.name}`}
              style={styles.itemAction}
            >
              <Text style={styles.itemActionText}>Edit size</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={`Confirm ${item.name} looks right`}
              style={[styles.itemAction, styles.itemActionPrimary]}
            >
              <Text style={[styles.itemActionText, styles.itemActionTextPrimary]}>Looks right</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${item.name}`}
          style={styles.itemEditLink}
        >
          <Text style={styles.itemEditLinkText}>Edit</Text>
        </Pressable>
      )}
    </View>
  );
}

function ItemEditor({
  item,
  onClose,
  onSave,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSave: (item: InventoryItem) => void;
}) {
  return (
    <DimensionModal
      visible={item !== null}
      title={item?.name ?? ''}
      initial={item}
      onClose={onClose}
      onSubmit={(draft) => {
        if (!item) return;
        const dimensions = { ...draft.dimensions, isEstimated: false };
        onSave({
          ...item,
          ...draft,
          dimensions,
          cubicFeet: cubicFeetFor(dimensions),
          // Recomputed, because Draft carries no isFragile and the spread above
          // would otherwise preserve the old one. stepForItem tests
          // isFragile OR category === fragile, which is deliberately not
          // symmetric so a heavy mirror stays protected — and that asymmetry is
          // exactly what lets a stale flag survive. Editing a Mirror from fragile
          // to box left it loading under "Fragile & Awkward" and still labelled
          // fragile, while the By Room tab, which derives live, disagreed.
          isFragile: draft.category === 'fragile',
          // Editing resolves the confidence flag — this is what unblocks the CTA.
          userEdited: true,
        });
      }}
    />
  );
}

function ItemCreator({
  roomId,
  onClose,
  onCreate,
}: {
  roomId: string | null;
  onClose: () => void;
  onCreate: (item: InventoryItem) => void;
}) {
  return (
    <DimensionModal
      visible={roomId !== null}
      title="New item"
      initial={null}
      onClose={onClose}
      onSubmit={(draft) => {
        if (!roomId) return;
        const dimensions = { ...draft.dimensions, isEstimated: false };
        onCreate({
          id: `manual-${Date.now()}`,
          name: draft.name,
          category: draft.category,
          roomId,
          dimensions,
          cubicFeet: cubicFeetFor(dimensions),
          // Spec §6 Q3: manual entries skip the confidence system entirely.
          confidence: null,
          confidenceReason: null,
          isFragile: draft.category === 'fragile',
          estimatedWeightClass: draft.estimatedWeightClass,
          sourcePhotoId: null,
          userEdited: true,
        });
      }}
    />
  );
}

interface Draft {
  name: string;
  category: ItemCategory;
  estimatedWeightClass: WeightClass;
  dimensions: { lengthIn: number; widthIn: number; heightIn: number; isEstimated: boolean };
}

function DimensionModal({
  visible,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initial: InventoryItem | null;
  onClose: () => void;
  onSubmit: (draft: Draft) => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('furniture');
  const [weight, setWeight] = useState<WeightClass>('medium');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed once per open so the user's typing is never clobbered mid-edit.
  if (visible && !seeded) {
    setName(initial?.name ?? '');
    setCategory(initial?.category ?? 'furniture');
    setWeight(initial?.estimatedWeightClass ?? 'medium');
    setLength(initial ? String(initial.dimensions.lengthIn) : '');
    setWidth(initial ? String(initial.dimensions.widthIn) : '');
    setHeight(initial ? String(initial.dimensions.heightIn) : '');
    setSeeded(true);
  }
  if (!visible && seeded) setSeeded(false);

  const dims = { lengthIn: num(length), widthIn: num(width), heightIn: num(height) };
  const valid = name.trim().length > 0 && dims.lengthIn > 0 && dims.widthIn > 0 && dims.heightIn > 0;
  const preview = valid ? cubicFeetFor({ ...dims, isEstimated: false }) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title || 'Item'}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.iconButton}>
              <Text style={styles.iconButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <SectionLabel>NAME</SectionLabel>
            <TextInput value={name} onChangeText={setName} style={styles.input} accessibilityLabel="Item name" placeholder="Sofa" placeholderTextColor={colors.textDim} />

            <SectionLabel>SIZE IN INCHES</SectionLabel>
            <View style={styles.dimRow}>
              <DimField label="Length" value={length} onChange={setLength} />
              <DimField label="Width" value={width} onChange={setWidth} />
              <DimField label="Height" value={height} onChange={setHeight} />
            </View>
            <Text style={styles.preview}>{valid ? `${preview} ft³` : 'Enter all three dimensions'}</Text>

            <SectionLabel>CATEGORY</SectionLabel>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
              ))}
            </View>

            <SectionLabel>HOW HEAVY?</SectionLabel>
            <View style={styles.chipRow}>
              {WEIGHTS.map((w) => (
                <Chip key={w} label={w} active={weight === w} onPress={() => setWeight(w)} />
              ))}
            </View>
            <Text style={styles.weightHint}>
              This decides where it lands in your load order — a heavy box of books rides
              differently from a light box of linens.
            </Text>

            <Divider />
            <PrimaryButton
              title="Save"
              disabled={!valid}
              onPress={() =>
                onSubmit({
                  name: name.trim(),
                  category,
                  estimatedWeightClass: weight,
                  dimensions: { ...dims, isEstimated: false },
                })
              }
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DimField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.dimField}>
      <Text style={styles.dimLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel={`${label} in inches`}
        placeholder="0"
        placeholderTextColor={colors.textDim}
      />
    </View>
  );
}

function num(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  empty: { gap: space.md },
  emptyTitle: { ...type.heading, color: colors.text },
  emptyBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  room: { gap: space.sm },
  roomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  roomName: { ...type.title, fontSize: 19, color: colors.text },
  roomTotal: { ...type.caption, color: colors.textMuted },
  roomEmpty: { ...type.caption, color: colors.textDim, paddingVertical: space.sm },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  itemCardFlagged: { borderColor: colors.amber, backgroundColor: colors.surfaceRaised },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  itemNameBlock: { flex: 1, gap: 2 },
  itemName: { ...type.bodyStrong, color: colors.text },
  itemMeta: { ...type.caption, color: colors.textMuted },
  itemReason: { ...type.caption, color: colors.amber },
  itemActions: { flexDirection: 'row', gap: space.sm },
  itemAction: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  itemActionPrimary: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  itemActionText: { ...type.caption, fontWeight: '600', color: colors.textMuted },
  itemActionTextPrimary: { color: colors.text },
  itemEditLink: { alignSelf: 'flex-start', paddingVertical: space.xs },
  itemEditLinkText: { ...type.caption, color: colors.accent, fontWeight: '600' },
  iconButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { color: colors.textDim, fontSize: 16 },
  coverage: { gap: space.sm },
  coverageBody: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  coverageChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  addRoom: { gap: space.sm },
  addRoomRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: colors.text,
    ...type.body,
    minHeight: 44,
  },
  footer: {
    padding: space.lg,
    paddingBottom: space.xl,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  footerHint: { ...type.caption, color: colors.amber, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(6,12,22,0.75)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
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
  modalBody: { padding: space.lg, paddingBottom: space.xxl, gap: space.sm },
  dimRow: { flexDirection: 'row', gap: space.sm },
  dimField: { flex: 1, gap: space.xs },
  dimLabel: { ...type.caption, color: colors.textDim },
  preview: { ...type.bodyStrong, color: colors.accent, marginTop: space.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  weightHint: { ...type.caption, color: colors.textDim, lineHeight: 18, marginTop: space.xs },
});
