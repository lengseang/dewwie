# SwarmHerd End-to-End Scenario PowerShell Automation Wrapper
# Runs the full Python E2E validation test suite and formats results.

$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "      SwarmHerd Comprehensive E2E Scenario Validation (PowerShell)    " -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonScript = Join-Path $scriptDir "e2e_scenarios.py"

if (-not (Test-Path $pythonScript)) {
    Write-Error "e2e_scenarios.py not found at $pythonScript"
    exit 1
}

# Check for Python
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $pythonCmd) {
    Write-Error "Python executable not found in PATH."
    exit 1
}

Write-Host "Executing: python $pythonScript" -ForegroundColor DarkGray
& python $pythonScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n[SUCCESS] All SwarmHerd E2E Scenarios Passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[FAILURE] E2E Scenarios Failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}
