@echo off
cd /d "%~dp0"
echo Starting Beacon Platform...
echo.
start http://localhost:8080
python server.py
pause
