##############################################################
#  OBSIDYN Full Build Script  (v3 - Standard PyInstaller Build)
#  Run from the project root: .\build.ps1
#  Stages:
#    1. Build engine exe (PyInstaller)
#    2. Prune dev node_modules from UI
#    3. Package Electron app (electron-packager)
#    4. Stage engine exe + default config into app resources
#    5. Compile Inno Setup installer
##############################################################

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function Log($msg) { Write-Host "[BUILD] $msg" -ForegroundColor Cyan }
function Ok($msg)  { Write-Host "[OK]    $msg" -ForegroundColor Green }
function Err($msg) { Write-Host "[FAIL]  $msg" -ForegroundColor Red; exit 1 }

$py = Join-Path $ROOT "venv\Scripts\python.exe"
if (-not (Test-Path $py)) { Err "venv not found. Run: python -m venv venv && venv\Scripts\pip install -r requirements.txt" }

# ── 1. Build engine exe ─────────────────────────────────────
Log "Building engine exe with PyInstaller..."
& $py -m PyInstaller engine.spec --noconfirm --clean
if ($LASTEXITCODE -ne 0) { Err "PyInstaller build failed." }

$engineExe = Join-Path $ROOT "dist\obsidyn-engine.exe"
if (-not (Test-Path $engineExe)) { Err "dist\obsidyn-engine.exe not produced." }
Ok "Engine → $engineExe ($([math]::Round((Get-Item $engineExe).Length/1MB,1)) MB)"

# ── 2. Prune dev node_modules ───────────────────────────────
Log "Pruning devDependencies from UI node_modules..."
Set-Location (Join-Path $ROOT "ui")
# npm prune --omit=dev
if ($LASTEXITCODE -ne 0) { Write-Host "[WARN] npm prune failed, continuing..." -ForegroundColor Yellow }
Set-Location $ROOT
Ok "Dev dependencies pruned."

# ── 3. Package Electron app ─────────────────────────────────
Log "Packaging Electron app with electron-packager..."
Set-Location (Join-Path $ROOT "ui")
npx electron-packager . OBSIDYN --platform=win32 --arch=x64 --out="..\dist-app" --overwrite --no-prune --ignore="node_modules/.cache"
if ($LASTEXITCODE -ne 0) { Err "electron-packager failed." }
Set-Location $ROOT

$winApp = Join-Path $ROOT "dist-app\OBSIDYN-win32-x64\OBSIDYN.exe"
if (-not (Test-Path $winApp)) { Err "OBSIDYN.exe not found after packaging." }
Ok "Electron app packaged → dist-app\OBSIDYN-win32-x64\"

# ── 4. Stage resources ──────────────────────────────────────
Log "Staging engine exe and default config into app resources..."
$resDir = Join-Path $ROOT "dist-app\OBSIDYN-win32-x64\resources"
Copy-Item -Path $engineExe -Destination "$resDir\obsidyn-engine.exe" -Force

$configSrc  = Join-Path $ROOT "config"
$configDest = Join-Path $resDir "config"
New-Item -ItemType Directory -Force $configDest | Out-Null
Copy-Item "$configSrc\app_config.json"      "$configDest\app_config.json"      -Force
Copy-Item "$configSrc\security_policy.json" "$configDest\security_policy.json" -Force
Ok "Resources staged."

# ── 5. Inno Setup installer ─────────────────────────────────
Log "Compiling Inno Setup installer..."
$iscc = $null
foreach ($c in @("C:\Program Files (x86)\Inno Setup 6\ISCC.exe","C:\Program Files\Inno Setup 6\ISCC.exe")) {
    if (Test-Path $c) { $iscc = $c; break }
}
if ($null -eq $iscc) {
    Write-Host "[WARN] Inno Setup not found. Install from https://jrsoftware.org/isinfo.php, then run: ISCC obsidyn_setup.iss" -ForegroundColor Yellow
} else {
    New-Item -ItemType Directory -Force (Join-Path $ROOT "releases") | Out-Null
    & $iscc (Join-Path $ROOT "obsidyn_setup.iss")
    if ($LASTEXITCODE -ne 0) { Err "Inno Setup compilation failed." }
    $installer = Get-ChildItem (Join-Path $ROOT "releases") -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Ok "Installer → $($installer.FullName) ($([math]::Round($installer.Length/1MB,0)) MB)"
}

Write-Host ""