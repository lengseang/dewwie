$ErrorActionPreference = 'Continue'
$roamingDir = "$env:APPDATA\herdr-core\templates"
New-Item -ItemType Directory -Path $roamingDir -Force | Out-Null
Copy-Item "C:\Users\BAMBOO\.config\herdr-core\templates\*.md" $roamingDir -Force
Write-Host "Copied to $roamingDir"

& "C:\Users\BAMBOO\AppData\Local\Programs\herdr-core\hc.exe" templates
