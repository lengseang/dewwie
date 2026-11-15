$ErrorActionPreference = 'Stop'
Write-Host "Syncing updated dist and configs to exbytelab..."

$destUi = "D:\1111-Works\exbytelab\desktop-ui"
$destElectron = "D:\1111-Works\exbytelab\desktop-ui\electron"
$destDist = "D:\1111-Works\exbytelab\desktop-ui\dist"
$destCli = "D:\1111-Works\exbytelab\cli"

foreach ($dir in @($destUi, $destElectron, $destDist, $destCli)) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

Copy-Item -Recurse -Force "D:\1111-Works\Dewwie\desktop-ui\dist\*" $destDist
Copy-Item "D:\1111-Works\Dewwie\desktop-ui\electron\main.cjs" $destElectron -Force
Copy-Item "D:\1111-Works\Dewwie\desktop-ui\electron\preload.cjs" $destElectron -Force
Copy-Item "D:\1111-Works\Dewwie\desktop-ui\package.json" $destUi -Force
Copy-Item "D:\1111-Works\Dewwie\dewwie.exe" "D:\1111-Works\exbytelab\dewwie.exe" -Force
Copy-Item "D:\1111-Works\Dewwie\start.bat" "D:\1111-Works\exbytelab\start.bat" -Force
Copy-Item "D:\1111-Works\Dewwie\cli\dewwie.py" $destCli -Force
Copy-Item "D:\1111-Works\Dewwie\cli\hc_bridge.py" $destCli -Force

# Ensure node_modules junction exists for instant zero-config desktop launch
$destNodeModules = "D:\1111-Works\exbytelab\desktop-ui\node_modules"
if (!(Test-Path $destNodeModules)) {
    cmd /c mklink /J "$destNodeModules" "D:\1111-Works\Dewwie\desktop-ui\node_modules"
}

Write-Host "Sync to exbytelab completed successfully." -ForegroundColor Green
