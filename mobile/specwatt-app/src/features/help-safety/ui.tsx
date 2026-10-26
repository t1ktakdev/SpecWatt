import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { Copy } from "../../specwatt/ui";
import { theme } from "../../specwatt/theme";
import { ModuleIcon } from "./icons";

/** Follows the OS reduce-motion setting, like the animated splash in _layout. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return reduce;
}

/**
 * Smooth height + fade disclosure. Content stays mounted so re-opening is
 * instant; the animated container clips it. Height uses the JS driver
 * (layout properties cannot use the native driver), which matches the
 * project's existing RN Animated usage in _layout.tsx.
 */
export function Expandable({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const reduce = useReduceMotion();
  // useState instead of useRef, mirroring _layout.tsx: the animated value
  // participates in render interpolation.
  const [progress] = useState(() => new Animated.Value(expanded ? 1 : 0));
  useEffect(() => {
    const target = expanded ? 1 : 0;
    if (reduce) {
      progress.setValue(target);
      return;
    }
    Animated.timing(progress, {
      toValue: target,
      duration: 240,
      useNativeDriver: false,
    }).start();
  }, [expanded, progress, reduce]);
  const limit = contentHeight || 3000;
  return (
    <Animated.View
      pointerEvents={expanded ? "auto" : "none"}
      aria-hidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      style={{
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, limit] }),
        opacity: progress,
        overflow: "hidden",
      }}
    >
      <View
        onLayout={(e) => {
          const next = Math.ceil(e.nativeEvent.layout.height);
          if (next > 0 && next !== contentHeight) setContentHeight(next);
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  return (
    <View style={ui.search}>
      <View style={ui.searchIcon}>
        <ModuleIcon name="search" size={19} color={theme.dim} />
      </View>
      <TextInput
        accessibilityLabel={placeholder}
        autoCorrect={false}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.dim}
        returnKeyType="search"
        style={ui.searchInput}
      />
      {value.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={10}
          onPress={() => onChange("")}
          style={({ pressed }) => [ui.searchClear, pressed && { opacity: 0.6 }]}
        >
          <ModuleIcon name="close" size={17} color={theme.muted} />
        </Pressable>
      )}
    </View>
  );
}

/** Card with a visible pressed state and a minimum 48px touch target. */
export function PressableCard({
  onPress,
  accessibilityLabel,
  accessibilityState,
  expanded,
  children,
  style,
}: {
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean; selected?: boolean };
  /** Rendered as aria-expanded; accessibilityState alone is not mapped by react-native-web. */
  expanded?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      {...(expanded !== undefined ? { "aria-expanded": expanded } : {})}
      onPress={onPress}
      style={({ pressed }) => [
        ui.pressCard,
        style,
        pressed && { borderColor: theme.peach },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function RuleBadge({ label }: { label: string }) {
  return (
    <View style={ui.badge}>
      <Copy size={11} accent style={{ fontSize: 10, letterSpacing: 1 }}>
        {label.toUpperCase()}
      </Copy>
    </View>
  );
}

const ui = StyleSheet.create({
  pressCard: {
    backgroundColor: "#22251F",
    borderWidth: 1,
    borderColor: "#3C4037",
    borderRadius: 19,
    padding: 15,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#22251F",
    borderWidth: 1,
    borderColor: "#3C4037",
    borderRadius: 25,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontFamily: theme.font,
    fontSize: 16,
    color: theme.text,
    minHeight: 52,
    paddingVertical: 12,
  },
  searchClear: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: theme.line,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: "#2C2A24",
  },
});
