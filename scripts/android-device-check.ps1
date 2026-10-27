$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'android-env.ps1')
$rows = @(adb devices | Select-Object -Skip 1 | Where-Object { $_.Trim() })
$authorized = @($rows | Where-Object { ($_ -split '\s+')[1] -eq 'device' })
Write-Output "Authorized Android devices: $($authorized.Count)"
if ($authorized.Count -ne 1) { throw 'Connect exactly one phone and approve the USB debugging prompt. Device identifiers are intentionally not printed.' }
Write-Output ('Manufacturer: ' + (adb shell getprop ro.product.manufacturer))
Write-Output ('Model: ' + (adb shell getprop ro.product.model))
Write-Output ('Android: ' + (adb shell getprop ro.build.version.release))
Write-Output ('API: ' + (adb shell getprop ro.build.version.sdk))
adb shell wm size
adb shell wm density
Write-Output ('ABI: ' + (adb shell getprop ro.product.cpu.abi))

