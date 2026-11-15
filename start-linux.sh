#!/usr/bin/env bash
# Krypto správa – spuštění na Linuxu
cd "$(dirname "$(readlink -f "$0")")" || exit 1
echo "=================================================="
echo " Krypto správa – přehled krypta, staking a daně"
echo "=================================================="
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1 && python -c 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)'; then PY=python
else
  echo
  echo "CHYBA: Nenašel jsem Python 3."
  echo "  Debian/Ubuntu/Mint:  sudo apt install python3"
  echo "  Fedora:              sudo dnf install python3"
  echo "  Arch:                sudo pacman -S python"
  read -r -p "Enter = konec"
  exit 1
fi
"$PY" server.py
st=$?
if [ $st -ne 0 ]; then read -r -p "Appka skončila s chybou ($st). Enter = konec"; fi
