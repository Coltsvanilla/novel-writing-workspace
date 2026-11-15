@echo off
rem Double-click to start the story viewer. Extra arguments are passed to server.ps1 (e.g. -Port 9000).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" %*
pause
