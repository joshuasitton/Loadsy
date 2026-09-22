import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PHOTO_TIPS } from '../src/domain/photoTips';
import { PRIVACY_PATH } from '../src/domain/site';
import { Card, Screen, SectionLabel } from '../src/ui/components';
import { colors, space, type } from '../src/ui/theme';
import { ContactLine } from './privacy';

/**
 * Help – a screen in the app and the support URL App Store Connect asks for, one file.
 *
 * Written from what the app does and the messages it shows, so a person who hit a
 * message can find it here by its own words. The photo tips are the capture screen's,
 * imported, not retyped: two copies of advice drift, and the one on this page would be
 * the one nobody updates.
 */
export default function SupportScreen() {
  const version = Constants.expoConfig?.version ?? '';

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.title}>Help</Text>
          <Text style={styles.lede}>
            Photograph what you are moving. Loadsy lists the furniture, sizes the truck, says where
            to rent it and gives you the order to load it in.
          </Text>
        </View>

        <Card style={styles.block}>
          <SectionLabel>HOW IT WORKS</SectionLabel>
          <Para>
            Each set of photos is measured as one request, so two photos of the same sofa count as
            one sofa. Loadsy identifies each piece, estimates its size, and adds the pieces up in
            cubic feet. The truck is the smallest size that holds that total with room to spare.
          </Para>
          <Para>
            Measuring takes up to a minute a set. The screen shows progress while it waits. If it
            gives up, try again or add the items by hand; nothing you have already measured is lost.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>GETTING AN ACCURATE READ</SectionLabel>
          {PHOTO_TIPS.map((tip) => (
            <View key={tip.title} style={styles.tip}>
              <Text style={styles.tipTitle}>{tip.title}</Text>
              <Text style={styles.tipBody}>{tip.body}</Text>
            </View>
          ))}
        </Card>

        <Card style={styles.block}>
          <SectionLabel>CHECK THE LIST</SectionLabel>
          <Para>
            Every size is an estimate, and every one can be corrected. Items that need a look are
            marked, and the truck is not sized until you have looked at them. When two sets of
            photos seem to show the same piece, Loadsy asks whether it is one piece or two rather
            than guessing.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>WHY THE TRUCK MAY BE A SIZE UP</SectionLabel>
          <Para>
            Loadsy keeps 15% of the truck in reserve. A load that only just fits on paper becomes
            two trips on the day, so when your total is close to the line it recommends the larger
            truck and says so.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>PICKUPS AND TRAILERS</SectionLabel>
          <Para>
            When everything fits, Loadsy offers a pickup or a trailer beside the truck, and says why
            when one does not. It judges furniture as it stands: a bed frame you would take apart is
            measured whole. The truck stays the recommendation, and it is what the packing plan is
            worked out for.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>PRICES</SectionLabel>
          <Para>
            Loadsy does not show prices. Where to Rent lists the companies that rent the size you
            need, and each one&apos;s own site gives its price for your dates. Loadsy is not paid to
            list them.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>IF YOU SEE A MESSAGE</SectionLabel>
          <Para>
            <Text style={styles.strong}>Couldn&apos;t measure those photos.</Text> The photos reached
            us but could not be read. Try once more, or add the items by hand.
          </Para>
          <Para>
            <Text style={styles.strong}>That took too long.</Text> Measuring passed a minute. Fewer
            photos in a set, or a better-lit room, usually fixes it.
          </Para>
          <Para>
            <Text style={styles.strong}>Give it a few minutes.</Text> Loadsy measures a limited number
            of photo sets from one place at a time. Wait a few minutes and try again.
          </Para>
          <Para>
            <Text style={styles.strong}>Connection problem.</Text> The photos never left the phone.
            Check your connection; what you have already measured is safe.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>YOUR DATA</SectionLabel>
          <Para>
            Everything but the photos you measure stays on this phone, and the photos are not kept.
          </Para>
          <Link href={PRIVACY_PATH} style={styles.footLink}>
            <Text style={styles.link}>Read the privacy policy →</Text>
          </Link>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>CONTACT</SectionLabel>
          <ContactLine />
          {version ? <Text style={styles.version}>Loadsy {version}</Text> : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  head: { gap: space.sm, marginTop: space.sm },
  title: { ...type.title, color: colors.text },
  lede: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  block: { gap: space.md },
  para: { ...type.body, color: colors.text, lineHeight: 22 },
  strong: { ...type.bodyStrong },
  tip: { gap: 2 },
  tipTitle: { ...type.heading, color: colors.text },
  tipBody: { ...type.caption, color: colors.textMuted, lineHeight: 19 },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  footLink: { alignSelf: 'flex-start', paddingVertical: space.xs },
  version: { ...type.caption, color: colors.textDim },
});
