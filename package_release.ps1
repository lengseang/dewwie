# Dewwie Release Packager
$ErrorActionPreference = 'Stop'
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Dewwie - Packaging Portable Release for Hosting        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$baseDir = "D:\1111-Works\Dewwie"
$releaseDir = Join-Path $baseDir "release\Dewwie-v0.1.18-win64"
$zipPath = Join-Path $baseDir "release\Dewwie-v0.1.18-win64.zip"

if (Test-Path $releaseDir) {
    Remove-Item -Recurse -Force $releaseDir
}
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

Write-Host "`n1. Building Production Web Bundle..." -ForegroundColor Yellow
cd (Join-Path $baseDir "desktop-ui")
npm run build

Write-Host "`n2. Compiling Native Launcher Binary..." -ForegroundColor Yellow
cd (Join-Path $baseDir "cmd\launcher")
go build -o (Join-Path $baseDir "dewwie.exe") main.go

Write-Host "`n3. Staging Release Files..." -ForegroundColor Yellow
Copy-Item (Join-Path $baseDir "dewwie.exe") $releaseDir -Force
Copy-Item (Join-Path $baseDir "start.bat") $releaseDir -Force
Copy-Item (Join-Path $baseDir "README.md") $releaseDir -Force

$releaseCli = Join-Path $releaseDir "cli"
New-Item -ItemType Directory -Path $releaseCli -Force | Out-Null
Copy-Item (Join-Path $baseDir "cli\*") $releaseCli -Force

$releaseUi = Join-Path $releaseDir "desktop-ui"
New-Item -ItemType Directory -Path $releaseUi -Force | Out-Null
Copy-Item (Join-Path $baseDir "desktop-ui\package.json") $releaseUi -Force

$releaseDist = Join-Path $releaseUi "dist"
Copy-Item -Recurse -Force (Join-Path $baseDir "desktop-ui\dist") $releaseDist

$releaseElectron = Join-Path $releaseUi "electron"
Copy-Item -Recurse -Force (Join-Path $baseDir "desktop-ui\electron") $releaseElectron

# Add quick start note for other users
$userGuide = @"
# Dewwie - Autonomous AI Agent IDE & Terminal (Portable Edition)

## Quick Start
1. Double-click **start.bat** (or run `.\dewwie.exe` in your terminal).
2. If Node.js and Electron are installed on your machine, Dewwie launches immediately.
3. For zero-config standalone launch, ensure `node` is available in your PATH or run:
   ```cmd
   npm install -g electron
   dewwie.exe
   ```

## Included Features
- Native WinPTY terminal emulator with 128KB lightweight ring buffer.
- Real-time OSC 7501 protocol status badges for background AI agents.
- Automatic session saving with zero terminal command disruption.
- Pixel-perfect Windows 11 Fluent titlebar controls.
- Git worktree isolation with dynamic port allocation (5173+).
"@
Set-Content -Path (Join-Path $releaseDir "QUICKSTART.md") -Value $userGuide -Encoding utf8

Write-Host "`n4. Creating Release Zip Archive..." -ForegroundColor Yellow
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}
Compress-Archive -Path "$releaseDir\*" -DestinationPath $zipPath -Force

$zipItem = Get-Item $zipPath
$sizeMb = [math]::Round($zipItem.Length / 1MB, 2)
Write-Host "`n✓ Release Package Ready: $zipPath ($sizeMb MB)" -ForegroundColor Green
Write-Host "Ready to host and distribute to users!" -ForegroundColor Green
