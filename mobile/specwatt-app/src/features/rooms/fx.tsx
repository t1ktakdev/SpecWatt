/**
 * Rooms & Spaces — self-contained micro-animations.
 *
 * Deliberately built on the core React Native `Animated` API instead of the
 * shared animation system, so the module stays independent while other
 * developers rework that system. Every animation is subtle, entrance-only and
 * fully skipped when the OS reduce-motion accessibility setting is on.
 */

import React, { useEffect, useState } from "react";
import { Animated, AccessibilityInfo, ViewStyle, StyleProp } from "react-native";

function useReduceMotion(): boolean {
  const [reduce, setReduce] = React.useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (live) setReduce(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return reduce;
}

/**
 * Fades and lifts a block in on mount. `delay` staggers list items; with
 * reduce motion the content renders immediately in its final position.
 */
export function FadeUp({
  children,
  delay = 0,
  distance = 14,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReduceMotion();
  // Same pattern as the root layout: an Animated.Value held in state keeps
  // the compiler's refs rule happy; the value itself never triggers rerenders.
  const [progress] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 340,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);
  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
