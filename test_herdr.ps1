$ErrorActionPreference = 'Continue'
Write-Host "=== Testing herdr-core.exe --help ===" -ForegroundColor Cyan
& "C:\Users\BAMBOO\AppData\Local\Programs\herdr-core\herdr-core.exe" --help

Write-Host "`n=== Testing hc.exe --help ===" -ForegroundColor Cyan
& "C:\Users\BAMBOO\AppData\Local\Programs\herdr-core\hc.exe" --help

Write-Host "`n=== Testing herdr-app.exe --help ===" -ForegroundColor Cyan
& "C:\Users\BAMBOO\AppData\Local\Programs\herdr-app\herdr-app.exe" --help
