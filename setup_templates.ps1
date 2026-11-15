$ErrorActionPreference = 'Stop'
$templatesDir = "$env:USERPROFILE\.config\herdr-core\templates"
if (!(Test-Path $templatesDir)) {
    New-Item -ItemType Directory -Path $templatesDir -Force | Out-Null
    Write-Host "Created templates directory at $templatesDir" -ForegroundColor Green
} else {
    Write-Host "Templates directory already exists at $templatesDir" -ForegroundColor Cyan
}
Get-ChildItem $templatesDir
