#!/bin/bash
# Gyors deploy script - tömörítve küldi át a fájlokat
# Használat: ./deploy.sh <user@host> [célmappa]
# Példa: ./deploy.sh frederick01@192.168.0.56 ~/familySearch

set -e

if [ -z "$1" ]; then
    echo "Használat: ./deploy.sh <user@host> [célmappa]"
    echo "Példa: ./deploy.sh frederick01@192.168.0.56 ~/familySearch"
    exit 1
fi

TARGET_HOST="$1"
TARGET_DIR="${2:-~/familySearch}"
ARCHIVE_NAME="familysearch_deploy.tar.gz"

echo "📦 Fájlok tömörítése (venv, cache kizárva)..."
tar --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='.git' \
    --exclude='*.db' \
    --exclude='backups' \
    --exclude='node_modules' \
    --exclude='.DS_Store' \
    --exclude='*.pyc' \
    -czvf "/tmp/${ARCHIVE_NAME}" .

echo "📤 Feltöltés: ${TARGET_HOST}:${TARGET_DIR}..."
scp "/tmp/${ARCHIVE_NAME}" "${TARGET_HOST}:/tmp/"

echo "📂 Kicsomagolás a szerveren..."
ssh "${TARGET_HOST}" "mkdir -p ${TARGET_DIR} && cd ${TARGET_DIR} && tar -xzvf /tmp/${ARCHIVE_NAME} && rm /tmp/${ARCHIVE_NAME}"

echo "🧹 Lokális temp fájl törlése..."
rm "/tmp/${ARCHIVE_NAME}"

echo ""
echo "✅ Deploy kész!"
echo ""
echo "Következő lépések a Raspberry Pi-n:"
echo "  cd ${TARGET_DIR}"
echo "  chmod +x update.sh backup.sh"
echo "  docker compose up -d --build"
