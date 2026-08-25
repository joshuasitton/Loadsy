import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { TRUCK_LABEL } from '../src/domain/truck';
import { allItems } from '../src/domain/volume';
import {
  computeZones,
  renderTruckMapSVG,
  truckMapAriaLabel,
  type TruckView,
} from '../src/truckmap/renderSvg';
import { useMove } from '../src/state/moveStore';
import { Banner, Card, Chip, PrimaryButton, Screen, SecondaryButton } from '../src/ui/components';
import { colors, radius, space, type } from '../src/ui/theme';

/** Screen 6 — Truck Layout. 3D / Top view toggle, Save Plan and Share. */

const FILE_NAME = 'loadsy-truck-plan.svg';

export default function LayoutViewScreen() {
  const { move, packingPlan, recommendation } = useMove();
  const [view, setView] = useState<TruckView>('top');
  const [saved, setSaved] = useState(false);
  // Rendered inline rather than raised through Alert: react-native-web ships Alert
  // as an empty function, so an alert here is invisible in the browser preview.
  const [problem, setProblem] = useState<{ title: string; message: string } | null>(null);

  // allItems() flatMaps a fresh array every call, so memoising on `items`
  // directly would never hit — every render would re-serialise the whole SVG.
  const items = useMemo(() => allItems(move), [move]);
  // Unlabelled on purpose — see `a11y` below. The saved/shared file is rendered
  // separately, with its label embedded, because it has to stand on its own.
  const svg = useMemo(
    () => renderTruckMapSVG(items, recommendation.size, view, { labelled: false }),
    [items, recommendation.size, view],
  );
  const zones = useMemo(() => computeZones(items), [items]);
  // Derived from `zones`, never from recommendation.rawCuFt: the header states the
  // figure the legend below it adds up to, so the two cannot drift apart on rounding.
  const zonedCuFt = useMemo(
    () => Math.round(zones.reduce((sum, zone) => sum + zone.cubicFeet, 0) * 100) / 100,
    [zones],
  );

  /**
   * react-native-svg reads the accessible name from a different prop on each
   * platform: the native build extracts `accessibilityLabel` (and needs
   * `accessible` for VoiceOver to treat the diagram as one element), while the
   * web build forwards props straight to the DOM, where only `aria-label` means
   * anything. Neither reads the `ariaLabel` that SvgXml's parser produces.
   */
  const a11y = useMemo(() => {
    const label = truckMapAriaLabel(zones, recommendation.size);
    return Platform.OS === 'web'
      ? { 'aria-label': label }
      : { accessible: true, accessibilityLabel: label };
  }, [zones, recommendation.size]);

  /**
   * The variant that leaves the app. Rendered fresh rather than reusing `svg`,
   * which is deliberately unlabelled: a file has no component behind it to carry
   * an accessible name, so it needs the label embedded.
   */
  function exportSvg(): string {
    return renderTruckMapSVG(items, recommendation.size, view);
  }

  /** Writes the diagram and hands back its file:// URI. */
  function writeSvg(directory: Directory): File {
    const file = new File(directory, FILE_NAME);
    if (file.exists) file.delete();
    file.create();
    file.write(exportSvg());
    return file;
  }

  /**
   * expo-file-system is native-only, so on web "save to this device" is what it
   * means in a browser: a download. Guarded by Platform rather than a bundler
   * shim so the native path stays byte-for-byte what it was.
   */
  function downloadOnWeb(svgText: string) {
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = FILE_NAME;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share() {
    setProblem(null);
    try {
      const file = writeSvg(Paths.cache);
      if (!(await Sharing.isAvailableAsync())) {
        setProblem({
          title: 'Sharing unavailable',
          message: 'This device cannot share files right now.',
        });
        return;
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'image/svg+xml',
        // iOS picks share destinations from the UTI, not the mime type.
        UTI: 'public.svg-image',
        dialogTitle: 'Loadsy truck plan',
      });
    } catch {
      setProblem({
        title: "Couldn't share the plan",
        message: 'Try saving it to this device instead.',
      });
    }
  }

  function savePlan() {
    setProblem(null);
    try {
      if (Platform.OS === 'web') {
        downloadOnWeb(exportSvg());
      } else {
        writeSvg(Paths.document);
      }
      setSaved(true);
    } catch {
      setProblem({ title: "Couldn't save the plan", message: 'Try sharing it instead.' });
    }
  }

  if (items.length === 0) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <Banner
            tone="neutral"
            title="Nothing to lay out yet"
            message="Add your inventory and the truck diagram builds itself."
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{TRUCK_LABEL[recommendation.size]}</Text>
          <Text style={styles.subtitle}>
            {zonedCuFt} ft³ across {zones.length}{' '}
            {zones.length === 1 ? 'load zone' : 'load zones'}
          </Text>
          <Text style={styles.subtitleDim}>
            With the {Math.round(recommendation.bufferPct * 100)}% packing buffer,{' '}
            {recommendation.adjustedCuFt} ft³ has to fit.
          </Text>
        </View>

        <View style={styles.tabs}>
          <Chip
            label="Top View"
            active={view === 'top'}
            onPress={() => setView('top')}
            accessibilityLabel="Show the top-down view"
          />
          <Chip
            label="3D View"
            active={view === '3d'}
            onPress={() => setView('3d')}
            accessibilityLabel="Show the three-dimensional view"
          />
        </View>

        <Card style={styles.diagramCard}>
          <View style={styles.diagram}>
            <SvgXml
              xml={svg}
              // Passing `override` explicitly matters twice over: it supplies the
              // accessible name under a prop the platform actually reads, and it
              // stops SvgXml falling back to spreading its own props — which is
              // what copies the entire SVG source onto the element as `xml`.
              override={{ width: '100%', height: '100%', ...a11y }}
            />
          </View>
        </Card>

        <Card style={styles.legend}>
          {zones.map((zone) => (
            <View key={zone.step} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: zone.color }]} />
              <Text style={styles.legendLabel}>
                {zone.step}. {zone.label}
              </Text>
              <Text style={styles.legendValue}>
                {zone.cubicFeet} ft³ · {Math.round(zone.fraction * 100)}%
              </Text>
            </View>
          ))}
        </Card>

        <Text style={styles.caveat}>
          This is a load-zone diagram, not a piece-by-piece packing solution. It shows where each
          group belongs and how much of the truck it takes up.
        </Text>

        {problem ? (
          <Banner tone="danger" title={problem.title} message={problem.message} />
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            title={saved ? 'Plan saved' : 'Save plan to this device'}
            onPress={savePlan}
            disabled={saved || !packingPlan}
          />
          <SecondaryButton
            title="Share"
            onPress={() => { void share(); }}
            accessibilityLabel="Share the truck plan"
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  emptyWrap: { padding: space.lg, marginTop: space.xl },
  header: { gap: 2, marginTop: space.sm },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textMuted },
  subtitleDim: { ...type.caption, color: colors.textDim },
  tabs: { flexDirection: 'row', gap: space.sm },
  diagramCard: { padding: space.sm, backgroundColor: colors.surfaceRaised },
  diagram: { height: 210, borderRadius: radius.sm, overflow: 'hidden' },
  legend: { gap: space.md },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { ...type.body, color: colors.text, flex: 1 },
  legendValue: { ...type.caption, color: colors.textMuted },
  caveat: { ...type.caption, color: colors.textDim, lineHeight: 18 },
  actions: { gap: space.md },
});
