#!/usr/bin/env bash
# Sestaví balíčky ke stažení: dist/Krypto-sprava-<verze>-{Windows,Linux,Mac}.zip
set -euo pipefail
cd "$(dirname "$0")/.."
V=${1:-$(grep -oP "VERSION = '\K[0-9.]+" web/core.js)}
rm -rf dist && mkdir -p dist
# Windows: přenosný Python (oficiální „embeddable“ balíček z python.org) – uživatel nic neinstaluje
PYEMB=""
if [ "${NO_PYEMB:-}" != "1" ]; then
  for pv in $(seq 30 -1 3); do
    u="https://www.python.org/ftp/python/3.13.$pv/python-3.13.$pv-embed-amd64.zip"
    if curl -fsSL -m 120 -o dist/pyemb.zip "$u" 2>/dev/null; then PYEMB=dist/pyemb.zip; echo "Přibalený Python: 3.13.$pv"; break; fi
  done
  [ -n "$PYEMB" ] || { echo "CHYBA: nepodařilo se stáhnout Python embeddable" >&2; exit 1; }
fi
for os in Windows Linux Mac; do
  d=dist/$os/Krypto-sprava; mkdir -p "$d"
  cp -r web server.py README.txt "$d/"
  [ -f "docs/NAVOD-$os.pdf" ] && cp "docs/NAVOD-$os.pdf" "$d/NAVOD.pdf"
  case $os in
    Windows) cp START-PC.bat ZASTUPCE-NA-PLOSE.bat "$d/"
             if [ -n "$PYEMB" ]; then mkdir -p "$d/python" && unzip -q "$PYEMB" -d "$d/python"; fi;;
    Linux)   cp start-linux.sh "$d/"; chmod +x "$d/start-linux.sh";;
    Mac)     cp start-mac.command "$d/"; chmod +x "$d/start-mac.command";;
  esac
  (cd "dist/$os" && zip -qr -X "../Krypto-sprava-$V-$os.zip" Krypto-sprava)
done
# kontrola: v balíčcích nesmí být osobní data
if unzip -l "dist/*.zip" 2>/dev/null | grep -E '(^|/)(data|exporty|files)/' ; then echo "CHYBA: osobní data v balíčku" >&2; exit 1; fi
rm -f dist/pyemb.zip
ls -la dist/*.zip
