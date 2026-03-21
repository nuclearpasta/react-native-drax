import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Static inline CSS for initial dark mode background (prevents white flash).
// Content is a static string literal — no user input, no XSS risk.
const darkModeCSS = `
  body { background-color: #f3f3f0; }
  @media (prefers-color-scheme: dark) {
    body { background-color: #0c0c0e; }
  }
`;

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
        <title>react-native-drax examples</title>
        <meta
          name="description"
          content="Interactive examples for react-native-drax — drag-and-drop, sortable lists, grids, kanban boards, and more."
        />
        <meta
          name="keywords"
          content="react-native, drag-and-drop, sortable, drax, examples, demo"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: darkModeCSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
