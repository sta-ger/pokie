@echo off
rem Double-click launcher for a POKIE checkout on Windows.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-studio.ps1" %*
if errorlevel 1 pause
