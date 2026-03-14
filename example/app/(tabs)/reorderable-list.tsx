import { useRef, useState } from 'react';
import { StyleSheet, View, Text, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DraxProvider,
  SortableContainer,
  SortableItem,
  useSortableList,
} from 'react-native-drax';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const getBackgroundColor = (alphaIndex: number) => {
  switch (alphaIndex % 6) {
    case 0:
      return '#ffaaaa';
    case 1:
      return '#aaffaa';
    case 2:
      return '#aaaaff';
    case 3:
      return '#ffffaa';
    case 4:
      return '#ffaaff';
    case 5:
      return '#aaffff';
    default:
      return '#aaaaaa';
  }
};

const getHeight = (alphaIndex: number) => {
  let height = 50;
  if (alphaIndex % 2 === 0) {
    height += 10;
  }
  if (alphaIndex % 3 === 0) {
    height += 20;
  }
  return height;
};

const getItemStyleTweaks = (alphaItem: string) => {
  const alphaIndex = alphabet.indexOf(alphaItem);
  return {
    backgroundColor: getBackgroundColor(alphaIndex),
    height: getHeight(alphaIndex),
  };
};

function ListHeader() {
  return (
    <View testID="list-header" style={styles.header}>
      <Text style={styles.headerText}>
        Long-press any list item to drag it to a new position. Dragging an item
        over the top or bottom edge of the container will automatically scroll
        the list. Swiping up or down without the initial long-press will scroll
        the list normally.
      </Text>
    </View>
  );
}

export default function ReorderableList() {
  const [alphaData, setAlphaData] = useState(alphabet);
  const listRef = useRef<FlatList<string>>(null);
  const insets = useSafeAreaInsets();

  const sortable = useSortableList({
    data: alphaData,
    keyExtractor: (item) => item,
    onReorder: ({ data, fromIndex, fromItem, toIndex, toItem }) => {
      console.log(
        `[reorderableList:onReorder] from=${fromIndex} (${fromItem}) to=${toIndex} (${toItem})`
      );
      setAlphaData(data);
    },
    onDragStart: ({ index, item }) => {
      console.log(`[reorderableList:onDragStart] index=${index} item=${item}`);
    },
    onDragPositionChange: ({ index, item, toIndex, previousIndex }) => {
      console.log(`[reorderableList:onDragPositionChange] index=${index} item=${item} toIndex=${toIndex} previousIndex=${previousIndex}`);
    },
    onDragEnd: ({ index, item, toIndex, cancelled }) => {
      console.log(
        `[reorderableList:onDragEnd] index=${index} item=${item} toIndex=${toIndex} cancelled=${cancelled}`
      );
    },
  });

  return (
    <DraxProvider>
      <View
        testID="reorderable-list-screen"
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <SortableContainer
          sortable={sortable}
          scrollRef={listRef}
          style={styles.container}
          draxViewProps={{
            testID: 'sortable-list-container',
            accessibilityLabel: 'Reorderable list of letters A through Z',
          }}
          renderDropIndicator={() => (
            <View style={styles.dropIndicator} />
          )}
        >
          <FlatList
            ref={listRef}
            data={sortable.data}
            style={styles.list}
            keyExtractor={sortable.stableKeyExtractor}
            onScroll={sortable.onScroll}
            onContentSizeChange={sortable.onContentSizeChange}
            scrollEventThrottle={16}
            ListHeaderComponent={ListHeader}
            renderItem={({ item, index }) => (
              <SortableItem
                sortable={sortable}
                index={index}
                testID={`sortable-item-${item}`}
                accessibilityLabel={`Letter ${item}, position ${index + 1}`}
                accessibilityHint="Long press and drag to reorder"
                accessibilityRole="button"
                style={[styles.alphaItem, getItemStyleTweaks(item)]}
              >
                <Text style={styles.alphaText}>{item}</Text>
              </SortableItem>
            )}
          />
        </SortableContainer>
      </View>
    </DraxProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  header: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 16,
    fontStyle: 'italic',
  },
  alphaItem: {
    backgroundColor: '#aaaaff',
    borderRadius: 8,
    margin: 4,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alphaText: {
    fontSize: 28,
  },
  dropIndicator: {
    height: 3,
    backgroundColor: '#3b82f6',
    borderRadius: 1.5,
    width: '100%',
    marginLeft: 4,
  },
});
