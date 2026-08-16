@echo off
setlocal

echo ========================================================
echo        Adobe Illustrator Plugin Packaging Script
echo ========================================================
echo.

:: 1. Configuration
set "PROJECT_DIR=%~dp0"
set "BUILD_DIR=%PROJECT_DIR%build"
set "DIST_DIR=%PROJECT_DIR%dist_temp"
set "CERT_FILE=%PROJECT_DIR%cert.p12"
set "CERT_PASS=achuan-2.com"

:: Extract version from CSXS/manifest.xml
set "VERSION="
for /f "tokens=*" %%v in ('powershell -NoProfile -Command "([xml](Get-Content '%PROJECT_DIR%CSXS\manifest.xml')).ExtensionManifest.ExtensionBundleVersion"') do set "VERSION=%%v"

if not "%VERSION%"=="" (
    echo Detected Plugin Version: v%VERSION%
    set "OUTPUT_ZXP=%BUILD_DIR%\illustrator_sci_plugin_v%VERSION%.zxp"
    set "OUTPUT_ZIP=%BUILD_DIR%\illustrator_sci_plugin_v%VERSION%.zip"
) else (
    set "OUTPUT_ZXP=%BUILD_DIR%\illustrator_sci_plugin.zxp"
    set "OUTPUT_ZIP=%BUILD_DIR%\illustrator_sci_plugin.zip"
)

:: Locate ZXPSignCmd
set "ZXP_CMD="
if exist "%PROJECT_DIR%ZXPSignCmd.exe" set "ZXP_CMD=%PROJECT_DIR%ZXPSignCmd.exe"
if "%ZXP_CMD%"=="" if exist "%PROJECT_DIR%..\ZXPSignCmd.exe" set "ZXP_CMD=%PROJECT_DIR%..\ZXPSignCmd.exe"
if "%ZXP_CMD%"=="" (
    where ZXPSignCmd >nul 2>nul
    if %errorlevel% equ 0 set "ZXP_CMD=ZXPSignCmd"
)

if "%ZXP_CMD%"=="" (
    echo [ERROR] ZXPSignCmd.exe not found!
    echo Please place ZXPSignCmd.exe in the project or parent directory.
    goto end
)

echo [1/5] Cleaning old build artifacts...
if exist "%DIST_DIR%" rd /s /q "%DIST_DIR%"
if not exist "%BUILD_DIR%" (
    mkdir "%BUILD_DIR%"
) else (
    del /f /q "%BUILD_DIR%\*.zxp" "%BUILD_DIR%\*.zip" 2>nul
)
mkdir "%DIST_DIR%"

echo [2/5] Copying clean runtime files...
xcopy "%PROJECT_DIR%CSXS" "%DIST_DIR%\CSXS" /E /I /Q /Y >nul
xcopy "%PROJECT_DIR%client" "%DIST_DIR%\client" /E /I /Q /Y >nul
xcopy "%PROJECT_DIR%host" "%DIST_DIR%\host" /E /I /Q /Y >nul
xcopy "%PROJECT_DIR%icons" "%DIST_DIR%\icons" /E /I /Q /Y >nul
xcopy "%PROJECT_DIR%jsx" "%DIST_DIR%\jsx" /E /I /Q /Y >nul

echo [3/5] Checking self-signed certificate...
if not exist "%CERT_FILE%" (
    echo Generating self-signed certificate 10 years validity...
    "%ZXP_CMD%" -selfSignedCert CN Changsha achuan-2.com achuan-2 "%CERT_PASS%" "%CERT_FILE%" -validityDays 3650
)

echo [4/5] Packaging and signing ZXP...
"%ZXP_CMD%" -sign "%DIST_DIR%" "%OUTPUT_ZXP%" "%CERT_FILE%" "%CERT_PASS%" -tsa http://timestamp.digicert.com
if %errorlevel% neq 0 (
    echo [INFO] Retrying with alternative timestamp server...
    "%ZXP_CMD%" -sign "%DIST_DIR%" "%OUTPUT_ZXP%" "%CERT_FILE%" "%CERT_PASS%" -tsa http://timestamp.adobe.com
)
if %errorlevel% neq 0 (
    echo [WARNING] TSA timestamp server unavailable, fallback to signing without TSA...
    "%ZXP_CMD%" -sign "%DIST_DIR%" "%OUTPUT_ZXP%" "%CERT_FILE%" "%CERT_PASS%"
)

echo [5/5] Verifying ZXP signature...
"%ZXP_CMD%" -verify "%OUTPUT_ZXP%"

:: Generate ZIP copy directly from the signed ZXP
copy /y "%OUTPUT_ZXP%" "%OUTPUT_ZIP%" >nul

:cleanup
if exist "%DIST_DIR%" rd /s /q "%DIST_DIR%"

echo.
echo ========================================================
if exist "%OUTPUT_ZXP%" echo  [ZXP] Output: %OUTPUT_ZXP%
if exist "%OUTPUT_ZIP%" echo  [ZIP] Output: %OUTPUT_ZIP%
echo ========================================================

:end
echo.
pause