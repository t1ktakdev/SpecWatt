# Android build and acceptance

## Current evidence

SDK58 dependencies and config pass Expo checks. A Hermes Android export succeeds. This is a JS bundle, **not an APK or evidence of Android execution**. No Android SDK/ADB/emulator was found. JDK17 is available but PATH selects Java8; see environment audit.

## Local debug/development APK

Install Android Studio and the SDK versions required by the SDK58-generated native project from official sources. No SDK installation was performed in this iteration. In a new PowerShell terminal, configure the actual paths:

```powershell
$env:JAVA_HOME = 'C:\Users\user\AppData\Local\Programs\Microsoft\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
cd mobile/specwatt-app
npm ci
npm test
npm run typecheck
npm run lint
$env:SPECWATT_LOCAL_API = '1'
npx expo run:android
```

Expo generates the native folder from app config (do not manually write native projects). This command compiles and, when available, installs to Android. Inspect actual generated Gradle/JDK requirements instead of assuming JDK17 will satisfy a future SDK update. `android/app/build/outputs/apk/debug/app-debug.apk` is the expected debug output after a successful build; verify it exists. Install with `adb install -r <actual-apk-path>`. Start Metro with `npx expo start --dev-client`.

For local server access the explicit development flag enables Android cleartext; the client still allows HTTP only exact loopback/emulator addresses in development. The default/preview/production config disables cleartext, and production JS requires HTTPS. Do not enable the development flag for a production build.

## EAS alternative

`eas.json` includes development APK, preview APK and production AAB profiles; `expo-dev-client` is installed. No EAS project/account has been linked and no cloud build was submitted. Cloud builds can consume account quota and require owner credentials/signing decisions.

When the owner selects this route: run `npx eas-cli@latest whoami`, authenticate interactively if needed, `npx eas-cli@latest init`, then `npx eas-cli@latest build --platform android --profile development`. Preserve the returned projectId in config. Install the returned APK and actually execute the acceptance list. Do not run Play submission without separate authorization.

Release process: test, review dependency advisories and privacy/asset requirements, build `production`, verify signing/versionCode, install/test an internal artifact, then separately approve distribution. Use EAS credentials or protected owner-managed keystore; never commit/export private keys to the repository. Signing, EAS and release workflow are instructions/configuration, not completed builds.

## Required native acceptance

Cold start/resume; RU/KY onboarding and controller route; safe areas/system bars/Back; small phone and large font; TalkBack touch targets; all six screens; CH1/CH2 simulation and aggregate sums; protected CH3; device rename/room/image/consent; plan permission/manual hold/stale/no-window/reject/apply; restart retains data and original applied-plan comparison; journal reflects actions; export/clear demo confirmation; actual API login/SecureStore/logout/401; requested command does not change telemetry; timeout/reconcile; offline errors; reduced motion. Capture device screenshots and compare to reference in matching dimensions. Current browser checks do not satisfy this gate.

Official references: [SDK58 UI](https://docs.expo.dev/versions/v58.0.0/sdk/ui/), [Router](https://docs.expo.dev/versions/v58.0.0/sdk/router/), [build properties](https://docs.expo.dev/versions/v58.0.0/sdk/build-properties/), [development builds](https://docs.expo.dev/develop/development-builds/introduction/).
