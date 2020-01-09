## Concept

The basic idea behind Drax is to augment the familiar React Native `View` component with attributes that enable it to be dragged around the screen, or to receive or monitor others that are dragged over it. These attributes should include handlers for a wide variety of events in the drag-and-drop lifecycle and styling or rendering based on drag status, allowing for flexibility and power via a simple declarative approach.

Drax consists of two fundamental components, `DraxProvider` and `DraxView`. The `DraxProvider` wraps the entire app (or at least the area of the app in which drag-and-drop behavior will occur). It provides the React context for all drag handling which each `DraxView` interfaces with. The `DraxView` is a view which can be dragged, can receive other drags, can monitor other drags, or any combination of those behaviors. The Drax library includes more complex components such as `DraxList` (a drag-reorderable `FlatList`), but they are implemented with `DraxView` internally.

## Implementation

Drax works by tracking the measurements of all `DraxViews` in relation to the `DraxProvider`, keeping an internal record of all their absolute screen positions and sizes. In the case of `DraxViews` nested inside of scrollable Drax components (e.g., `DraxList`), it does this by tracking their relationships to their parents as well as the parents' scroll offsets. Drax uses `react-native-gesture-handler` to determine when drags begin and end, converting the event data from that library into absolute screen coordinates to determine interactions between `DraxViews`.

*(More documentation on this, including diagrams, to come later.)*

## Drag-and-Drop Lifecycle

`DraxView` has an assortment of drag-and-drop lifecycle event handler attributes for draggable views:

1. `onDragStart`
2. `onDrag`
3. `onDragEnter`
4. `onDragOver`
5. `onDragExit`
6. `onDragEnd`
7. `onDragDrop`

It also has a similar set for receptive views:

<ol type="A">
  <li><tt>onReceiveDragEnter</tt></li>
  <li><tt>onReceiveDragOver</tt></li>
  <li><tt>onReceiveDragExit</tt></li>
  <li><tt>onReceiveDragDrop</tt></li>
</ol>

The following image demonstrates a handful of examples:

![Drag-and-drop event examples](images/drag-drop-events.jpg)

**`Example I`** is described in detail as follows.

1: A `DraxView` configured as draggable is long-pressed to initiate a drag, yielding an `onDragStart (1)` event in itself.

2: The view is dragged to the right, yielding a series of `onDrag (2)` events.

3A: Then the drag crosses into another `DraxView` configured as receptive, which yields both an `onDragEnter (3)` in the dragged view and an `onReceiveDragEnter (A)` in the receiver.

4B: As the drag continues through the upper right corner of the receiving view, a series of `onDragOver (4)` events occur in the dragged view, simultaneously with a series of `onReceiverDragOver (B)` events in the receiver.

5C: The original view is then dragged out of the right side of the receiver, yielding an `onDragExit (5)` in the dragged view and an `onReceiveDragExit (C)` in the receiver.

6: Additional `onDrag (2)` events (not pictured) occur in the dragged view until it is finally released, yielding a single `onDragEnd (6)` in it.

**`Example II`** follows a similar progression to **`Example I`**, but the drag ends while still over the receiver, yielding an `onDragDrop (7)` in the dragged view and an `onReceiveDragDrop (D)` in the receiver.

**`Example III`** is a simple subset of **`Example I`** in which the drag never enters a receiver, so only the events in the dragged view occur.

**`Example IV`** is an exceptional case included for the sake of thoroughness. It is essentially the same as **`Example II`** but ends with the drag being cancelled by the gesture system for some reason. In this situation, no drop is considered to have happened. An `onDragEnd (6)` occurs in the dragged view, and an `onReceiveDragExit (C)` occurs in the receiver.
