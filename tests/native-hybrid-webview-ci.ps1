# The hosted Windows runner is an administrator. Exercise the WebView as a
# standard desktop user so its loopback test endpoint is available.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'This launcher is for ephemeral GitHub-hosted Windows runners.'
}
$node = (Get-Command node.exe).Source
$driver = Join-Path $env:GITHUB_WORKSPACE 'tests/native-hybrid-typing-webview.cjs'
$name = 'lineae-' + [guid]::NewGuid().ToString('N').Substring(0, 10)
$password = ConvertTo-SecureString ('Aa1!' + [guid]::NewGuid().ToString('N')) -AsPlainText -Force
$account = New-LocalUser -Name $name -Password $password
try {
  $users = Get-LocalGroup -SID 'S-1-5-32-545'
  if (-not (Get-LocalGroupMember -Group $users | Where-Object SID -eq $account.SID)) {
    Add-LocalGroupMember -Group $users -Member $account
  }
  $scratch = New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP $name)
  $principal = '*' + $account.SID.Value
  icacls.exe $scratch.FullName /grant ($principal + ':(OI)(CI)M') | Out-Null
  if ($LASTEXITCODE) { throw 'Cannot prepare the test profile directory.' }
  icacls.exe $env:GITHUB_WORKSPACE /grant ($principal + ':(OI)(CI)RX') | Out-Null
  if ($LASTEXITCODE) { throw 'Cannot grant read access to the tested executable and its TeX resources.' }
  $env:TEMP = $env:TMP = $scratch.FullName
  # Keep preinstalled formats and fonts on their usual search paths. Direct
  # new font caches and other per-user writes to the isolated test profile.
  $env:TEXMFCACHE = $scratch.FullName + ';' + $env:TEXMFVAR
  $log = Join-Path $scratch.FullName 'stdout.log'
  $errors = Join-Path $scratch.FullName 'stderr.log'
  $credential = [pscredential]::new("$env:COMPUTERNAME\$name", $password)
  $process = Start-Process -FilePath $node -ArgumentList ('"' + $driver + '"') `
    -WorkingDirectory $env:GITHUB_WORKSPACE -Credential $credential -LoadUserProfile `
    -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $errors -PassThru
  $finished = $process.WaitForExit(300000)
  if (!$finished) { $process.Kill() }
  $process.WaitForExit()
  Get-Content -LiteralPath $log, $errors
  if (!$finished -or $process.ExitCode -ne 0) { throw "Desktop input regression failed ($($process.ExitCode))." }
} finally {
  Remove-LocalUser -SID $account.SID
}
