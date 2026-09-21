import { Link } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ANTHROPIC_PRIVACY_URL, PRIVACY_UPDATED, SUPPORT_EMAIL, SUPPORT_PATH } from '../src/domain/site';
import { Card, Screen, SectionLabel } from '../src/ui/components';
import { colors, space, type } from '../src/ui/theme';

/**
 * The privacy policy – a screen in the app and a page on the web, one file.
 *
 * Apple requires a policy URL in App Store Connect and a link inside the app, and
 * the policy has to describe what the app actually does. Writing it as a route means
 * the web page and the in-app screen cannot disagree, and it means the wording sits
 * beside the code it describes: `app/v1/detect+api.ts` is the pass-through it
 * promises, `src/vision/rateLimit.ts` is the address counting it admits to.
 *
 * Every sentence here is a claim about the code. When the code changes, this changes,
 * and `PRIVACY_UPDATED` moves. Do not soften a sentence to make the app sound better
 * than it is; change the app.
 */
export default function PrivacyScreen() {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.title}>Privacy</Text>
          <Text style={styles.updated}>Last changed {PRIVACY_UPDATED}</Text>
          <Text style={styles.lede}>
            Loadsy sizes a moving truck from photographs of what you are moving. This page says
            what happens to those photographs and to everything else the app holds. It is written
            to match what the app does, and it changes when the app does.
          </Text>
        </View>

        <Card style={styles.block}>
          <SectionLabel>WHAT LEAVES YOUR PHONE</SectionLabel>
          <Para>
            Only the photos you choose to measure, and only when you ask. Each set of photos is
            sent once, over an encrypted connection, to Loadsy&apos;s server, along with the
            ceiling height if you gave one. Nothing else goes with them: no name, no account, no
            location, no identifier for you or your phone.
          </Para>
          <Para>
            Loadsy&apos;s server passes the photos straight to Anthropic&apos;s vision model, which
            identifies the furniture and estimates its size, and returns that list to your phone.
            The server keeps nothing. The photos are not written to disk, not logged and not held
            after the answer is returned. Loadsy cannot retrieve a photo once it has been answered.
          </Para>
          <Para>
            Anthropic processes the photos to produce the answer. Under its commercial terms it
            does not use them to train its models. It may hold what it receives for a limited period
            for safety monitoring, and then deletes it; Loadsy has no access to it during that time.
            Its policy is at{' '}
            <Text style={styles.link} onPress={() => void Linking.openURL(ANTHROPIC_PRIVACY_URL)}>
              anthropic.com/legal/privacy
            </Text>
            .
          </Para>
          <Para>
            To stop one person using up the measuring service, the server counts requests against
            the internet address they come from, in memory, for fifteen minutes. The address is not
            written anywhere and is forgotten after that.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>WHAT STAYS ON YOUR PHONE</SectionLabel>
          <Para>
            Everything else: your inventory, the sizes you corrected, the truck size, the packing
            plan, your past moves and the ceiling height. They are saved on this phone only. There
            is no account and no copy anywhere else, which is why nobody can see them and why Loadsy
            cannot recover them for you.
          </Para>
          <Para>
            A photo you take from inside Loadsy is held in the app&apos;s temporary storage on the
            phone and is not saved to your photo library. Photos you pick from your library stay
            where they were.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>WHAT LOADSY DOES NOT DO</SectionLabel>
          <Para>
            No account or sign-in. No analytics, advertising or crash-reporting software. No
            location: the &ldquo;near me&rdquo; button opens your maps app with a search phrase, and
            where you are stays between you and the maps app. Nothing is sold or shared with anyone,
            because nothing about you is held.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>RENTAL COMPANIES</SectionLabel>
          <Para>
            Where to Rent opens each company&apos;s own website inside the app. From then on you
            are on their site, under their privacy policy. Loadsy sends them nothing about you, and
            is not paid to list them.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>PERMISSIONS</SectionLabel>
          <Para>
            Camera, to photograph what you are moving. Photo library, to pick photos you already
            took. Each is asked for only when you tap the button that needs it, and the app works
            without either if you add items by hand.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>DELETING YOUR DATA</SectionLabel>
          <Para>
            Past Moves lets you delete any move you have filed. Deleting the app removes everything
            Loadsy holds, because all of it is on the phone. There is nothing on a server to ask us
            to delete.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>CHILDREN</SectionLabel>
          <Para>
            Loadsy is not directed at children under 13 and does not knowingly collect information
            from them. It collects none from anyone.
          </Para>
        </Card>

        <Card style={styles.block}>
          <SectionLabel>CHANGES AND CONTACT</SectionLabel>
          <Para>
            This page is the policy. When the app changes what it does with data, this page
            changes with it and the date at the top moves.
          </Para>
          <ContactLine />
          <Link href={SUPPORT_PATH} style={styles.footLink}>
            <Text style={styles.link}>Help and support →</Text>
          </Link>
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return <Text style={styles.para}>{children}</Text>;
}

/**
 * The address, or the honest absence of one. A policy with an address that does not
 * answer is worse than one that says the address is coming.
 */
export function ContactLine() {
  if (SUPPORT_EMAIL) {
    return (
      <Text style={styles.para}>
        Questions go to{' '}
        <Text style={styles.link} onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
          {SUPPORT_EMAIL}
        </Text>
        .
      </Text>
    );
  }
  return (
    <Text style={styles.para}>
      A support address is being set up and will appear here before Loadsy is in the App Store.
    </Text>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
  head: { gap: space.sm, marginTop: space.sm },
  title: { ...type.title, color: colors.text },
  updated: { ...type.caption, color: colors.textDim },
  lede: { ...type.body, color: colors.textMuted, lineHeight: 22 },
  block: { gap: space.md },
  para: { ...type.body, color: colors.text, lineHeight: 22 },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  footLink: { alignSelf: 'flex-start', paddingVertical: space.xs },
});
