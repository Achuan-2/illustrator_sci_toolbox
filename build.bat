@echo off
setlocal

:: Default: commit workspace changes, package, and publish. Requires gh auth login.
:: Use -NoRelease to skip publication, -NoCommit to skip automatic commits,
:: and -NoPause for unattended execution.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %*
exit /b %errorlevel%
