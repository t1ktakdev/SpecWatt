import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MotionProvider, useMotion } from "../specwatt/motion";
import { motion } from "../specwatt/motion-tokens";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { AccessibilityInfo, Animated, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { SpecProvider } from "../specwatt/store";
import { theme } from "../specwatt/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Layout() {
  const [loaded, fontError] = useFonts({
    Arimo: require("../assets/specwatt/Arimo.ttf"),
  });
  const [complete, setComplete] = useState(false);
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!loaded && !fontError) return;
    SplashScreen.hideAsync().catch(() => {});
    // An actual animated native brand transition, not an interactive onboarding card.
    let active = true;
    const animation = Animated.sequence([
      Animated.delay(120),
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.duration.reveal,
        useNativeDriver: true,
      }),
    ]);
    const listener=AccessibilityInfo.addEventListener("reduceMotionChanged", reduce=>{
      if(reduce&&active){animation.stop();setComplete(true);}
    });
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (!active) return;
        if (reduce || fontError) setComplete(true);
        else
          animation.start(() => {
            if (active) setComplete(true);
          });
      })
      .catch(() => {
        if (active) setComplete(true);
      });
    return () => {
      active = false;
      animation.stop();
      listener.remove();
    };
  }, [loaded, fontError, opacity]);
  if (!loaded && !fontError)
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  return (
    <GestureHandlerRootView style={{flex:1}}><MotionProvider><SpecProvider>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        <AppNavigation />
        {!complete && (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: theme.bg,
              justifyContent: "center",
              alignItems: "center",
              opacity,
            }}
          >
            <View
              style={{
                height: 138,
                width: 138,
                borderRadius: 70,
                borderWidth: 5,
                borderColor: theme.peach,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Arimo",
                  fontSize: 73,
                  color: theme.peach,
                }}
              >
                W
              </Text>
            </View>
            <Text
              style={{
                fontFamily: "Arimo",
                fontSize: 20,
                letterSpacing: 1.5,
                color: theme.text,
                marginTop: 24,
              }}
            >
              SpecWATT
            </Text>
          </Animated.View>
        )}
      </View>
    </SpecProvider></MotionProvider></GestureHandlerRootView>
  );
}

export function AppNavigation() {
  const reduced=useMotion();
  return (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.bg },
            animation: reduced ? "none" : "fade",
            animationDuration: motion.duration.standard,
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="home" />
          <Stack.Screen name="device" options={{animation:reduced?"none":"slide_from_right"}}/>
          <Stack.Screen name="catalog" options={{animation:reduced?"none":"slide_from_bottom"}}/>
        </Stack>
  );
}
