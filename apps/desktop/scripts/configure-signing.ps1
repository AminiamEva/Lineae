[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string] $Certificate,

  [string] $Repository = 'AminiamEva/Lineae',

  [string] $TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) is required'
}
& gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Authenticate GitHub CLI with `gh auth login` before configuring signing'
}

$securePassword = Read-Host 'PFX password' -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
$password = $null
$base64 = $null
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $path = (Resolve-Path -LiteralPath $Certificate).Path
  $flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
  $signingCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($path, $password, $flags)
  if (-not $signingCertificate.HasPrivateKey) {
    throw 'The PFX does not contain a private key'
  }
  $eku = $signingCertificate.Extensions |
    Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
    Select-Object -First 1
  if ($eku -and -not ($eku.EnhancedKeyUsages.Value -contains '1.3.6.1.5.5.7.3.3')) {
    throw 'The certificate is not valid for code signing (EKU 1.3.6.1.5.5.7.3.3)'
  }
  if ($signingCertificate.NotAfter -le (Get-Date)) {
    throw "The certificate expired on $($signingCertificate.NotAfter.ToString('u'))"
  }
  if ($signingCertificate.NotAfter -lt (Get-Date).AddDays(30)) {
    Write-Warning "The certificate expires on $($signingCertificate.NotAfter.ToString('u'))"
  }

  $base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($path))
  $secrets = [ordered]@{
    WINDOWS_CERTIFICATE = $base64
    WINDOWS_CERTIFICATE_PASSWORD = $password
    WINDOWS_TIMESTAMP_URL = $TimestampUrl
  }
  foreach ($entry in $secrets.GetEnumerator()) {
    & gh secret set $entry.Key --repo $Repository --body $entry.Value
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to set GitHub secret $($entry.Key)"
    }
  }
  Write-Host "Configured Windows signing secrets for $Repository."
  Write-Host "Certificate subject: $($signingCertificate.Subject)"
  Write-Host "Certificate expiry:  $($signingCertificate.NotAfter.ToString('u'))"
} finally {
  $password = $null
  $base64 = $null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
