param([switch]$Install)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'mobile/specwatt-app'
Push-Location $appRoot
try {
    $env:SPECWATT_LOCAL_API = '1'
    npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'Expo native generation failed.' }
    Push-Location (Join-Path $appRoot 'android')
    try {
        # Merge Gradle stderr into stdout via cmd so benign JVM notices
        # ("Picked up JAVA_TOOL_OPTIONS", tool warnings) cannot trigger
        # PowerShell NativeCommandError under ErrorActionPreference=Stop.
        # Heap comes from android/gradle.properties (org.gradle.jvmargs);
        # passing -Dorg.gradle.jvmargs here would split on the space in cmd.
        cmd /c ".\gradlew.bat app:assembleDebug -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon --console=plain 2>&1"
        if ($LASTEXITCODE -ne 0) { throw 'Android Gradle build failed.' }
    } finally { Pop-Location }
    $apkPath = Join-Path $appRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
    if (-not (Test-Path -LiteralPath $apkPath)) { throw 'Expected debug APK missing.' }
    Get-Item -LiteralPath $apkPath | Select-Object FullName, Length, LastWriteTime
    if ($Install) {
        & (Join-Path $PSScriptRoot 'android-device-check.ps1')
        adb install -r $apkPath
        if ($LASTEXITCODE -ne 0) { throw 'APK installation failed.' }
        Write-Output 'Installed only. Start Metro with npx expo start --dev-client and verify the running app on the phone.'
    }
} finally { Pop-Location }
