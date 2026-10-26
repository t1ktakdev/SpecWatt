/**
 * Rooms & Spaces — route layout and integration point.
 *
 * This nested navigator is the module's whole footprint in the app shell:
 * it mounts `RoomsProvider` (which must sit below the root `SpecProvider`)
 * and hosts the three rooms routes. No existing navigation file is modified.
 */

import React from "react";
import { Stack } from "expo-router";
import { RoomsProvider } from "../../features/rooms/store";
import { theme } from "../../specwatt/theme";

export default function RoomsLayout() {
  return (
    <RoomsProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.bg },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="[id]" />
        <Stack.Screen name="edit" />
      </Stack>
    </RoomsProvider>
  );
}
