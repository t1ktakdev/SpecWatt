# Dot-source this file to configure only the current PowerShell process.
param(
    [string]$SdkRoot = (Join-Path $env:LOCALAPPDATA 'Android/Sdk'),
    [string]$JdkRoot = (Join-Path $env:LOCALAPPDATA 'Programs/Microsoft/jdk-17.0.19.10-hotspot')
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'platform-tools/adb.exe'))) { throw 'Android platform-tools not installed at the selected SDK root.' }
if (-not (Test-Path -LiteralPath (Join-Path $JdkRoot 'bin/javac.exe'))) { throw 'Select a complete supported JDK, not a JRE.' }
$env:ANDROID_HOME = [IO.Path]::GetFullPath($SdkRoot)
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:JAVA_HOME = [IO.Path]::GetFullPath($JdkRoot)
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:Path"
# This workstation's Java cacerts lacks its system CA. Use the existing Windows
# trust store instead of disabling certificate validation or importing new roots.
if (-not $env:JAVA_TOOL_OPTIONS) {
    $env:JAVA_TOOL_OPTIONS = '-Djavax.net.ssl.trustStoreType=Windows-ROOT -Djavax.net.ssl.trustStore=NONE'
}

