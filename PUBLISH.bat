@echo off
cd /d "%~dp0"
echo.
echo ========================================
echo    BEACON PLATFORM - PUBLISH
echo ========================================
echo.

git status --porcelain > nul 2>&1
git diff --quiet && git diff --cached --quiet
if %errorlevel%==0 (
    echo No changes to publish.
    echo Edit your files first, then click this again.
    echo.
    pause
    exit /b 0
)

echo Changes to publish:
git status --short
echo.

git add -A
for /f "tokens=*" %%i in ('powershell -command "Get-Date -Format 'yyyy-MM-dd HH:mm'"') do set timestamp=%%i
git commit -m "Update %timestamp%"
git push

echo.
echo ========================================
echo    SUCCESS! Published!
echo ========================================
echo.
echo Live at: https://naharpt.github.io/beacon-platform/
echo.
echo Tell colleagues to refresh with Ctrl+Shift+R
echo.
pause
