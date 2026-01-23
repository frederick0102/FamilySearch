#!/bin/bash
# FamilySearch frissítő script
# Használat: ./update.sh

set -e

echo "🔄 FamilySearch frissítése..."

# Git pull (ha git-tel van telepítve)
if [ -d ".git" ]; then
    echo "📥 Legújabb változások letöltése..."
    git pull origin main
fi

# Docker újraépítés és újraindítás
echo "🐳 Docker container újraépítése..."
docker compose down
docker compose up -d --build

# Régi image-ek törlése (helytakarékosság)
echo "🧹 Régi image-ek törlése..."
docker image prune -f

echo "✅ Frissítés kész!"
echo "📊 Állapot:"
docker compose ps
