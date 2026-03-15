import { DraxHandle } from './DraxHandle';
import { DraxProvider } from './DraxProvider';
import { DraxScrollView } from './DraxScrollView';
import { DraxSortableList } from './DraxSortableList';
import { DraxView } from './DraxView';
import { SortableBoardContainer } from './SortableBoardContainer';
import { SortableContainer } from './SortableContainer';
import { SortableItem } from './SortableItem';

/**
 * Namespace object for convenient access to all Drax components.
 *
 * @example
 * ```tsx
 * import { Drax } from 'react-native-drax';
 *
 * <Drax.Provider>
 *   <Drax.View draggable>
 *     <Drax.Handle><GripIcon /></Drax.Handle>
 *   </Drax.View>
 * </Drax.Provider>
 * ```
 */
export const Drax = {
  Handle: DraxHandle,
  Provider: DraxProvider,
  ScrollView: DraxScrollView,
  SortableList: DraxSortableList,
  View: DraxView,
  SortableBoardContainer,
  SortableContainer,
  SortableItem,
} as const;
