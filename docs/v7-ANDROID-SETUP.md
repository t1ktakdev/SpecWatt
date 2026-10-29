# Android setup and evidence — v7, 26 October 2026

## Confirmed environment

The user explicitly confirmed USB connection and debugging authorization. Official platform-tools37.0.1 were installed into `%LOCALAPPDATA%/Android/Sdk/platform-tools`. ADB sees exactly one authorized phone: Xiaomi, Android14/API34, arm64-v8a, physical1080×2400, density440. Device serials are omitted from the report. Neither SpecWATT nor Expo Go was initially installed.

The project remains Expo58.0.19, React Native0.88.0. Installed React Native source declares compileSdk37, targetSdk36, buildTools37.0.0, NDK27.1.12297006 and AGP9.2.1. Expo prebuild successfully generated the ignored `android/` project and Gradle9.4.1 wrapper. It updated npm `android`/`ios` scripts to `expo run:android`/`expo run:ios`; no manually authored native project is included.

JDK17.0.19 is installed under `%LOCALAPPDATA%/Programs/Microsoft/jdk-17.0.19.10-hotspot`; default global `java` points at JRE8, so use the process-only `scripts/android-env.ps1`. Official AGP9.2 documentation lists JDK17 and Gradle9.4.1 requirements. No global PATH or default Java was changed.

The first Gradle wrapper download failed with Java PKIX trust validation. This workstation's Windows CA store succeeds: process-only `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE`. Certificate validation remains enabled, no extra root certificate was imported and no insecure TLS flag was used.

## Installation in progress

Google's official Windows commandline-tools archive15859902 is155,655,386bytes, SHA-256 `90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a`. The checksum was retrieved from the Android Studio download page. Slow downloading is being handled without third-party mirrors. Initial free space: C20.2GB, D66.7GB. Native build targets only arm64-v8a for the connected phone.

No APK build, app launch, screenshot or frame-performance success is claimed until recorded below. ADB phone recognition is not application QA.

## Commands

```powershell
. ./scripts/android-env.ps1
./scripts/android-device-check.ps1
./scripts/android-build.ps1 -Install
```

`android-build.ps1` generates native files from Expo config, builds arm64 debug APK and optionally installs it without clearing application data. It does not claim that installation proves launch or QA.

Sources: [Android platform tools](https://developer.android.com/tools/releases/platform-tools), [official commandline download](https://developer.android.com/studio), [AGP9.2 compatibility](https://developer.android.com/build/releases/agp-9-2-0-release-notes), [sdkmanager](https://developer.android.com/tools/sdkmanager), [Expo58 reference](https://docs.expo.dev/versions/v58.0.0/).
