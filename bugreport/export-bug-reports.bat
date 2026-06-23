@echo off
setlocal
rem Export SogoTable bug reports into this folder as one .txt per report.
rem Double-click to run, or pass the passcode as the first argument.
rem Passcode resolution: argument -> SOGOTABLE_SUPERUSER_PASSCODE env var -> prompt.

set "PASSCODE=%~1"
if "%PASSCODE%"=="" set "PASSCODE=%SOGOTABLE_SUPERUSER_PASSCODE%"
if "%PASSCODE%"=="" set /p "PASSCODE=Enter Sogo passcode: "

if "%PASSCODE%"=="" (
  echo No passcode provided. Nothing exported.
  echo.
  pause
  exit /b 1
)

node "%~dp0..\scripts\export-bug-reports.mjs" "%PASSCODE%"

echo.
pause
endlocal
