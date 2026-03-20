import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

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
      </head>
      <body>{children}</body>
    </html>
  );
}
