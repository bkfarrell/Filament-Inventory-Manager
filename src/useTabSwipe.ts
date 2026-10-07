import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, type LayoutChangeEvent } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';

// Swipe left/right on the content to move to the next/previous tab.
// Returns props for an Animated.View wrapping the tab's content: it follows your finger,
// slides out when you let go far enough, and the new tab slides in from the other side.
export function useTabSwipe<T extends string>(
  tabs: readonly T[],
  current: T,
  onChange: (tab: T) => void
) {
  const [offset] = useState(() => new Animated.Value(0));
  const width = useRef(400);
  const latest = useRef({ tabs, current, onChange });
  useEffect(() => {
    latest.current = { tabs, current, onChange };
  });

  // The tab you'd land on by swiping in this direction (dx < 0 → next tab), if there is one.
  const neighbor = (dx: number): T | undefined => {
    const { tabs, current } = latest.current;
    return tabs[tabs.indexOf(current) + (dx < 0 ? 1 : -1)];
  };

  const settle = () => Animated.spring(offset, { toValue: 0, useNativeDriver }).start();

  // The handlers only read the refs while a finger is moving, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      // Only take over clearly sideways drags, so scrolling up and down still works normally.
      // "Capture" lets this win over the list underneath once the drag is plainly horizontal.
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        // At the first or last tab, resist a little instead of moving freely.
        offset.setValue(neighbor(g.dx) ? g.dx : g.dx / 4);
      },
      onPanResponderRelease: (_, g) => {
        const next = neighbor(g.dx);
        const farEnough = Math.abs(g.dx) > width.current / 4 || Math.abs(g.vx) > 0.5;
        if (!next || !farEnough || Math.sign(g.vx || g.dx) !== Math.sign(g.dx)) {
          settle();
          return;
        }
        const dir = g.dx < 0 ? -1 : 1;
        Animated.timing(offset, {
          toValue: dir * width.current,
          duration: 140,
          useNativeDriver,
        }).start(() => {
          latest.current.onChange(next);
          // Bring the new tab in from the opposite edge.
          offset.setValue(-dir * width.current);
          settle();
        });
      },
      onPanResponderTerminate: settle,
    })
  );

  return {
    ...responder.panHandlers,
    onLayout: (e: LayoutChangeEvent) => {
      width.current = e.nativeEvent.layout.width;
    },
    style: [
      { flex: 1, transform: [{ translateX: offset }] },
      // In a phone browser, keep the browser from treating the sideways swipe as its own
      // gesture (like scrolling the page sideways); up/down scrolling is unaffected.
      Platform.OS === 'web' ? ({ touchAction: 'pan-y' } as object) : null,
    ],
  };
}
