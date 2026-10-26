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
Push-Location (Join-Path $projectRoot 'backend')
try {
    python -m unittest discover -s tests -v
    if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed' }
    python scripts/smoke.py
    if ($LASTEXITCODE -ne 0) { throw 'Backend HTTP smoke failed' }
} finally { Pop-Location }
