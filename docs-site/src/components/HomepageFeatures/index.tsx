import Heading from '@theme/Heading';

interface Feature {
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    title: 'List-Agnostic Sortable',
    description:
      'Works with FlatList, FlashList, LegendList, or any list component. One API, any renderer.',
  },
  {
    title: 'Cross-Container Drag',
    description:
      'Move items between lists — works with FlashList, LegendList, FlatList. Phantom slots, auto-scroll, and smooth transfers.',
  },
  {
    title: 'UI-Thread Performance',
    description:
      'Spatial index worklet runs hit-testing on the UI thread. SharedValues split by update frequency for 60fps.',
  },
  {
    title: '19 Callback Events',
    description:
      'Full drag lifecycle control: drag start, enter, over, exit, end, drop, snap, monitor — and continuous callbacks.',
  },
  {
    title: 'Three Platforms',
    description:
      'iOS, Android, and Web. New Architecture (Fabric) compatible. Built on Reanimated 4 + Gesture Handler 3.',
  },
  {
    title: 'Composable Architecture',
    description:
      'Use DraxList for convenience, or compose useSortableList + SortableContainer + SortableItem for full control.',
  },
];

export default function HomepageFeatures(): JSX.Element {
  return (
    <section className="container">
      <div className="features-grid">
        {features.map((feature, idx) => (
          <div key={idx} className="feature-card">
            <Heading as="h3">{feature.title}</Heading>
            <p>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
