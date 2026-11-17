@echo off
rem Vytvori na plose zastupce "Krypto sprava" s ikonou appky (spousti START-PC.bat).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$d=[Environment]::GetFolderPath('Desktop'); $n='Krypto spr'+[char]0xE1+'va.lnk';" ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d $n));" ^
  "$s.TargetPath='%~dp0START-PC.bat'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%~dp0web\logo.ico,0';" ^
  "$s.Description='Krypto sprava - prehled krypta, staking a dane'; $s.Save(); Write-Host ('Hotovo: '+(Join-Path $d $n))"
if errorlevel 1 (echo Nepodarilo se vytvorit zastupce.) else (echo Stary zastupce "START-PC - zastupce" muzes smazat.)
pause
