# Beacon Platform - One-Click Publish
# Double-click this file or run: .\publish.ps1

$ErrorActionPreference = "Stop"

Write-Host "Publishing Beacon Platform..." -ForegroundColor Cyan

# Check for changes
$status = git status --porcelain
if (-not $status) {
    Write-Host "No changes to publish." -ForegroundColor Yellow
    Write-Host "Edit your files first, then run this script."
    pause
    exit 0
}

# Show what's being published
Write-Host "`nChanges to publish:" -ForegroundColor Green
git status --short

# Commit and push
git add -A
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Update $timestamp"
git push

Write-Host "`n[SUCCESS] Published!" -ForegroundColor Green
Write-Host "Live at: https://naharpt.github.io/beacon-platform/" -ForegroundColor Cyan
Write-Host "Changes visible in ~60 seconds. Tell colleagues to refresh (Ctrl+Shift+R)."
pause
