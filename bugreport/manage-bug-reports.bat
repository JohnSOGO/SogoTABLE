@echo off
setlocal
rem Manage SogoTable bug reports on the server: list / done / open / delete / sync.
rem Double-click to just list them, or pass a command:
rem   manage-bug-reports.bat done 1 3
rem   manage-bug-reports.bat sync
rem Passcode resolution: SOGOTABLE_SUPERUSER_PASSCODE env var -> prompt.

set "PASSCODE=%SOGOTABLE_SUPERUSER_PASSCODE%"
if "%PASSCODE%"=="" set /p "PASSCODE=Enter Sogo passcode: "

if "%PASSCODE%"=="" (
  echo No passcode provided. Nothing to do.
  echo.
  pause
  exit /b 1
)

rem Default to `list` when double-clicked with no arguments.
set "ARGS=%*"
if "%ARGS%"=="" set "ARGS=list"

node "%~dp0..\scripts\manage-bug-reports.mjs" %ARGS% "--pass=%PASSCODE%"

echo.
pause
endlocal
