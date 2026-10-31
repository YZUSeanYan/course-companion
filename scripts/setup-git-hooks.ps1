$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoHint = Split-Path -Parent $scriptRoot
$root = (git -C $repoHint rev-parse --show-toplevel).Trim()
if (-not $root) {
    throw "Run this script from inside the repository."
}

git -C $root config core.hooksPath .githooks
Write-Output "Git hooks enabled. The pre-commit safety check will run before each commit."
