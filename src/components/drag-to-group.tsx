import * as Haptics from 'expo-haptics';
import { createContext, useContext, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

/**
 * Drag a row onto a drop zone (a gift group, or "no group"): hold a row, move it over a zone
 * and let go. Zones are measured in window coordinates when a drag starts, so the screen can
 * scroll between drags. Tapping a row still works as before; only a long press starts a drag.
 */

type Frame = { y: number; height: number };
/** What a mounted View offers for measuring; kept small so it fits any host view ref. */
type Measurable = {
  measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};
type Zones<K extends string> = {
  register: (key: K, view: Measurable | null) => void;
  dragging: string | null;
  over: K | null;
  start: (id: string) => void;
  move: (absoluteY: number) => void;
  end: (absoluteY: number) => void;
};

const ZonesContext = createContext<Zones<string> | null>(null);

export function DragZones<K extends string>({
  onDrop,
  onDragChange,
  children,
}: {
  /** Called with the dragged row's id and the zone it was dropped on. */
  onDrop: (id: string, zone: K) => void;
  /** True while a row is being dragged, so the screen can stop scrolling. */
  onDragChange?: (dragging: boolean) => void;
  children: React.ReactNode;
}) {
  const views = useRef(new Map<K, Measurable>());
  const frames = useRef(new Map<K, Frame>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<K | null>(null);
  // Gesture callbacks can outlive a render, so the drag itself is kept in refs.
  const draggingRef = useRef<string | null>(null);
  const overRef = useRef<K | null>(null);

  function zoneAt(absoluteY: number): K | null {
    for (const [key, f] of frames.current) {
      if (absoluteY >= f.y && absoluteY <= f.y + f.height) return key;
    }
    return null;
  }

  const zones: Zones<K> = {
    register(key, view) {
      if (view) views.current.set(key, view);
      else views.current.delete(key);
    },
    dragging,
    over,
    start(id) {
      frames.current.clear();
      for (const [key, view] of views.current) {
        view.measureInWindow((_x, y, _w, height) => frames.current.set(key, { y, height }));
      }
      draggingRef.current = id;
      setDragging(id);
      onDragChange?.(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    move(absoluteY) {
      const next = zoneAt(absoluteY);
      if (next === overRef.current) return;
      overRef.current = next;
      if (next !== null) void Haptics.selectionAsync().catch(() => {});
      setOver(next);
    },
    end(absoluteY) {
      const id = draggingRef.current;
      if (id === null) return;
      const zone = zoneAt(absoluteY);
      draggingRef.current = null;
      overRef.current = null;
      setDragging(null);
      setOver(null);
      onDragChange?.(false);
      if (zone !== null) onDrop(id, zone);
    },
  };

  return (
    <ZonesContext.Provider value={zones as unknown as Zones<string>}>
      {children}
    </ZonesContext.Provider>
  );
}

function useZones() {
  const zones = useContext(ZonesContext);
  if (zones === null) throw new Error('Drag rows and zones must be inside DragZones');
  return zones;
}

/** A place rows can be dropped; `highlight` styles it while a dragged row is over it. */
export function DropZone({
  zone,
  holds,
  style,
  highlight,
  children,
}: {
  zone: string;
  /** Ids of the rows in this zone, so the one being dragged is drawn above other zones. */
  holds: readonly string[];
  style?: StyleProp<ViewStyle>;
  highlight?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const zones = useZones();
  const holdsDrag = zones.dragging !== null && holds.includes(zones.dragging);
  return (
    <View
      ref={(view) => zones.register(zone, view as unknown as Measurable | null)}
      collapsable={false}
      style={[style, holdsDrag && { zIndex: 2, elevation: 2 }, zones.over === zone && highlight]}>
      {children}
    </View>
  );
}

/** A row that follows the finger after a long press. */
export function DragRow({
  id,
  liftedStyle,
  children,
}: {
  id: string;
  liftedStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const zones = useZones();
  const [dy, setDy] = useState(0);
  const lifted = zones.dragging === id;
  const pan = usePanGesture({
    activateAfterLongPress: 300,
    runOnJS: true,
    onActivate: () => zones.start(id),
    onUpdate: (e) => {
      setDy(e.translationY);
      zones.move(e.absoluteY);
    },
    onDeactivate: (e) => {
      setDy(0);
      zones.end(e.absoluteY);
    },
    // A cancelled drag (another gesture took over) drops nowhere.
    onFinalize: () => {
      setDy(0);
      zones.end(Number.NaN);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View
        collapsable={false}
        style={[
          lifted && { transform: [{ translateY: dy }, { scale: 1.03 }], zIndex: 10 },
          lifted && liftedStyle,
        ]}>
        {children}
      </View>
    </GestureDetector>
  );
}
