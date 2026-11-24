<#
 Mirrors cabinet-frontend and cabinet-backend to <Dest>\code\YYYY-MM-DD using "git clone --mirror" plus a "git bundle".
 Needs git installed. Read-only on GitHub. Private repos need your normal git sign-in (Git Credential Manager) or a -Token.
 Usage:  powershell -ExecutionPolicy Bypass -File backup-github-repos.ps1 -Dest "E:\CabinetDealzBackups"
#>
param(
  [Parameter(Mandatory = $true)][string]$Dest,
  [string]$Owner = "7809tom-sys",
  [string[]]$Repos = @("cabinet-frontend", "cabinet-backend"),
  [string]$Token = ""
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "git is not installed, so the code backup was skipped. Install Git for Windows from git-scm.com."
  exit 0
}
$day = Get-Date -Format "yyyy-MM-dd"
$out = Join-Path $Dest "code\$day"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$failed = $false

foreach ($repo in $Repos) {
  $mirror = Join-Path $out "$repo.git"
  $bundle = Join-Path $out "$repo.bundle"
  # The token (if any) is used only for this command and is not saved in the mirror's config.
  $url = "https://github.com/$Owner/$repo.git"
  if ($Token) { $url = "https://x-access-token:$Token@github.com/$Owner/$repo.git" }
  if (Test-Path $mirror) { Remove-Item -Recurse -Force $mirror }
  Write-Host "Mirroring $repo ..."
  git clone --mirror $url $mirror 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED to mirror $repo"; $failed = $true; continue }
  git -C $mirror remote set-url origin "https://github.com/$Owner/$repo.git"
  git -C $mirror bundle create $bundle --all 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED to bundle $repo"; $failed = $true; continue }
  Write-Host "OK $repo -> $mirror and $bundle"
}
if ($failed) { exit 1 }
exit 0
