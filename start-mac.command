#!/bin/bash
# Krypto správa – spuštění na Macu (dvojklik ve Finderu)
cd "$(dirname "$0")" || exit 1
echo "=================================================="
echo " Krypto správa – přehled krypta, staking a daně"
echo "=================================================="
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
  python3 server.py
else
  echo
  echo "CHYBA: Nenašel jsem Python 3."
  echo "Nainstaluj ho z https://www.python.org/downloads/macos/"
  echo "(nebo v Terminálu: xcode-select --install)"
  read -r -p "Enter = konec"
  exit 1
fi
