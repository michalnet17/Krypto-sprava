#!/usr/bin/env bash
# Sestaví balíčky ke stažení: dist/Krypto-sprava-<verze>-{Windows,Linux,Mac}.zip
set -euo pipefail
cd "$(dirname "$0")/.."
V=${1:-$(grep -oP "VERSION = '\K[0-9.]+" web/core.js)}
rm -rf dist && mkdir -p dist
for os in Windows Linux Mac; do
  d=dist/$os/Krypto-sprava; mkdir -p "$d"
  cp -r web server.py README.txt "$d/"
  [ -f "docs/NAVOD-$os.pdf" ] && cp "docs/NAVOD-$os.pdf" "$d/NAVOD.pdf"
  case $os in
    Windows) cp START-PC.bat "$d/";;
    Linux)   cp start-linux.sh "$d/"; chmod +x "$d/start-linux.sh";;
    Mac)     cp start-mac.command "$d/"; chmod +x "$d/start-mac.command";;
  esac
  (cd "dist/$os" && zip -qr -X "../Krypto-sprava-$V-$os.zip" Krypto-sprava)
done
# kontrola: v balíčcích nesmí být osobní data
if unzip -l "dist/*.zip" 2>/dev/null | grep -E '(^|/)(data|exporty|files)/' ; then echo "CHYBA: osobní data v balíčku" >&2; exit 1; fi
ls -la dist/*.zip
