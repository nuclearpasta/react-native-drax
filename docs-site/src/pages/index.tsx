import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import CodeBlock from '@theme/CodeBlock';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import ComparisonTable from '@site/src/components/ComparisonTable';

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform) {
    case 'iOS':
      return (
        <svg aria-hidden="true" className="platform-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="3.5" width="10" height="17" rx="2.4" />
          <path d="M10.5 6.5h3" />
          <path d="M11.5 17.5h1" />
        </svg>
      );
    case 'Android':
      return (
        <svg aria-hidden="true" className="platform-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7.5 9.5h9a2 2 0 0 1 2 2v4.5a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V11.5a2 2 0 0 1 2-2Z" />
          <path d="M9 9.5 7.7 7.4" />
          <path d="M15 9.5 16.3 7.4" />
          <path d="M9.5 13h.01" />
          <path d="M14.5 13h.01" />
        </svg>
      );
    case 'Web':
      return (
        <svg aria-hidden="true" className="platform-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M3.5 8.5h17" />
          <path d="M8.5 19.5h7" />
        </svg>
      );
    default:
      return null;
  }
}

function HeroSection() {
  return (
    <section className="hero-section">
      <p className="eyebrow">react-native-drax</p>
      <Heading as="h1">
        Drag&#8209;and&#8209;drop for React&nbsp;Native. Done&nbsp;right.
      </Heading>
      <p className="hero-lead">
        Sortable lists, grids, cross-container drag, drag handles, collision
        algorithms, and more. Built on Reanimated&nbsp;4 with a UI-thread-first
        architecture for smooth 60fps interactions on iOS, Android, and Web.
      </p>
      <ul className="platform-chips" aria-label="Supported platforms">
        {(['iOS', 'Android', 'Web'] as const).map((p) => (
          <li key={p}><PlatformIcon platform={p} /><span>{p}</span></li>
        ))}
      </ul>
      <p className="works-with">
        Works with <strong>FlatList</strong> · <strong>FlashList</strong> · <strong>LegendList</strong> · or any list component
      </p>
      <code className="install-command">npm install react-native-drax</code>
      <div className="cta-buttons">
        <Link className="button button--primary" to="/getting-started">
          <svg aria-hidden="true" className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          Get Started
        </Link>
        <Link className="button button--secondary" to="/quick-start">
          <svg aria-hidden="true" className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 3 14 9-14 9V3z"/></svg>
          Quick Start
        </Link>
        <Link className="button button--outline" to="/examples">
          <svg aria-hidden="true" className="cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
          Live Examples
        </Link>
        <Link
          className="button button--outline"
          href="https://github.com/nuclearpasta/react-native-drax"
        >
          <svg aria-hidden="true" className="cta-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.11.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61a3.18 3.18 0 0 0-1.33-1.76c-1.09-.74.08-.73.08-.73a2.52 2.52 0 0 1 1.84 1.24 2.56 2.56 0 0 0 3.5 1 2.56 2.56 0 0 1 .76-1.6c-2.67-.3-5.47-1.33-5.47-5.93a4.64 4.64 0 0 1 1.24-3.22 4.3 4.3 0 0 1 .12-3.18s1-.33 3.3 1.23a11.38 11.38 0 0 1 6 0c2.28-1.56 3.29-1.23 3.29-1.23a4.3 4.3 0 0 1 .12 3.18 4.64 4.64 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92a2.86 2.86 0 0 1 .82 2.23v3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3"/></svg>
          GitHub
        </Link>
      </div>
    </section>
  );
}

const basicExample = `import { DraxProvider, DraxView } from 'react-native-drax';

function App() {
  return (
    <DraxProvider>
      <DraxView
        style={{ width: 100, height: 100, backgroundColor: 'blue' }}
        onDragStart={() => console.log('dragging')}
        payload="hello"
      />
      <DraxView
        style={{ width: 100, height: 100, backgroundColor: 'green' }}
        onReceiveDragDrop={({ dragged: { payload } }) => {
          console.log(\`received: \${payload}\`);
        }}
      />
    </DraxProvider>
  );
}`;

const sortableExample = `import { useState } from 'react';
import { Text, View } from 'react-native';
import { DraxProvider, DraxList } from 'react-native-drax';

function App() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D', 'E']);

  return (
    <DraxProvider>
      <DraxList
        data={items}
        keyExtractor={(item) => item}
        onReorder={({ data }) => setItems(data)}
        renderItem={({ item }) => (
          <View style={{ padding: 16, backgroundColor: '#eee', margin: 4 }}>
            <Text>{item}</Text>
          </View>
        )}
      />
    </DraxProvider>
  );
}`;

const composableExample = `import {
  DraxProvider, useSortableList,
  SortableContainer, SortableItem,
} from 'react-native-drax';
import { FlatList, Text } from 'react-native';

function App() {
  const [items, setItems] = useState(['A', 'B', 'C', 'D', 'E']);
  const listRef = useRef<FlatList>(null);
  const sortable = useSortableList({
    data: items,
    keyExtractor: (item) => item,
    onReorder: ({ data }) => setItems(data),
  });

  return (
    <DraxProvider>
      <SortableContainer sortable={sortable} scrollRef={listRef}>
        <FlatList
          ref={listRef}
          data={sortable.data}
          keyExtractor={sortable.stableKeyExtractor}
          onScroll={sortable.onScroll}
          onContentSizeChange={sortable.onContentSizeChange}
          renderItem={({ item, index }) => (
            <SortableItem sortable={sortable} index={index}>
              <Text>{item}</Text>
            </SortableItem>
          )}
        />
      </SortableContainer>
    </DraxProvider>
  );
}`;

function CodeExamples() {
  return (
    <section>
      <Heading as="h2" className="code-examples-heading">
        Three lines to drag. Five to sort.
      </Heading>
      <div className="container tabs-container">
        <Tabs>
          <TabItem value="basic" label="Basic Drag & Drop" default>
            <CodeBlock language="tsx" title="App.tsx">
              {basicExample}
            </CodeBlock>
          </TabItem>
          <TabItem value="sortable" label="Sortable List">
            <CodeBlock language="tsx" title="App.tsx">
              {sortableExample}
            </CodeBlock>
          </TabItem>
          <TabItem value="composable" label="Composable API">
            <CodeBlock language="tsx" title="App.tsx">
              {composableExample}
            </CodeBlock>
          </TabItem>
        </Tabs>
      </div>
    </section>
  );
}

function FooterCTA() {
  return (
    <section className="footer-cta container">
      <Heading as="h2">Ready to build?</Heading>
      <p>
        Get started in minutes with the{' '}
        <Link to="/getting-started">installation guide</Link>, or explore the{' '}
        <Link to="/quick-start">quick start examples</Link>.
      </p>
      <div className="cta-buttons">
        <Link className="button button--primary" to="/getting-started">
          Read the Docs
        </Link>
        <Link
          className="button button--outline"
          href="https://github.com/nuclearpasta/react-native-drax"
        >
          Star on GitHub
        </Link>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  return (
    <Layout
      title="Drag-and-drop for React Native"
      description="A drag-and-drop framework for React Native with sortable lists, grids, cross-container drag, and more. Built on Reanimated 4."
    >
      <main className="container" style={{ paddingTop: 20, paddingBottom: 40 }}>
        <HeroSection />
        <HomepageFeatures />
        <CodeExamples />
        <ComparisonTable />
        <FooterCTA />
      </main>
    </Layout>
  );
}
