@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto have_node
if exist "%ProgramFiles%\nodejs\node.exe" goto add_node
echo Node.js was not found.
echo Install the LTS version from https://nodejs.org/ and run this again.
pause
exit /b 1
:add_node
set "PATH=%ProgramFiles%\nodejs;%PATH%"
:have_node
if exist node_modules goto run
echo First run: installing required libraries...
call npm install --omit=dev
if errorlevel 1 goto npm_failed
goto run
:npm_failed
echo Failed to install the libraries. Check your network connection.
pause
exit /b 1
:run
node server.js %*
pause
