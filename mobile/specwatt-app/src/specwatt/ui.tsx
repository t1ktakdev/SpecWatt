import React from "react";
import {
  Pressable,
  Text,
  View,
  ViewStyle,
  Image,
  ImageSourcePropType,
  TextProps,
} from "react-native";
import { sty, theme } from "./theme";
export function Copy({
  children,
  size = 15,
  muted = false,
  accent = false,
  style,
  ...props
}: TextProps & {
  children: React.ReactNode;
  size?: number;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <Text
      {...props}
      style={[
        {
          fontFamily: theme.font,
          fontSize: Math.max(12, size),
          color: accent ? theme.peach : muted ? theme.muted : theme.text,
          lineHeight: Math.max(12, size) * 1.34,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function CTA({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        sty.button,
        secondary && {
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.line,
        },
        pressed && { opacity: 0.75 },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Copy
        size={16}
        style={{ color: secondary ? theme.text : theme.ink, fontWeight: "700" }}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[sty.card, style]}>{children}</View>;
}
export function Photo({
  source,
  style,
}: {
  source: ImageSourcePropType;
  style: any;
}) {
  return <Image source={source} style={style} resizeMode="cover" />;
}
