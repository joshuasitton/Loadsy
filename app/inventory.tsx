import { useRouter } from 'expo-router';
import { formatCuFt } from '../src/ui/format';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  canLeaveInventory,
  confidenceBannerCopy,
  inventoryBlockedReason,
  isUnresolved,
  markConfirmed,
  unresolvedCount,
  unresolvedDuplicates,
} from '../src/domain/confidence';
import { COMMONLY_MISSED } from '../src/domain/coverage';
import type { SuspectedDuplicate } from '../src/domain/duplicates';
import type { InventoryItem, ItemCategory, WeightClass } from '../src/domain/types';
import { cubicFeetFor } from '../src/domain/volume';
import { useMove } from '../src/state/moveStore';
import { ADDED_BY_HAND, resolveRoomId } from '../src/domain/rooms';
import { Banner, Card, Chip, Divider, PrimaryButton, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';
import { StepNav } from '../src/ui/StepNav';

/** Screen 2 — Inventory Review. */

const CATEGORIES: ItemCategory[] = ['furniture', 'box', 'appliance', 'fragile', 'other'];
const WEIGHTS: WeightClass[] = ['light', 'medium', 'heavy'];

export default function InventoryScreen() {
  const router = useRouter();
  const { move, dispatch, recommendation } = useMove();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [addingToRoom, setAddingToRoom] = useState<string | null>(null);

  const unresolved = unresolvedCount(move);
  const items = useMemo(() => move.rooms.flatMap((room) => room.items), [move.rooms]);

  /** Items added by hand go into one group of their own, created the first time. */
  function addByHand() {
    const id = resolveRoomId(move, ADDED_BY_HAND, `room-${Date.now()}`);
    dispatch({ type: 'addRoom', id, name: ADDED_BY_HAND });
    setAddingToRoom(id);
  }
  const duplicates = useMemo(() => unresolvedDuplicates(move), [move]);
  // The single source of truth for the CTA — programmatic, per spec §3 Screen 2.
  const canAdvance = canLeaveInventory(move);

  const totals = useMemo(
    () => ({ items: move.rooms.reduce((n, r) => n + r.items.length, 0), cuFt: recommendation.rawCuFt }),
    [move.rooms, recommendation.rawCuFt],
  );

  // StepNav owns the navigation; this is only the status change that goes with it.
  function advance() {
    dispatch({ type: 'setStatus', status: 'truckAndPrice' });
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
        ) : duplicates.length > 0 ? (
          <Banner
            tone="amber"
            title={`${duplicates.length} ${duplicates.length === 1 ? 'item may be' : 'items may be'} listed twice`}
            message="Photos taken at different times often catch the same piece – through a doorway, or from another angle. Tell us which, so it's only counted once."
          />
        ) : totals.items > 0 ? (
          <Banner tone="green" title="Inventory looks good" message={`${totals.items} items · ${formatCuFt(totals.cuFt)} ft³ before packing buffer`} />
        ) : null}

        {totals.items === 0 ? (
          <Card style={styles.empty}>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyBody}>
              Take photos of what you&apos;re moving, or add items by hand — both work.
            </Text>
            <PrimaryButton title="Take photos" onPress={() => router.push('/capture')} />
          </Card>
        ) : null}

        {duplicates.map((pair) => (
          <DuplicateCard
            key={pair.key}
            pair={pair}
            onKeepOne={() => dispatch({ type: 'removeItem', itemId: pair.second.item.id })}
            onKeepBoth={() => dispatch({ type: 'keepDuplicate', key: pair.key })}
          />
        ))}

        {/*
          One list, decided 18 September: "stuff is stuff". Rooms still exist underneath – one
          per batch of photos, see src/domain/rooms.ts – but nobody names or reads one.
        */}
        {items.length > 0 ? (
          <View style={styles.room}>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onEdit={() => setEditing(item)}
                onConfirm={() => dispatch({ type: 'updateItem', item: markConfirmed(item) })}
                onRemove={() => dispatch({ type: 'removeItem', itemId: item.id })}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.addRow}>
          <SecondaryButton title="+ Add item by hand" onPress={addByHand} />
          {totals.items > 0 ? (
            <SecondaryButton title="+ Add more photos" onPress={() => router.push('/capture')} />
          ) : null}
        </View>

        {totals.items > 0 ? (
          <Card style={styles.coverage}>
            <SectionLabel>EASY TO MISS</SectionLabel>
            <Text style={styles.coverageBody}>
              Anything left out makes the truck too small – the one mistake moving day can&apos;t fix.
              If you have these, did you get them?
            </Text>
            <View style={styles.coverageList}>
              {COMMONLY_MISSED.map((area) => (
                <Text key={area.id} style={styles.coverageBody}>
                  <Text style={styles.coverageLabel}>{area.label}</Text> – {area.hint}
                </Text>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <StepNav
          current="/inventory"
          blockedReason={canAdvance ? null : inventoryBlockedReason(move)}
          onAdvance={advance}
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const flagged = isUnresolved(item);
  const { lengthIn, widthIn, heightIn } = item.dimensions;

  return (
    <View style={[styles.itemCard, flagged && styles.itemCardFlagged]}>
      <View style={styles.itemTop}>
        <View style={styles.itemNameBlock}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemMeta}>
            {lengthIn}″ × {widthIn}″ × {heightIn}″ · {formatCuFt(item.cubicFeet)} ft³
          </Text>
        </View>
        {confirmingRemove ? (
          <View style={styles.confirmRow}>
            <Pressable
              onPress={() => setConfirmingRemove(false)}
              accessibilityRole="button"
              accessibilityLabel="Cancel remove"
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={`Confirm remove ${item.name}`}
              style={styles.iconButton}
            >
              <Text style={[styles.iconButtonText, styles.removeText]}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmingRemove(true)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            hitSlop={10}
            style={styles.iconButton}
          >
            <Text style={styles.iconButtonText}>✕</Text>
          </Pressable>
        )}
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
            <Text style={styles.preview}>{valid ? `${formatCuFt(preview)} ft³` : 'Enter all three dimensions'}</Text>

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
        keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'number-pad'}
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

/**
 * One piece that looks listed twice – usually the same furniture caught by two batches of
 * photos – and the question only the person can answer. "It's one" removes the second
 * listing; "I have two" keeps both and stops asking. See src/domain/duplicates.ts.
 */
function DuplicateCard({
  pair,
  onKeepOne,
  onKeepBoth,
}: {
  pair: SuspectedDuplicate;
  onKeepOne: () => void;
  onKeepBoth: () => void;
}) {
  const { first, second } = pair;
  const name = first.item.name === second.item.name ? first.item.name : `${first.item.name} / ${second.item.name}`;
  const size = Math.max(first.item.cubicFeet, second.item.cubicFeet);
  return (
    <Card style={styles.duplicate}>
      <Text style={styles.itemName}>{name}</Text>
      <Text style={styles.itemMeta}>Listed twice · {formatCuFt(size)} ft³ each</Text>
      <Text style={styles.duplicateQuestion}>Is it one piece, or two?</Text>
      <View style={styles.duplicateActions}>
        <SecondaryButton
          title="It's one – count it once"
          onPress={onKeepOne}
          accessibilityLabel={`${name} is one piece – remove the second listing`}
        />
        <SecondaryButton title="I have two" onPress={onKeepBoth} accessibilityLabel={`I have two – keep both listings of ${name}`} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xl, gap: space.lg },
  empty: { gap: space.md },
  emptyTitle: { ...type.heading, color: colors.text },
  emptyBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  room: { gap: space.sm },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.sm,
  },
  itemCardFlagged: { borderColor: colors.amber, backgroundColor: colors.surfaceRaised },
  duplicate: { gap: space.sm, borderColor: colors.amber, borderWidth: 1 },
  duplicateQuestion: { ...type.bodyStrong, color: colors.text, marginTop: space.xs },
  duplicateActions: { gap: space.sm },
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
    borderColor: colors.borderStrong,
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
  confirmRow: { flexDirection: 'row', gap: space.sm },
  /*
   * The palette's red, not a hand-picked one. The literal that was here measured
   * 3.56:1 on a card — below the 4.5:1 this app holds itself to — and it sat on
   * the label for a destructive action, which is the last word anybody should
   * have to squint at. `colors.danger` is 6.76:1 there and is already pinned by
   * __tests__/contrast.test.ts, so using the token means this pair stays checked.
   */
  removeText: { color: colors.danger },
  coverage: { gap: space.sm },
  coverageBody: { ...type.caption, color: colors.textMuted, lineHeight: 18 },
  coverageList: { gap: space.xs },
  coverageLabel: { color: colors.text, fontWeight: '600' },
  addRow: { gap: space.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
