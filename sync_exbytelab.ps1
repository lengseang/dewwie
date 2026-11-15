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
Copy-Item "D:\1111-Works\Dewwie\cli\dewwie.py" $destCli -Force
Copy-Item "D:\1111-Works\Dewwie\cli\hc_bridge.py" $destCli -Force

Write-Host "Sync to exbytelab completed successfully." -ForegroundColor Green
