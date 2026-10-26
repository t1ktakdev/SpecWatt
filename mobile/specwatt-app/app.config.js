// Cleartext is enabled only by an explicit local development build flag.
// The API client independently limits HTTP destinations to emulator/loopback.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []).filter(
      (plugin) =>
        (Array.isArray(plugin) ? plugin[0] : plugin) !==
        "expo-build-properties",
    ),
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: process.env.SPECWATT_LOCAL_API === "1",
        },
      },
    ],
  ],
});
