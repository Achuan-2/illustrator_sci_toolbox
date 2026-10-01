@echo off
setlocal

:: Default: package and publish. Use -NoRelease for packaging only,
:: and -NoPause for unattended execution. Requires gh auth login.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %*
exit /b %errorlevel%
