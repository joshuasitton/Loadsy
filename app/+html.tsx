import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The HTML document every web page is rendered into. Web only — native never
 * loads this file.
 *
 * It exists because the deployed app gets sent to people as a link. Without it
 * the tab is untitled and a pasted URL unfurls as a bare hostname in Slack or
 * iMessage, which is a poor first impression of a product whose whole pitch is
 * that it is careful about details.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>Loadsy — Right size truck. Right price. Right plan.</title>
        <meta
          name="description"
          content="Photograph your rooms and Loadsy works out how much truck you actually need, what it costs nearby, and the order to load it in."
        />
        <meta name="theme-color" content="#FFFFFF" />

        <meta property="og:type" content="website" />
        <meta property="og:title" content="Loadsy" />
        <meta
          property="og:description"
          content="Photograph your rooms and Loadsy works out how much truck you actually need."
        />
        <meta name="twitter:card" content="summary" />

        {/*
          Disables body scrolling on web so ScrollView components behave as they do
          on native. Remove it only if the app should scroll the document itself.
        */}
        <ScrollViewStyleReset />

        {/* Paint the page the app's own background before React mounts. The app is
            white now, so this no longer hides a flash — it keeps the ground from
            being whatever the browser defaults to, which is not always white. */}
        <style dangerouslySetInnerHTML={{ __html: BACKGROUND }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const BACKGROUND = `body { background-color: #FFFFFF; }`;
