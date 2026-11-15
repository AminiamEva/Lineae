$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$tag = $env:LINEAE_RELEASE_TAG
$repository = $env:GITHUB_REPOSITORY
$target = $env:GITHUB_SHA
if ($tag -notmatch '^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$' -or $target -notmatch '^[a-f0-9]{40}$') {
  throw 'Missing or invalid validated release metadata'
}
$version = $tag.Substring(1)
$expected = @(("Lineae_" + $version + '_x64-setup.exe'), 'Lineae-portable.zip', 'SHA256SUMS.txt')
$files = @(Get-ChildItem -LiteralPath 'artifacts' -File)
if (Compare-Object ($expected | Sort-Object) ($files.Name | Sort-Object)) { throw 'Release artifacts do not match the required installer, portable ZIP and checksums' }
$notes = "docs/releases/$tag.md"
if (-not (Test-Path -LiteralPath $notes)) { throw "Release notes are missing: $notes" }

function Assert-ReleaseTagTarget {
  $refs = @(& git ls-remote --exit-code origin "refs/tags/$tag" "refs/tags/$tag^{}")
  $code = $LASTEXITCODE
  if ($code -eq 2) { return }
  if ($code -ne 0) { throw 'Cannot verify the remote release tag' }
  $peeled = $refs | Where-Object { $_ -match '\^\{\}$' } | Select-Object -First 1
  $line = if ($peeled) { $peeled } else { $refs[0] }
  if (($line -split '\s+')[0] -ne $target) { throw 'The release tag points to a different commit' }
}
Assert-ReleaseTagTarget
$probePath = Join-Path $env:RUNNER_TEMP 'lineae-release-probe.err'
$existingText = & gh release view $tag --repo $repository --json isDraft,targetCommitish 2> $probePath
$probeExit = $LASTEXITCODE
if ($probeExit -eq 0) {
  $existing = $existingText | ConvertFrom-Json
  if (-not $existing.isDraft) { throw 'This release is already public; refusing to overwrite it' }
  if ($existing.targetCommitish -ne $target) { throw 'The existing draft targets a different commit' }
} else {
  $errorText = Get-Content -LiteralPath $probePath -Raw
  if ($errorText -notmatch 'release not found|HTTP 404') { throw "Cannot check the existing release: $errorText" }
  & gh release create $tag --repo $repository --target $target --title "Lineae $tag" --notes-file $notes --draft
  if ($LASTEXITCODE -ne 0) { throw 'Creating the release draft failed' }
}
& gh release edit $tag --repo $repository --notes-file $notes
if ($LASTEXITCODE -ne 0) { throw 'Updating draft release notes failed' }
foreach ($file in $files) {
  & gh release upload $tag $file.FullName --repo $repository --clobber
  if ($LASTEXITCODE -ne 0) { throw "Uploading $($file.Name) failed" }
}
$uploadedText = & gh release view $tag --repo $repository --json assets,isDraft,targetCommitish
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify uploaded release assets' }
$uploaded = $uploadedText | ConvertFrom-Json
if (-not $uploaded.isDraft -or $uploaded.targetCommitish -ne $target) { throw 'Draft ownership changed during upload' }
foreach ($file in $files) {
  $asset = $uploaded.assets | Where-Object { $_.name -eq $file.Name }
  if (-not $asset -or $asset.size -ne $file.Length -or $asset.state -ne 'uploaded') { throw "Release asset verification failed: $($file.Name)" }
}
Assert-ReleaseTagTarget
if ($tag.Contains('-')) {
  & gh release edit $tag --repo $repository --draft=false --prerelease --latest=false
} else {
  & gh release edit $tag --repo $repository --draft=false --prerelease=false --latest
}
if ($LASTEXITCODE -ne 0) { throw 'Publishing the verified release failed' }
