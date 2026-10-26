# Android environment audit — 26 October 2026

This is an environment inspection, not evidence that the Android application builds or runs. Paths refer to the current Windows workstation. No SDK, emulator, or major software was installed during this audit.

## Confirmed tools

| Item | Evidence |
| --- | --- |
| Node | `node --version` reported `v24.18.0` in the parent audit. |
| Git | `git --version` reported `2.55.0.windows.2`. |
| Expo | Installed `mobile/specwatt-app/node_modules/expo/package.json` declares `58.0.19`, matching the app dependency `~58.0.19`. |
| JDK | `C:\Users\user\AppData\Local\Programs\Microsoft\jdk-17.0.19.10-hotspot\bin\javac.exe` reports `17.0.19`; its explicit `java.exe -version` reports Microsoft OpenJDK `17.0.19`. |
| Default Java | `java -version` resolves to Oracle Java `1.8.0_401` through `C:\Program Files (x86)\Common Files\Oracle\Java\javapath\java.exe`. This is not the installed JDK 17 runtime. |

## Missing or not discovered

`Get-Command adb,emulator,gradle,sdkmanager -ErrorAction SilentlyContinue` returned no commands. No `ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME`, or Gradle environment setting was returned by the bounded environment query.

The following expected SDK/install locations did not exist:

- `C:\Users\user\AppData\Local\Android\Sdk`
- `C:\Android`, `C:\Android\Sdk`, `C:\Android\android-sdk`
- `D:\Android`, `D:\Android\Sdk`, `D:\Android\android-sdk`
- `C:\Program Files\Android` and its `Android Studio` subfolder
- `C:\Program Files (x86)\Android\android-sdk`
- `D:\Apps\Android`, `D:\Apps\Android Studio`, `D:\Apps\platform-tools`
- `D:\LabTools\platform-tools`, `C:\platform-tools`, `D:\platform-tools`
- `C:\tools\android`, `D:\tools\android`
- `C:\Users\user\AppData\Local\Programs\Android`

Immediate installation directories under `D:\Apps`, `D:\LabTools`, `D:\Program Files`, and `C:\Users\user\AppData\Local\Programs` were checked for Android/SDK/Studio/platform-tool names. No matching SDK installation was found. This was intentionally not an exhaustive disk search.

`C:\Users\user\.android` exists but contains ADB identity files only; it does not establish an SDK, a connected device, or an emulator. Their contents were not read. `C:\Users\user\.gradle` was absent. No app window matching Android was returned by the computer-use app inventory.

## Consequences for verification

- No connected-device or emulator claim is possible: ADB was not discovered, so `adb devices` could not be run.
- Local native Android compilation and installation have not been demonstrated by this audit.
- `mobile/specwatt-app/dist-android` exists with `metadata.json` and Metro-exported assets. It is a bundle export, not proof of an APK or device execution.
- Using JDK 17 requires selecting its explicit runtime or configuring `JAVA_HOME` and PATH for a build process. This audit did not change global environment settings.
- Next native verification needs Android SDK/platform/build tools and an emulator or physical device, or an authenticated EAS build environment. Confirm version requirements against the actual generated Expo SDK 58 native project before installing/building.

Recheck these findings if tools are subsequently installed or a device is connected. This report describes the environment at the initial development-session audit.
