$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoHint = Split-Path -Parent $scriptRoot
$root = (git -C $repoHint rev-parse --show-toplevel).Trim()
if (-not $root) {
    Write-Error "Unable to locate the Git repository."
    exit 1
}

$staged = @(git -C $root diff --cached --name-only --diff-filter=ACMR)
if ($staged.Count -eq 0) {
    Write-Output "Repository check: no staged files."
    exit 0
}

$problems = New-Object System.Collections.Generic.List[string]
$allowedAudio = @(
    'app/src/androidTest/assets/english-classroom.wav',
    'app/src/androidTest/assets/chinese-classroom.wav'
)

foreach ($rawPath in $staged) {
    $path = $rawPath.Replace('\', '/')
    $full = Join-Path $root $rawPath

    $isEnvExample = $path -match '(^|/)\.env\.example$'
    if (-not $isEnvExample -and $path -match '(^|/)\.env($|\.)') {
        $problems.Add("blocked secret file: $path")
        continue
    }
    if ($path -match '(^|/)(node_modules|dist|\.venv|__pycache__|model-fixtures|model-runtime|document_assets|lecsync_uploads)/') {
        $problems.Add("blocked local/generated directory: $path")
        continue
    }
    if ($path -match '\.(jks|keystore|p12|pfx|pem|key|apk|aab|db|db-wal|db-shm|onnx|tar\.bz2|tar\.gz)$' -or $path -match 'zhixi-gateway-bundle') {
        $problems.Add("blocked secret or build artifact: $path")
        continue
    }
    if ($path -match '(^|/)bbpe\.model$') {
        $problems.Add("blocked model file: $path")
        continue
    }
    if ($path -match '\.wav$' -and $allowedAudio -notcontains $path) {
        $problems.Add("audio fixture is not on the approved synthetic list: $path")
        continue
    }

    if (Test-Path -LiteralPath $full -PathType Leaf) {
        $size = (Get-Item -LiteralPath $full).Length
        if ($size -gt 50MB) {
            $problems.Add(("file exceeds 50 MB: {0} ({1:N1} MB)" -f $path, ($size / 1MB)))
            continue
        }

        $extension = [IO.Path]::GetExtension($path).ToLowerInvariant()
        $textExtensions = @('.kt', '.kts', '.java', '.py', '.md', '.json', '.xml', '.yml', '.yaml', '.ts', '.tsx', '.js', '.css', '.html', '.properties', '.txt', '.example', '.gradle', '.sh', '.ps1', '.toml', '.ini')
        $shouldScan = $textExtensions -contains $extension -or $path -match '\.env\.example$' -or $size -lt 1MB
        if ($shouldScan) {
            $content = Get-Content -LiteralPath $full -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $secretPatterns = @(
                    'gh[pousr]_[A-Za-z0-9]{20,}',
                    'github_pat_[A-Za-z0-9_]{20,}',
                    'sk-[A-Za-z0-9_-]{20,}',
                    'AKIA[0-9A-Z]{16}',
                    '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
                )
                foreach ($pattern in $secretPatterns) {
                    if ($content -match $pattern) {
                        $problems.Add("possible credential pattern in: $path")
                        break
                    }
                }
                foreach ($line in ($content -split "\r?\n")) {
                    if ($line -match '(?i)^\s*(DEEPSEEK|KIMI|MIMO|LECSYNC|VISION_PROVIDER)_API_KEY\s*=\s*(.*)$') {
                        $value = $Matches[2].Trim().Trim('"').Trim("'")
                        if ($value.Length -ge 12 -and $value -notmatch '(?i)^(replace-|test-|<)') {
                            $problems.Add("possible credential assignment in: $path")
                            break
                        }
                    }
                }
            }
        }
    }
}

if ($problems.Count -gt 0) {
    Write-Output "Repository check failed:"
    foreach ($problem in $problems) {
        Write-Output " - $problem"
    }
    Write-Output ""
    Write-Output "Only stage files you intentionally changed. Do not use git add -A."
    exit 1
}

Write-Output "Repository check passed: $($staged.Count) staged file(s), no blocked secrets or artifacts."
