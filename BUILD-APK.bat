@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "VER=0.4.0"
echo ==================================================
echo Krypto sprava - build Android APK
echo Verze: %VER%
echo ==================================================
echo.

set "NEW_ANDROID=%CD%\android"
set "WRAP1=%GRADLE_WRAPPER_FROM%"
set "WRAP2="

rem Gradle wrapper se zkopiruje z jineho Android projektu: set GRADLE_WRAPPER_FROM=C:\cesta\k\projektu\android
set "OLD_ANDROID="
if exist "%WRAP1%\gradle\wrapper\gradle-wrapper.jar" set "OLD_ANDROID=%WRAP1%"
if not defined OLD_ANDROID if exist "%WRAP2%\gradle\wrapper\gradle-wrapper.jar" set "OLD_ANDROID=%WRAP2%"
if not exist "%NEW_ANDROID%\gradle\wrapper" mkdir "%NEW_ANDROID%\gradle\wrapper"
if not exist "%NEW_ANDROID%\gradle\wrapper\gradle-wrapper.jar" (
    if not defined OLD_ANDROID goto :missing_wrapper
    copy /Y "%OLD_ANDROID%\gradle\wrapper\gradle-wrapper.jar" "%NEW_ANDROID%\gradle\wrapper\gradle-wrapper.jar" >nul
)
if not exist "%NEW_ANDROID%\gradlew.bat" (
    if not defined OLD_ANDROID goto :missing_wrapper
    copy /Y "%OLD_ANDROID%\gradlew.bat" "%NEW_ANDROID%\gradlew.bat" >nul
)
if not exist "%NEW_ANDROID%\gradlew" (
    if defined OLD_ANDROID copy /Y "%OLD_ANDROID%\gradlew" "%NEW_ANDROID%\gradlew" >nul
)

if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)
if not defined JAVA_HOME (
    where java >nul 2>&1 || goto :missing_java
)

if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%ANDROID_HOME%\platforms\android-35" goto :missing_sdk35

rem Webova cast appky (stejna jako na PC) -> assets
if exist "%NEW_ANDROID%\app\src\main\assets\web" rmdir /S /Q "%NEW_ANDROID%\app\src\main\assets\web"
mkdir "%NEW_ANDROID%\app\src\main\assets\web"
xcopy /E /I /Y /Q "%~dp0web" "%NEW_ANDROID%\app\src\main\assets\web" >nul

cd /d "%NEW_ANDROID%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=$env:ANDROID_HOME -replace '\\','/'; Set-Content -Encoding ASCII -Path 'local.properties' -Value ('sdk.dir=' + $p)"

if not exist "%~dp0files" mkdir "%~dp0files"
call gradlew.bat --no-daemon clean :app:assembleDebug --stacktrace > "%~dp0files\build-%VER%.log" 2>&1
set "BUILD_RC=%ERRORLEVEL%"
type "%~dp0files\build-%VER%.log" | findstr /I /C:"BUILD" /C:"error" /C:"FAIL"
if not "%BUILD_RC%"=="0" goto :build_failed

cd /d "%~dp0"
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "files\KryptoSprava-%VER%-debug.apk" >nul
if errorlevel 1 goto :copy_failed

for /f "tokens=*" %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 'files\KryptoSprava-%VER%-debug.apk').Hash.ToLower()"') do set "APK_SHA=%%H"
>"files\KryptoSprava-%VER%-debug.apk.sha256.txt" echo %APK_SHA%  KryptoSprava-%VER%-debug.apk

echo.
echo ==================================================
echo HOTOVO
echo APK: %CD%\files\KryptoSprava-%VER%-debug.apk
echo SHA-256: %APK_SHA%
echo ==================================================
echo APK zkopiruj do telefonu a nainstaluj.
pause
exit /b 0

:missing_wrapper
echo.
echo CHYBA: Nenasel jsem Gradle wrapper. Nastav GRADLE_WRAPPER_FROM na slozku Android projektu s gradlew.bat,
echo nebo pouzij GitHub Actions (tag vX.Y.Z sestavi APK sam).
echo %WRAP1%
echo %WRAP2%
pause
exit /b 2

:missing_java
echo.
echo CHYBA: Neni dostupna Java / Android Studio JBR.
pause
exit /b 3

:missing_sdk35
echo.
echo CHYBA: V Android SDK (%ANDROID_HOME%) chybi platforma Android 35.
pause
exit /b 6

:build_failed
echo.
echo BUILD SELHAL. Log: files\build-%VER%.log
pause
exit /b 5

:copy_failed
echo.
echo BUILD probehl, ale nenasel jsem app-debug.apk.
pause
exit /b 7
