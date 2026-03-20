import Heading from '@theme/Heading';

export default function ComparisonTable(): JSX.Element {
  return (
    <section className="container comparison-section">
      <Heading as="h2">How Drax compares</Heading>
      <table>
        <thead>
          <tr>
            <th>Feature</th>
            <th>Drax</th>
            <th>reanimated-dnd</th>
            <th>sortables</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([feature, drax, rndnd, sortables]) => (
            <tr key={feature}>
              <td>{feature}</td>
              <td className={drax === 'No' ? 'cross' : 'check'}>{drax}</td>
              <td className={rndnd === 'No' ? 'cross' : rndnd === 'Yes' ? 'check' : ''}>{rndnd}</td>
              <td className={sortables === 'No' ? 'cross' : sortables === 'Yes' ? 'check' : ''}>{sortables}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

const rows: [string, string, string, string][] = [
  ['Free-form drag & drop',        'Yes',              'Yes',  'No'],
  ['Sortable list',                 'Yes',              'Yes',  'Yes'],
  ['Sortable grid',                 'Yes',              'Yes',  'Yes'],
  ['Cross-container drag (kanban)', 'Yes',              'No',   'No'],
  ['List-agnostic',                 'Yes',              'No',   'No'],
  ['Drag handles',                  'Yes',              'Yes',  'No'],
  ['Collision algorithms',          '3 modes',          'Yes',  'No'],
  ['Drag bounds',                   'Yes',              'Yes',  'No'],
  ['Drop zone acceptance',          'Yes',              'No',   'No'],
  ['Monitoring views',              'Yes',              'No',   'No'],
  ['UI-thread hit-testing',         'Yes',              'No',   'No'],
  ['Hover styles',                  '5 states',         'No',   'No'],
  ['Animation presets',             '5 + custom',       'Yes',  'No'],
  ['Snap alignment',                '9-point',          'No',   'No'],
  ['Accessibility',                 'Yes',              'Yes',  'No'],
  ['Continuous drag callbacks',     'Yes',              'No',   'No'],
  ['Reanimated version',            '4',                '4',    '3'],
  ['Gesture Handler version',       '3 (beta)',         '~2.30','2'],
  ['Web support',                   'Yes',              'No',   'No'],
];
