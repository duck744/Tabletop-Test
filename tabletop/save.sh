#!/bin/sh
# Snapshot the project to ../tabletop-backups/ (keeps the 20 newest).
cd "$(dirname "$0")/.." || exit 1
mkdir -p tabletop-backups
zip -qr "tabletop-backups/tabletop-$(date +%Y%m%d-%H%M%S).zip" tabletop -x 'tabletop/node_modules/*' 'tabletop/data/db.json' 'tabletop/data/assets/*'
ls -1t tabletop-backups/*.zip | tail -n +21 | xargs -r rm --
