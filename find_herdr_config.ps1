$ErrorActionPreference = 'SilentlyContinue'
Write-Host "=== Searching for herdr-core config files ==="
Get-ChildItem -Path "$env:USERPROFILE\.config", "$env:APPDATA", "$env:LOCALAPPDATA" -Filter "*herdr*" -Recurse | Select-Object FullName
