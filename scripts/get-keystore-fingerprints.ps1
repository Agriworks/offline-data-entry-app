# PowerShell script to get SHA-1 and SHA-256 fingerprints from Android keystore
# Usage: .\get-keystore-fingerprints.ps1 [path-to-keystore] [alias] [password]

param(
    [string]$KeystorePath = "android/app/debug.keystore",
    [string]$KeystoreAlias = "androiddebugkey",
    [string]$KeystorePassword = "android"
)

Write-Host "Getting fingerprints from keystore: $KeystorePath" -ForegroundColor Cyan
Write-Host "Alias: $KeystoreAlias" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $KeystorePath)) {
    Write-Host "Error: Keystore file not found at $KeystorePath" -ForegroundColor Red
    Write-Host ""
    Write-Host "For EAS Build keystore:" -ForegroundColor Yellow
    Write-Host "1. Run: eas credentials" -ForegroundColor Yellow
    Write-Host "2. Select Android -> Production -> Keystore" -ForegroundColor Yellow
    Write-Host "3. Download the keystore file" -ForegroundColor Yellow
    Write-Host "4. Run this script with the downloaded keystore path" -ForegroundColor Yellow
    exit 1
}

Write-Host "SHA-1 Fingerprint:" -ForegroundColor Green
$sha1Output = keytool -list -v -keystore $KeystorePath -alias $KeystoreAlias -storepass $KeystorePassword 2>&1
$sha1Match = $sha1Output | Select-String -Pattern "SHA1:\s*([0-9A-F]{2}(:[0-9A-F]{2}){19})" | ForEach-Object { $_.Matches.Groups[1].Value }
if ($sha1Match) {
    Write-Host $sha1Match -ForegroundColor White
} else {
    Write-Host "Could not extract SHA-1 fingerprint" -ForegroundColor Red
}

Write-Host ""
Write-Host "SHA-256 Fingerprint:" -ForegroundColor Green
$sha256Match = $sha1Output | Select-String -Pattern "SHA256:\s*([0-9A-F]{2}(:[0-9A-F]{2}){31})" | ForEach-Object { $_.Matches.Groups[1].Value }
if ($sha256Match) {
    Write-Host $sha256Match -ForegroundColor White
} else {
    Write-Host "Could not extract SHA-256 fingerprint" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Copy these fingerprints and add them to:" -ForegroundColor Yellow
Write-Host "Google Cloud Console -> APIs & Services -> Credentials" -ForegroundColor Yellow
Write-Host "-> Your OAuth 2.0 Client ID -> SHA certificate fingerprints" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

