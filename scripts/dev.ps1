param([ValidateSet('web','api')][string]$Target = 'web')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableNode = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools') -Directory -Filter 'node-*-win-x64' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portableNode) { $env:Path = "$($portableNode.FullName);$env:Path" }
}
if ($Target -eq 'web') {
    & npm.cmd run dev
} else {
    Set-Location -LiteralPath (Join-Path $projectRoot 'apps/api')
    $projectPython = Join-Path $pwd '.venv/Scripts/python.exe'
    if (Test-Path -LiteralPath $projectPython) {
        & $projectPython -m uvicorn verbalist.main:app --host 127.0.0.1 --port 8000 --no-access-log
    } else {
        & uv run uvicorn verbalist.main:app --host 127.0.0.1 --port 8000 --no-access-log
    }
}
