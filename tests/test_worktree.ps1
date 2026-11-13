# SwarmHerd Git Worktree Lifecycle Verification Script (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "=== SwarmHerd Git Worktree Lifecycle (PowerShell) ===" -ForegroundColor Cyan

$tempRoot = Join-Path $env:TEMP ("swarmherd_ps_" + [System.Guid]::NewGuid().ToString().Substring(0,8))
$repoDir = Join-Path $tempRoot "parent_repo"
$worktreeDir = Join-Path $tempRoot "worktrees\agent-feature-pty"
$branchName = "agent/feature-pty"

try {
    # 1. Setup Base Repo
    New-Item -ItemType Directory -Path $repoDir -Force | Out-Null
    git -C $repoDir init -b main | Out-Null
    git -C $repoDir config user.name "SwarmHerd Verifier"
    git -C $repoDir config user.email "verifier@swarmherd.dev"

    Set-Content -Path (Join-Path $repoDir "README.md") -Value "# SwarmHerd Base"
    git -C $repoDir add README.md
    git -C $repoDir commit -m "chore: initial commit" | Out-Null
    Write-Host "[PASS] Setup Base Git Repository" -ForegroundColor Green

    # 2. Create Worktree
    New-Item -ItemType Directory -Path (Split-Path $worktreeDir) -Force | Out-Null
    git -C $repoDir worktree add -b $branchName $worktreeDir main | Out-Null
    if (Test-Path $worktreeDir) {
        Write-Host "[PASS] Worktree Creation (git worktree add -b)" -ForegroundColor Green
    } else {
        throw "Worktree directory not created"
    }

    # 3. Worktree Isolation
    Set-Content -Path (Join-Path $worktreeDir "feature.txt") -Value "new feature"
    if (-not (Test-Path (Join-Path $repoDir "feature.txt"))) {
        Write-Host "[PASS] Worktree Isolation Verified" -ForegroundColor Green
    } else {
        throw "Worktree isolation failed, file leaked to main repo"
    }

    # 4. Diff Calculation
    git -C $worktreeDir add feature.txt
    git -C $worktreeDir commit -m "feat: add feature.txt" | Out-Null
    $diffStat = git -C $worktreeDir diff --stat main...HEAD
    Write-Host "[PASS] Diff Calculation: $diffStat" -ForegroundColor Green

    # 5. Merge
    git -C $repoDir merge --no-ff -m "merge feature" $branchName | Out-Null
    if (Test-Path (Join-Path $repoDir "feature.txt")) {
        Write-Host "[PASS] Worktree Branch Merge Verified" -ForegroundColor Green
    } else {
        throw "Merge failed, feature.txt missing from main"
    }

    # 6. Teardown
    git -C $repoDir worktree remove --force $worktreeDir | Out-Null
    git -C $repoDir worktree prune | Out-Null
    git -C $repoDir branch -D $branchName | Out-Null
    Write-Host "[PASS] Worktree Teardown & Cleanup" -ForegroundColor Green

    Write-Host "`n✓ ALL POWERSHELL WORKTREE TESTS COMPLETED SUCCESSFULLY." -ForegroundColor Green
}
finally {
    if (Test-Path $tempRoot) {
        Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
