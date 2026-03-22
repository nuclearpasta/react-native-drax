function cellClass(val: string, allVals: [string, string, string]): string {
  if (val === 'No') return 'cross';
  if (val === 'Experimental') return 'warning';
  if (val === 'Partial') return 'partial';

  const hasNo = allVals.some(v => v === 'No');
  const allEqual = allVals[0] === allVals[1] && allVals[1] === allVals[2];

  // All three equal → all green
  if (allEqual) return 'check';
  // Some are "No" → those who have it get green
  if (hasNo) return 'check';
  // All have it but values differ → only "Yes" stands out as green
  return val === 'Yes' ? 'check' : '';
}

export default function ComparisonTable(): JSX.Element {
  return (
    <section className="container comparison-section">
      <h2 id="comparison">
        <a href="#comparison" className="comparison-anchor">Choose your library <span className="comparison-hash">#</span></a>
      </h2>
      <p className="comparison-disclaimer">
        This comparison was researched with the help of AI and may contain inaccuracies.
        If you spot an error, please{' '}
        <a href="https://github.com/nuclearpasta/react-native-drax/issues">open an issue</a>.
      </p>
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
          {rows.map(([feature, drax, rndnd, sortables]) => {
            const vals: [string, string, string] = [drax, rndnd, sortables];
            return (
              <tr key={feature}>
                <td>{feature}</td>
                <td className={cellClass(drax, vals)}>
                  {drax === 'Experimental' ? '\u26A0\uFE0F Experimental' : drax}
                </td>
                <td className={cellClass(rndnd, vals)}>{rndnd}</td>
                <td className={cellClass(sortables, vals)}>{sortables}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

const rows: [string, string, string, string][] = [
  // Core capabilities
  ['Free-form drag & drop',                            'Yes',                    'Yes',            'No'],
  ['Sortable list',                                    'Yes',                    'Yes',            'Yes'],
  ['Sortable grid',                                    'Yes',                    'Yes',            'Yes'],
  ['Sortable flex layout',                             'No',                     'No',             'Yes'],
  ['Horizontal sorting',                               'Yes',                    'Yes',            'Yes'],
  ['Cross-container / cross-list reorder',              'Experimental',           'No',             'No'],
  ['List-agnostic (FlatList, FlashList, LegendList)',   'Yes',                    'No',             'No'],

  // Gesture & interaction
  ['Fixed-order items',                                'Yes',                    'No',             '3 modes'],
  ['Drag handles',                                     'Yes',                    'Yes',            'Yes'],
  ['Drag axis locking',                                'Yes',                    'Yes',            'Partial'],
  ['Drag bounds',                                      'Yes',                    'Yes',            'Container only'],
  ['Auto-scrolling',                                   'Yes',                    'Yes',            'Yes'],
  ['Haptic feedback',                                  'No',                     'No',             'Yes'],

  // Visual & animation
  ['Drag state styling',                               '15 props + inactive',    'onStateChange',  '5 props + hook'],
  ['Reorder animation presets',                        '5 presets + custom',      'No',             'No'],
  ['Drop animation',                                   'Custom fn()',             'Custom fn()',    'Duration only'],
  ['Item removal animation',                           'Yes',                    'Grid only',      'Yes'],
  ['Drop indicator',                                   'Yes',                    'No',             'Grid only'],
  ['Dynamic item heights',                             'Yes',                    'Yes',            'Yes'],

  // Hit testing & drop zones
  ['Collision algorithms',                             '3 modes',                '3 modes',        'No'],
  ['Snap alignment',                                   '9-point + custom',       '9-point',        'No'],
  ['Drop zone acceptance',                             'Callback + capacity',    'Capacity only',  'No'],
  ['Monitoring views',                                 'Yes',                    'No',             'No'],
  ['UI-thread DnD collision',                          'Yes',                    'No',             'No'],

  // Callbacks
  ['Event callbacks',                                  '19 types',               '~12 types',      '~10 types'],
  ['Continuous drag callbacks',                        '4 types',                '1 type',         '1 type'],
  ['Provider-level callbacks',                        'Yes',                    'Yes',            'No'],

  // Platform & accessibility
  ['Accessibility',                                    'Yes',                    'Manual',         'Manual'],
  ['Reduced motion',                                   'Yes',                    'No',             'No'],
  ['AI agent skills',                                  'No',                     'Yes',            'No'],
  ['Web support',                                      'Yes',                    'No',             'Partial'],
  ['Reanimated',                                       '4',                      '\u2265 4.2',     '\u2265 3'],
  ['Gesture Handler',                                  '3 (beta)',               '\u2265 2.28',    '\u2265 2'],
];
