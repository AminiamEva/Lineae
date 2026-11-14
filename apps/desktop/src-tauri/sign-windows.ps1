param(
  [Parameter(Mandatory = $true)]
  [string] $File
)

$ErrorActionPreference = 'Stop'

# Pull-request and branch builds intentionally remain unsigned. On a tagged
# release the workflow decodes the certificate into this temporary path before
# Tauri starts, allowing Tauri to sign the app before it embeds it in NSIS.
if (-not $env:WINDOWS_CERTIFICATE_PATH) {
  exit 0
}
if (-not (Test-Path -LiteralPath $File)) {
  throw "Signing target does not exist: $File"
}
if (-not (Test-Path -LiteralPath $env:WINDOWS_CERTIFICATE_PATH)) {
  throw 'WINDOWS_CERTIFICATE_PATH does not point to a certificate file'
}

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $signtool) {
  throw 'signtool.exe was not found in the Windows SDK'
}

$timestamp = if ($env:WINDOWS_TIMESTAMP_URL) {
  $env:WINDOWS_TIMESTAMP_URL
} else {
  'http://timestamp.digicert.com'
}

& $signtool sign /fd SHA256 /f $env:WINDOWS_CERTIFICATE_PATH /p $env:WINDOWS_CERTIFICATE_PASSWORD /tr $timestamp /td SHA256 $File
if ($LASTEXITCODE -ne 0) {
  throw "Signing failed for $File"
}
& $signtool verify /pa /v $File
if ($LASTEXITCODE -ne 0) {
  throw "Signature verification failed for $File"
}
