@echo off
setlocal
cd /d "%~dp0"
title Krypto sprava
echo ==================================================
echo Krypto sprava - prehled krypta, staking a dane (PC)
echo ==================================================
rem pribaleny Python (slozka python) - neni potreba nic instalovat
if exist "%~dp0python\python.exe" ("%~dp0python\python.exe" server.py & goto :end)
where python >nul 2>&1 && (python server.py & goto :end)
where py >nul 2>&1 && (py -3 server.py & goto :end)
echo.
echo CHYBA: Nenasel jsem Python. Nainstaluj ho z python.org (zaskrtni "Add to PATH").
pause
:end
