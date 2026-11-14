$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$localTools = Join-Path $repository 'test-results/toolchain'
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  $cargoExecutable = Join-Path $localTools 'cargo/bin/cargo.exe'
  if (-not (Test-Path -LiteralPath $cargoExecutable)) { throw 'Install Rust MSVC, or provide cargo on PATH.' }
  $env:CARGO_HOME = Join-Path $localTools 'cargo'
  $env:RUSTUP_HOME = Join-Path $localTools 'rustup'
  $env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
}
Push-Location $repository
try {
  node apps/desktop/scripts/stage.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Desktop asset staging failed. Build the Web app first.' }
  cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml --lib
  if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
  cargo build --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
  if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
} finally { Pop-Location }
