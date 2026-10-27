param(
    [switch]$Install,
    [string]$NativeBuildRoot
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'mobile/specwatt-app'
# Dependency junctions can resolve to long absolute source paths. Keep native
# staging short and ask CMake to hash object paths before Windows Ninja's limit.
# This is per invocation: neither installed packages nor their caches are edited.
if (-not $NativeBuildRoot) {
    $hasher = [Security.Cryptography.SHA256]::Create()
    try {
        $identity = [BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($appRoot))).Replace('-', '').Substring(0, 12)
    } finally { $hasher.Dispose() }
    $NativeBuildRoot = Join-Path $env:TEMP "sw-cxx/$identity"
}
$NativeBuildRoot = [IO.Path]::GetFullPath($NativeBuildRoot)
if ($NativeBuildRoot.Length -gt 110) { throw 'Choose a shorter NativeBuildRoot (110 characters maximum).' }
New-Item -ItemType Directory -Force -Path $NativeBuildRoot | Out-Null
$nativeInitScript = Join-Path $NativeBuildRoot 'specwatt-native-paths.gradle'
$nativeInitContent = @'
gradle.beforeProject { project ->
    project.afterEvaluate {
        def android = project.extensions.findByName('android')
        if (android != null && android.hasProperty('externalNativeBuild')) {
            android.externalNativeBuild.cmake.buildStagingDirectory = new File(System.getenv('SPECWATT_CXX_ROOT'), project.path.replace(':', '_'))
            android.defaultConfig.externalNativeBuild.cmake.arguments.removeAll { it.startsWith('-DCMAKE_OBJECT_PATH_MAX=') }
            android.defaultConfig.externalNativeBuild.cmake.arguments.add('-DCMAKE_OBJECT_PATH_MAX=240')
        }
    }
}
'@
[IO.File]::WriteAllText($nativeInitScript, $nativeInitContent, (New-Object System.Text.UTF8Encoding($false)))
$previousCxxRoot = $env:SPECWATT_CXX_ROOT
$nativeDrive = $null
# CMake's generated target-directory names can themselves consume over 100
# characters. A temporary drive alias leaves room for its hashed object names.
foreach ($letter in @('S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z')) {
    if (-not (Get-PSDrive -Name $letter -ErrorAction SilentlyContinue) -and -not [IO.Directory]::Exists("${letter}:\")) {
        $nativeDrive = "${letter}:"
        break
    }
}
if (-not $nativeDrive) { throw 'No free temporary drive letter is available for the native build cache.' }
& subst.exe $nativeDrive $NativeBuildRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not create the temporary native build cache drive alias.' }
$env:SPECWATT_CXX_ROOT = "$nativeDrive/"
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
        cmd /c ".\gradlew.bat app:assembleDebug -PreactNativeArchitectures=arm64-v8a --init-script `"$nativeInitScript`" --max-workers=2 --no-daemon --console=plain 2>&1"
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
} finally {
    Pop-Location
    $env:SPECWATT_CXX_ROOT = $previousCxxRoot
    & subst.exe $nativeDrive /d
}
