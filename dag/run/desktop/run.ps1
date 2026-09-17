# Lanceur desktop Windows : plus besoin de taper yarn task a la main.
$ErrorActionPreference = "Stop"
$DagRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$StatusFile = Join-Path $DagRoot "logs\status"
Set-Location $DagRoot

function Ask-Yn([string]$Prompt, [bool]$DefaultYes) {
  $suffix = if ($DefaultYes) { "[O/n]" } else { "[o/N]" }
  $reply = Read-Host "$Prompt $suffix"
  if ($DefaultYes) {
    return -not ($reply -match '^(n|non|no)$')
  }
  return $reply -match '^(o|oui|y|yes)$'
}

$first = $args[0]
if ($first -eq "status" -or $first -eq "log" -or $first -eq "logs") {
  if (-not (Test-Path $StatusFile)) {
    Write-Host "Aucun logs/status pour le moment. En attente (Ctrl+C pour quitter)..."
    while (-not (Test-Path $StatusFile)) { Start-Sleep -Seconds 1 }
  }
  Write-Host "=== STATUT DE L'AGENT (Ctrl+C quitte le suivi) ==="
  Get-Content -Path $StatusFile -Wait -Tail 25
  exit 0
}

$promptText = ($args -join " ").Trim()

Write-Host "=========================================="
Write-Host "  LANCEMENT DE L'AGENT TDD (DESKTOP)      "
Write-Host "=========================================="
Write-Host "cwd: $DagRoot"
Write-Host ""
Write-Host "Parametres de ce run (flags yarn task) :"
Write-Host "  push    = git push + ouvrir/reutiliser la PR  (--push / --no-push)"
Write-Host "  merge   = merger la PR dans main a la fin     (--merge)"
Write-Host "  provider= cursor | claude | auto"
Write-Host "  dagfile = JSON deja planifie (sinon le planner part de ton prompt)"
Write-Host ""

$flags = @()
if (Ask-Yn "Autoriser git push + ouvrir/reutiliser la PR" $true) {
  $flags += "--push=true"
} else {
  $flags += "--no-push"
}
if (Ask-Yn "Merger dans main a la fin du DAG" $true) {
  $flags += "--merge"
}
$provider = (Read-Host "Provider [auto|cursor|claude] (defaut auto)").Trim().ToLowerInvariant()
if ($provider -eq "cursor" -or $provider -eq "claude") {
  $flags += "--provider=$provider"
} elseif ($provider -ne "" -and $provider -ne "auto") {
  throw "Provider inconnu: $provider (attendu auto, cursor ou claude)."
}
if (Ask-Yn "Mode unattended (pas de still continue o/n)" $false) {
  $flags += "--unattended"
}
$dagfile = (Read-Host "DAG existant --dagfile (vide = planner)").Trim()
if (-not $promptText -and -not $dagfile) {
  $promptText = (Read-Host "Entre ton prompt").Trim()
}
if (-not $promptText -and -not $dagfile) {
  Write-Host "Prompt vide. Annulation."
  exit 1
}

$yarnArgs = @("task") + $flags
if ($dagfile) {
  $yarnArgs += "--dagfile=$dagfile"
} else {
  $yarnArgs += $promptText
}

Write-Host ""
Write-Host ("cmd: yarn " + ($yarnArgs -join " "))
Write-Host "Lancement..."
& yarn @yarnArgs
exit $LASTEXITCODE
