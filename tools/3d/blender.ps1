$ErrorActionPreference = 'Stop'
$toolchainPath = Join-Path $PSScriptRoot 'toolchain.local.json'
if (-not (Test-Path -LiteralPath $toolchainPath)) {
    throw 'Brak lokalnej konfiguracji. Uruchom setup-native.py zgodnie z README.md.'
}
$toolchain3d = Get-Content -LiteralPath $toolchainPath -Raw | ConvertFrom-Json
if ($args.Count -eq 0) {
    Start-Process -FilePath $toolchain3d.blender -WindowStyle Hidden
} else {
    & $toolchain3d.blender @args
    exit $LASTEXITCODE
}
