# ============================================================
# LAVI CRM V2 — Build du paquet Apps Script
# Génère le dossier apps_script/ avec les 4 fichiers à coller
# dans l'éditeur Google Apps Script (script.google.com).
# ============================================================

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out  = Join-Path $root 'apps_script'
New-Item -ItemType Directory -Force -Path $out | Out-Null

Write-Host ''
Write-Host '=== LAVI CRM V2 - Build Apps Script ===' -ForegroundColor Cyan
Write-Host "Projet : $root"

# ── 1. Code.gs (copie directe) ────────────────────────────────
Copy-Item (Join-Path $root 'Code.gs') (Join-Path $out 'Code.gs') -Force
Write-Host '[OK] Code.gs'

# ── 2. Styles.html (CSS encapsulé) ────────────────────────────
$css = Get-Content (Join-Path $root 'css\style.css') -Raw -Encoding UTF8
Set-Content -Path (Join-Path $out 'Styles.html') -Value ("<style>`n$css`n</style>") -Encoding UTF8
Write-Host '[OK] Styles.html'

# ── 3. JavaScript.html (tous les modules JS, ordre important) ─
$jsFiles = @('config.js','auth.js','ui.js','google.js','biens.js','clients.js','prospects.js','dashboard.js','app.js')
$bundle = "<script>`n"
foreach ($f in $jsFiles) {
  $path = Join-Path $root "js\$f"
  if (-not (Test-Path $path)) { Write-Host "[!!] Fichier manquant : js\$f" -ForegroundColor Yellow; continue }
  $bundle += "`n// ============ js/$f ============`n"
  $bundle += (Get-Content $path -Raw -Encoding UTF8)
  $bundle += "`n"
}
$bundle += "</script>"
Set-Content -Path (Join-Path $out 'JavaScript.html') -Value $bundle -Encoding UTF8
Write-Host "[OK] JavaScript.html ($($jsFiles.Count) modules)"

# ── 4. Index.html (template HtmlService) ─────────────────────
$index = @'
<!DOCTYPE html>
<html lang="fr">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <title>LAVI CRM V2 — AfriCapital Real Estate</title>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">

  <?!= include('Styles'); ?>
</head>
<body>

  <!-- App shell — rempli par app.js -->
  <div id="app"></div>

  <?!= include('JavaScript'); ?>

</body>
</html>
'@
Set-Content -Path (Join-Path $out 'Index.html') -Value $index -Encoding UTF8
Write-Host '[OK] Index.html'

Write-Host ''
Write-Host "Termine ! Dossier genere : $out" -ForegroundColor Green
Write-Host 'Collez les 4 fichiers dans l''editeur Apps Script (voir README).'
