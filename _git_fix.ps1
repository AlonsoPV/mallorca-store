$ErrorActionPreference = "Continue"
Set-Location "c:\Users\alpev\OneDrive\Desktop\mallorca-store"
$out = "c:\Users\alpev\OneDrive\Desktop\mallorca-store\_git_fix_out.txt"
@(
  "=== status ==="
  (git status -sb)
  "=== fetch ==="
  (git fetch origin 2>&1 | Out-String)
  "=== ahead behind ==="
  (git rev-list --left-right --count HEAD...origin/main)
  "=== local log ==="
  (git log -5 --oneline)
  "=== origin log ==="
  (git log -3 --oneline origin/main)
  "=== rebase ==="
  (git pull --rebase origin main 2>&1 | Out-String)
  "=== push ==="
  (git push origin main 2>&1 | Out-String)
  "=== final ==="
  (git status -sb)
) | Set-Content -Path $out -Encoding UTF8
