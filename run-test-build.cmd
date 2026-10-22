@echo off
setlocal
cd /d "%~dp0"
set "APP=%~dp0release\win-unpacked\D2L Hub.exe"

rem Rebuilding replaces release\win-unpacked. Windows locks those files while the
rem app is open, and a rebuild then leaves the folder half-written. PowerShell
rem avoids finding Git's Unix find.exe instead of find.exe from Windows.
powershell -NoProfile -Command "if (Get-Process | Where-Object { $_.ProcessName -eq 'D2L Hub' }) { exit 1 }"
if errorlevel 1 (
  echo D2L Hub is running. Close it, then run this again.
  pause
  exit /b 1
)

echo Building the unpacked app. No installer needed...
call npm run dist:win:dir
if errorlevel 1 (
  echo.
  echo The build failed. Scroll up for the error.
  pause
  exit /b 1
)

if not exist "%APP%" (
  echo The unpacked app was not created.
  pause
  exit /b 1
)

start "" "%APP%"
