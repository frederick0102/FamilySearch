#!/bin/bash
# FamilySearch backup script
# Használat: ./backup.sh

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="familysearch_backup_${TIMESTAMP}"

echo "💾 FamilySearch backup készítése..."

# Backup mappa létrehozása
mkdir -p "$BACKUP_DIR"

# Adatbázis és uploads mentése
echo "📦 Fájlok archiválása..."
tar -czvf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" \
    --exclude='backups' \
    ./data \
    ./static/uploads \
    2>/dev/null || true

# Régi backup-ok törlése (30 napnál régebbiek)
echo "🧹 Régi backup-ok törlése..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete 2>/dev/null || true

echo "✅ Backup kész: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
ls -lh "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
