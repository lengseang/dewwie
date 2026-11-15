$ErrorActionPreference = 'Stop'

Write-Host "=== Step 1: Downloading official rustup-init.exe ===" -ForegroundColor Cyan
$installerPath = "$env:TEMP\rustup-init.exe"
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $installerPath -UseBasicParsing
Write-Host "Downloaded rustup-init.exe to $installerPath" -ForegroundColor Green

Write-Host "=== Step 2: Running rustup-init unattended ===" -ForegroundColor Cyan
# Run unattended with default stable toolchain and minimal profile for speed
Start-Process -FilePath $installerPath -ArgumentList "-y", "--default-toolchain", "stable", "--profile", "minimal" -Wait -NoNewWindow
Write-Host "Rustup installation completed." -ForegroundColor Green

Write-Host "=== Step 3: Verifying cargo and rustc ===" -ForegroundColor Cyan
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path "$cargoBin\cargo.exe") {
    $env:PATH = "$cargoBin;$env:PATH"
    & "$cargoBin\rustc.exe" --version
    & "$cargoBin\cargo.exe" --version
    Write-Host "Rust toolchain is ready at $cargoBin" -ForegroundColor Green
} else {
    Write-Host "Warning: Cargo binary not found at $cargoBin" -ForegroundColor Yellow
}
