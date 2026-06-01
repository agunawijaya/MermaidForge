# build-sidecar.ps1
# Build the mermaidforge Python sidecar.
#
# Workflow:
#   1. Copy engines (canonical source of truth) into the sidecar working dir.
#   2. Prepend conda's Library\bin to PATH so PyInstaller's analyzer can
#      resolve native DLLs deterministically. Kept defensive even though
#      Pillow is excluded from the bundle.
#   3. Run PyInstaller with mfengine.spec (Pillow + numpy + MKL excluded).
#   4. Wait for PyInstaller's file handle to release before copying the
#      exe (otherwise the copy can race the writer and produce a
#      truncated binary).
#   5. Install into src-tauri/binaries/ under the Tauri sidecar triplet name.
#
# Idempotent; safe to re-run. Cleans PyInstaller scratch on every run.

$ErrorActionPreference = "Stop"

# SHA256 helper that does not depend on Microsoft.PowerShell.Utility
# being available — Get-FileHash auto-loading has been observed to fail
# in nested-invocation contexts after PyInstaller runs (npm → powershell
# → script → pyinstaller → back to script). Using the .NET API directly
# avoids module-load-state quirks entirely.
function Get-Sha256Hash([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $bytes = $sha.ComputeHash($stream)
            return ([System.BitConverter]::ToString($bytes)).Replace('-', '')
        } finally { $stream.Dispose() }
    } finally { $sha.Dispose() }
}

# --- Paths (relative to script location) ---
$root        = $PSScriptRoot
$enginesDir  = Join-Path $root "engines"
$pythonDir   = Join-Path $root "app\src-tauri\python"
$binariesDir = Join-Path $root "app\src-tauri\binaries"

# --- Sanity checks ---
foreach ($f in @(
    (Join-Path $enginesDir "mermaid_to_pptx.py"),
    (Join-Path $enginesDir "mermaid_to_vsdx_generator.py"),
    (Join-Path $enginesDir "template_manual_ref.vsdx"),
    (Join-Path $pythonDir  "cli.py"),
    (Join-Path $pythonDir  "mfengine.spec")
)) {
    if (-not (Test-Path $f)) {
        throw "Required file not found: $f"
    }
}

# --- 1. Copy engines into sidecar working dir ---
Write-Host "[1/5] Copying engines from engines/ into sidecar working dir..."
Copy-Item -Path (Join-Path $enginesDir "mermaid_to_pptx.py") `
          -Destination $pythonDir -Force
Copy-Item -Path (Join-Path $enginesDir "mermaid_to_vsdx_generator.py") `
          -Destination $pythonDir -Force
Copy-Item -Path (Join-Path $enginesDir "template_manual_ref.vsdx") `
          -Destination $pythonDir -Force

# --- 2. Conda DLL path (defense-in-depth; cheap if redundant) ---
$condaBin = "E:\miniconda3\Library\bin"
if (-not ($env:PATH -split ';' -contains $condaBin)) {
    $env:PATH = "$condaBin;" + $env:PATH
}

# --- 3. Clean prior scratch + run PyInstaller ---
Write-Host "[2/5] Cleaning PyInstaller scratch dirs..."
Remove-Item -Path (Join-Path $pythonDir "build"), `
                  (Join-Path $pythonDir "dist") `
            -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[3/5] Running PyInstaller (this takes ~25-90s)..."
Push-Location $pythonDir
try {
    & "E:\miniconda3\python.exe" -m PyInstaller mfengine.spec
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$exePath = Join-Path $pythonDir "dist\mfengine.exe"
if (-not (Test-Path $exePath)) {
    throw "PyInstaller succeeded but $exePath missing"
}

# --- 4. Surprise-S5 stability wait ---
Write-Host "[4/5] Waiting 60s for PyInstaller finalize stability..."
$first = (Get-Item $exePath).Length
Start-Sleep -Seconds 60
$second = (Get-Item $exePath).Length
if ($first -ne $second) {
    throw "mfengine.exe still being written. first=$first second=$second"
}
$sizeMB = [math]::Round($first / 1MB, 2)
$hash = Get-Sha256Hash $exePath
Write-Host "    mfengine.exe stable at $first bytes ($sizeMB MB)"
Write-Host "    SHA256: $hash"

# --- 5. Install into Tauri sidecar binaries dir ---
Write-Host "[5/5] Installing into $binariesDir..."
New-Item -ItemType Directory -Path $binariesDir -Force | Out-Null
$dst = Join-Path $binariesDir "mfengine-x86_64-pc-windows-msvc.exe"
Copy-Item -Path $exePath -Destination $dst -Force

$installedHash = Get-Sha256Hash $dst
if ($installedHash -ne $hash) {
    throw "Hash mismatch after install. src=$hash dst=$installedHash"
}

Write-Host ""
Write-Host "Sidecar built and installed."
Write-Host "   Path:    $dst"
Write-Host "   Size:    $sizeMB MB"
Write-Host "   SHA256:  $hash"
