$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectRoot 'mobile/specwatt-app')
try {
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Mobile tests failed' }
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript failed' }
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
} finally { Pop-Location }
Push-Location $projectRoot
try {
    cmd /c 'python -m unittest discover -s security -v 2>&1'
    if ($LASTEXITCODE -ne 0) { throw 'Integrated security tests failed' }
    python security/scan_secrets.py
    if ($LASTEXITCODE -ne 0) { throw 'Worktree secret scan failed' }
    python security/scan_secrets.py --history
    if ($LASTEXITCODE -ne 0) { throw 'History secret scan failed' }
} finally { Pop-Location }
Push-Location (Join-Path $projectRoot 'backend')
try {
    cmd /c 'python -m unittest discover -s tests -v 2>&1'
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
    cmd /c 'python scripts/smoke.py 2>&1'
    if ($LASTEXITCODE -ne 0) { throw 'Backend HTTP smoke failed' }
} finally { Pop-Location }
