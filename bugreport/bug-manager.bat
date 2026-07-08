@echo off
setlocal
rem Open the friendly SogoTable bug-report manager in your browser.
rem Double-click to run. It starts a small local server (localhost only) that
rem talks to the live site, and opens the manager page automatically.
rem Passcode resolution: SOGOTABLE_SUPERUSER_PASSCODE env var -> prompt.
rem Close the console window (or press Ctrl+C) when you're done.

set "PASSCODE=%SOGOTABLE_SUPERUSER_PASSCODE%"
if "%PASSCODE%"=="" set /p "PASSCODE=Enter Sogo passcode: "

if "%PASSCODE%"=="" (
  echo No passcode provided. Cannot start.
  echo.
  pause
  exit /b 1
)

node "%~dp0..\scripts\serve-bug-manager.mjs" "%PASSCODE%"

echo.
pause
endlocal
