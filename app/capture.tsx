import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { detectItems } from '../src/api/detect';
import { assessPhoto, type PhotoQualitySignals } from '../src/domain/photoQuality';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, PrimaryButton, Screen, SecondaryButton, SectionLabel } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 1 — Capture Room. */

const ROOM_SUGGESTIONS = ['Living Room', 'Bedroom', 'Kitchen', 'Dining Room', 'Office', 'Garage'];

const TIPS = [
  { title: 'Shoot from the doorway', body: 'One wide frame beats five close-ups — Loadsy needs the whole room to judge scale.' },
  { title: 'Get the corners in', body: 'Corners give the walls a reference, which is how furniture depth gets estimated.' },
  { title: 'Turn the lights on', body: 'Bright and still. A dark or blurry photo means guessy measurements.' },
];

export default function CaptureScreen() {
  const router = useRouter();
  const { dispatch } = useMove();
  const [roomName, setRoomName] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejection, setRejection] = useState<ReturnType<typeof assessPhoto> | null>(null);

  const trimmedName = roomName.trim();

  /**
   * Creates the room only when the user has chosen to keep going by hand. The
   * capture path deliberately does NOT create a room up front: a failed or
   * rejected capture used to leave an empty room behind, and retrying left one
   * per attempt.
   */
  function continueByHand() {
    dispatch({ type: 'addRoom', id: `room-${Date.now()}`, name: trimmedName || 'Room' });
    router.replace('/inventory');
  }

  async function capture(source: 'camera' | 'library') {
    if (!trimmedName) {
      Alert.alert(
        'Name the room first',
        'Tell Loadsy which room this is so it can group the items it finds.',
      );
      return;
    }
    setRejection(null);

    try {
      // Spec §5: justify the permission in-app BEFORE the system prompt appears.
      // Only the camera needs one — on iOS the library goes through
      // PHPickerViewController, which returns the chosen asset with no
      // authorization at all. Asking anyway adds a prompt the user can decline,
      // which would kill the only path that works in a simulator.
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Camera access needed',
            'Loadsy uses the photo only to identify furniture and estimate your moving volume. You can enable access in Settings.',
          );
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        quality: 0.7,
        exif: false,
        // The Vision agent in §4.1 is sent the image itself, so the picker has to
        // decode it. Without this, imageData posts as an empty string.
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setBusy(true);
      const photoId = `photo-${Date.now()}`;

      // Spec §3 Screen 1 edge case: gate the photo before it can produce an inventory.
      const signals: PhotoQualitySignals = {
        // Brightness and sharpness come from the Vision agent in production; until
        // then we can only check what the picker gives us and let detection decide.
        brightness: 1,
        sharpness: 1,
        widthPx: asset.width ?? 0,
        heightPx: asset.height ?? 0,
      };
      const preVerdict = assessPhoto(signals);
      if (!preVerdict.ok) {
        setRejection(preVerdict);
        return;
      }

      const roomId = `room-${Date.now()}`;
      const items = await detectItems({
        photoId,
        roomId,
        roomName: trimmedName,
        imageData: asset.base64 ?? '',
      });

      const postVerdict = assessPhoto({ ...signals, detectedItemCount: items.length });
      if (!postVerdict.ok) {
        setRejection(postVerdict);
        return;
      }

      dispatch({ type: 'addRoom', id: roomId, name: trimmedName });
      dispatch({ type: 'addPhoto', roomId, photoId });
      dispatch({ type: 'addItems', roomId, items });
      router.replace('/inventory');
    } catch {
      // launchCameraAsync rejects outright on the iOS Simulator, which has no
      // camera. Every await above is inside this try so that failure surfaces as
      // an explanation rather than an unhandled rejection and a dead button.
      Alert.alert(
        source === 'camera' ? "Can't open the camera" : "Couldn't read that photo",
        source === 'camera'
          ? 'No camera is available on this device. Choose a photo from your library instead.'
          : 'Something went wrong on our side. Try again, or add the items by hand.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionLabel>WHICH ROOM IS THIS?</SectionLabel>
        <TextInput
          value={roomName}
          onChangeText={setRoomName}
          placeholder="Living Room"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          accessibilityLabel="Room name"
          returnKeyType="done"
        />
        <View style={styles.suggestions}>
          {ROOM_SUGGESTIONS.map((name) => (
            <Pressable
              key={name}
              onPress={() => setRoomName(name)}
              accessibilityRole="button"
              accessibilityLabel={`Use room name ${name}`}
              style={styles.suggestion}
            >
              <Text style={styles.suggestionText}>{name}</Text>
            </Pressable>
          ))}
        </View>

        {rejection ? (
          <Banner tone={rejection.recoverable ? 'amber' : 'danger'} title={rejection.title} message={rejection.message}>
            {rejection.recoverable ? (
              <View style={styles.rejectionActions}>
                <SecondaryButton title="Add items by hand" onPress={continueByHand} />
              </View>
            ) : null}
          </Banner>
        ) : null}

        <Card style={styles.tips}>
          <Text style={styles.tipsTitle}>Three things that make this accurate</Text>
          {TIPS.map((tip) => (
            <View key={tip.title} style={styles.tip}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.privacy}>
          <Text style={styles.privacyText}>
            Loadsy reads your photo only to identify furniture and estimate volume. Nothing is
            shared, and nothing is uploaded unless you choose the photo yourself.
          </Text>
        </Card>

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.busyText}>Measuring the room…</Text>
          </View>
        ) : (
          <View style={styles.actions}>
            <PrimaryButton
              title="Take a photo"
              onPress={() => { void capture('camera'); }}
              disabled={!trimmedName}
              accessibilityHint={trimmedName ? undefined : 'Name the room first'}
            />
            <SecondaryButton
              title="Choose from library"
              onPress={() => { void capture('library'); }}
              disabled={!trimmedName}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    color: colors.text,
    ...type.body,
    minHeight: 52,
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: -space.sm },
  suggestion: {
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  suggestionText: { ...type.caption, color: colors.textMuted },
  rejectionActions: { marginTop: space.md },
  tips: { gap: space.md },
  tipsTitle: { ...type.heading, color: colors.text },
  tip: { gap: 2 },
  tipTitle: { ...type.bodyStrong, color: colors.text },
  tipBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  privacy: { backgroundColor: colors.surfaceRaised },
  privacyText: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  actions: { gap: space.md },
  busy: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  busyText: { ...type.body, color: colors.textMuted },
});
