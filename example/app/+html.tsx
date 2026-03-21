import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const TITLE = 'react-native-drax — Live Demo';
const DESCRIPTION =
  'Interactive drag-and-drop examples running in your browser — sortable lists, grids, kanban boards, and more.';
const URL = 'https://nuclearpasta.com/react-native-drax/example/';
const IMAGE = 'https://nuclearpasta.com/react-native-drax/example/assets/social-card.png';

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

        {/* Primary */}
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <meta
          name="keywords"
          content="react-native, drag-and-drop, sortable, drax, examples, demo, reanimated, gesture-handler"
        />
        <meta name="robots" content="index, follow" />
        <meta name="author" content="Nuclear Pasta" />
        <meta
          name="theme-color"
          content="#0c0c0e"
          media="(prefers-color-scheme: dark)"
        />
        <meta
          name="theme-color"
          content="#f3f3f0"
          media="(prefers-color-scheme: light)"
        />
        <link rel="canonical" href={URL} />

        {/* Open Graph */}
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={URL} />
        <meta property="og:site_name" content="react-native-drax" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:image" content={IMAGE} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={IMAGE} />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
