import { useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  leadConsentSentence,
  leadMove,
  validateLeadForm,
  type LeadForm,
  type LeadFormErrors,
  type LeadPartner,
} from '../domain/lead';
import { TRUCK_LABEL, type TruckRecommendation } from '../domain/truck';
import type { Move } from '../domain/types';
import { sendLead } from '../api/lead';
import { PrimaryButton } from './components';
import { colors, radius, space, type } from './theme';

/**
 * "Want quotes from local movers?" – one quiet line under the truck, and a sheet behind
 * it. Rendered only when a build has an `OFFERED_PARTNER`; see src/domain/lead.ts for why it is opt-in and
 * never more hidden than this.
 *
 * The sheet shows what will be sent before anything is typed, then asks for it – and the
 * button stays off until the box naming the partner is ticked. Nothing is kept on the
 * phone: a sent lead is the partner's, and a half-filled form is gone when closed.
 */
export function LeadCard({
  move,
  recommendation,
  partner,
}: {
  move: Move;
  recommendation: TruckRecommendation;
  partner: LeadPartner;
}) {
  const [open, setOpen] = useState(false);
  // An empty inventory is not a move a mover can quote – the server would refuse it.
  if (move.rooms.length === 0 || recommendation.adjustedCuFt < 1) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityHint={`Opens a form to ask ${partner.name} for a quote`}
        hitSlop={8}
        style={styles.line}
      >
        <Text style={styles.lineText}>Rather not drive it yourself? Get a quote from local movers →</Text>
      </Pressable>
      {open ? (
        <LeadSheet move={move} recommendation={recommendation} partner={partner} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

const EMPTY: LeadForm = { contact: '', moveDate: '', fromZip: '', toZip: '', agreed: false };

function LeadSheet({
  move,
  recommendation,
  partner,
  onClose,
}: {
  move: Move;
  recommendation: TruckRecommendation;
  partner: LeadPartner;
  onClose: () => void;
}) {
  const summary = useMemo(() => leadMove(move, recommendation), [move, recommendation]);
  const [form, setForm] = useState<LeadForm>({ ...EMPTY, fromZip: move.originZip });
  const [errors, setErrors] = useState<LeadFormErrors>({});
  const [state, setState] = useState<'editing' | 'sending' | 'sent' | 'failed'>('editing');

  const set = (key: keyof LeadForm) => (value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async () => {
    const result = validateLeadForm(form, summary, partner, new Date());
    if (result.lead === null) {
      setErrors(result.errors);
      return;
    }
    setState('sending');
    setState((await sendLead(result.lead)) === 'sent' ? 'sent' : 'failed');
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Quotes from local movers</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {state === 'sent' ? (
              <>
                <Text style={styles.done}>Sent to {partner.name}.</Text>
                <Text style={styles.note}>
                  They’ll contact you at {form.contact.trim()} about a quote. Loadsy hasn’t kept a copy –
                  anything more goes between you and them.
                </Text>
                <PrimaryButton title="Done" onPress={onClose} />
              </>
            ) : (
              <>
                <Text style={styles.intro}>
                  {partner.name} will contact you with a price for moving it for you. This is what they’ll
                  receive:
                </Text>
                <View style={styles.summary}>
                  <Text style={styles.summaryLine}>
                    {TRUCK_LABEL[summary.truckSize]} · about {summary.cuFt} ft³
                  </Text>
                  <Text style={styles.note}>
                    {summary.itemCount} {summary.itemCount === 1 ? 'item' : 'items'} across {summary.roomCount}{' '}
                    {summary.roomCount === 1 ? 'room' : 'rooms'} – not the list, and no photos
                  </Text>
                </View>

                <Field
                  label="Phone or email"
                  value={form.contact}
                  onChange={set('contact')}
                  error={errors.contact}
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="(703) 555-0100 or you@example.com"
                />
                <Field
                  label="Moving day"
                  value={form.moveDate}
                  onChange={set('moveDate')}
                  error={errors.moveDate}
                  keyboardType="numbers-and-punctuation"
                  placeholder="10/14/2026"
                />
                <View style={styles.pair}>
                  <Field
                    label="From ZIP"
                    value={form.fromZip}
                    onChange={set('fromZip')}
                    error={errors.fromZip}
                    keyboardType="number-pad"
                    autoComplete="postal-code"
                    placeholder="20147"
                    maxLength={5}
                  />
                  <Field
                    label="To ZIP"
                    value={form.toZip}
                    onChange={set('toZip')}
                    error={errors.toZip}
                    keyboardType="number-pad"
                    placeholder="22101"
                    maxLength={5}
                  />
                </View>

                <Pressable
                  onPress={() => set('agreed')(!form.agreed)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: form.agreed }}
                  style={styles.consent}
                >
                  <View style={[styles.box, form.agreed && styles.boxOn]}>
                    {form.agreed ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                  <Text style={styles.consentText}>{leadConsentSentence(partner)}</Text>
                </Pressable>
                {errors.agreed ? <Text style={styles.error}>{errors.agreed}</Text> : null}
                <Pressable
                  onPress={() => void Linking.openURL(partner.privacyUrl)}
                  accessibilityRole="link"
                  hitSlop={6}
                >
                  <Text style={styles.link}>{partner.name}’s privacy policy</Text>
                </Pressable>

                {state === 'failed' ? (
                  <Text style={styles.error}>
                    That didn’t go through, and nothing was sent. Check your connection and try again.
                  </Text>
                ) : null}
                <PrimaryButton
                  title={`Send to ${partner.name}`}
                  onPress={() => void submit()}
                  disabled={!form.agreed}
                  loading={state === 'sending'}
                />
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  keyboardType,
  autoComplete,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
  placeholder: string;
  keyboardType: 'email-address' | 'number-pad' | 'numbers-and-punctuation';
  autoComplete?: 'email' | 'postal-code';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={maxLength}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: space.xs },
  lineText: { ...type.caption, color: colors.accent, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(6,12,22,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
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
  body: { padding: space.lg, paddingBottom: space.xxl, gap: space.md },
  intro: { ...type.body, color: colors.textMuted },
  summary: {
    gap: 2,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryLine: { ...type.bodyStrong, color: colors.text },
  note: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  done: { ...type.heading, color: colors.text },
  pair: { flexDirection: 'row', gap: space.md },
  field: { flex: 1, gap: space.xs },
  label: { ...type.caption, color: colors.text, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    ...type.body,
  },
  inputError: { borderColor: colors.danger },
  error: { ...type.caption, color: colors.danger },
  consent: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', paddingTop: space.sm },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { color: colors.accentText, fontSize: 14, fontWeight: '700' },
  consentText: { ...type.caption, color: colors.text, flex: 1, lineHeight: 19 },
  link: { ...type.caption, color: colors.accent, textDecorationLine: 'underline' },
});
