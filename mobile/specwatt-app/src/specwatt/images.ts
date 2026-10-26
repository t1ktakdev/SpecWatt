export const imageMap = {
  lamp: require("../assets/specwatt/lamp-scene.png"),
  "led-strip": require("../assets/specwatt/led-strip.png"),
  fan: require("../assets/specwatt/fan.png"),
  charger: require("../assets/specwatt/charger.png"),
  socket: require("../assets/specwatt/socket.png"),
  appliance: require("../assets/specwatt/appliance.png"),
  "lamp-scene": require("../assets/specwatt/lamp-scene.png"),
} as const;
export type ImageId = keyof typeof imageMap;
export const imageKeys = Object.keys(imageMap).filter(
  (x) => x !== "lamp-scene",
) as ImageId[];
