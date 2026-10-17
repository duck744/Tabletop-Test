#!/bin/sh
# Archives the project (without runtime data) to ../tabletop-progress.zip and keeps a rolling local backup.
cd "$(dirname "$0")/.." || exit 1
mkdir -p tabletop-backups
STAMP=$(date +%Y%m%d-%H%M%S)
zip -qr "tabletop-backups/tabletop-$STAMP.zip" tabletop -x 'tabletop/data/*' 'tabletop/node_modules/*'
cp "tabletop-backups/tabletop-$STAMP.zip" tabletop-progress.zip
ls -t tabletop-backups/*.zip | tail -n +11 | xargs -r rm -f
echo "saved tabletop-progress.zip ($STAMP)"
