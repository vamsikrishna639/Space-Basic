# Signs the Android app with the EXISTING signing key (the one from the PWABuilder package), so it installs over
# the current app. Run it yourself in PowerShell: the passwords are asked for hidden, kept only in this process,
# and never printed or saved.
#
#   powershell -ExecutionPolicy Bypass -File android\sign-apk.ps1 -Keystore "<path to signing.keystore>" -Unsigned "<aligned unsigned .apk>"
#
# Output: client\public\downloads\Space-Basic.apk (the download the site serves). Afterwards it checks that the
# certificate's SHA-256 matches client\public\.well-known\assetlinks.json, as the installed app's does.
param(
  [Parameter(Mandatory = $true)][string]$Keystore,
  [Parameter(Mandatory = $true)][string]$Unsigned,
  [string]$Out = (Join-Path $PSScriptRoot '..\client\public\downloads\Space-Basic.apk'),
  [string]$BuildTools = (Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools\36.0.0')
)
$ErrorActionPreference = 'Stop'
$apksigner = Join-Path $BuildTools 'apksigner.bat'
if (-not (Test-Path $apksigner)) { throw "apksigner not found in $BuildTools" }
if (-not (Test-Path $Keystore)) { throw "Keystore not found: $Keystore" }
if (-not (Test-Path $Unsigned)) { throw "Unsigned APK not found: $Unsigned" }

function Read-Secret([string]$prompt) {
  $s = Read-Host -AsSecureString $prompt
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$env:SB_KS_PASS = Read-Secret 'Keystore password'
$key = Read-Secret 'Key password (press Enter if it is the same)'
$env:SB_KEY_PASS = if ($key) { $key } else { $env:SB_KS_PASS }
$key = $null
$tmp = "$Out.signing.apk"   # the current download is replaced only after the checks below pass
try {
  & $apksigner sign --ks $Keystore --ks-pass env:SB_KS_PASS --key-pass env:SB_KEY_PASS --out $tmp $Unsigned
  if ($LASTEXITCODE -ne 0) { throw 'Signing failed (wrong password?). The current APK was not changed.' }
} finally {
  Remove-Item Env:SB_KS_PASS, Env:SB_KEY_PASS -ErrorAction SilentlyContinue
}
Remove-Item "$tmp.idsig" -ErrorAction SilentlyContinue

# Check: the certificate must be the one assetlinks.json names, or the app shows a browser address bar.
$certs = & $apksigner verify --print-certs $tmp
$sha = ($certs | Select-String 'certificate SHA-256 digest: ([0-9a-f]+)').Matches[0].Groups[1].Value.ToUpper()
$colon = ($sha -split '(..)' | Where-Object { $_ }) -join ':'
$links = Get-Content (Join-Path $PSScriptRoot '..\client\public\.well-known\assetlinks.json') -Raw | ConvertFrom-Json
$expected = $links[0].target.sha256_cert_fingerprints[0]
if ($colon -eq $expected) {
  Move-Item -Force $tmp $Out
  Write-Host "Signed: $Out"
  Write-Host 'Certificate matches assetlinks.json: OK'
} else {
  Remove-Item $tmp -ErrorAction SilentlyContinue
  Write-Host "Certificate $colon does NOT match assetlinks.json ($expected). The current APK was not changed." -ForegroundColor Red
  exit 1
}
