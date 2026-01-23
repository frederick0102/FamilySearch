#!/bin/bash
# FamilySearch frissítő script
# Használat: ./update.sh

set -e

echo "🔄 FamilySearch frissítése..."

# Git pull (ha git-tel van telepítve)
if [ -d ".git" ]; then
    echo "📥 Legújabb változások letöltése..."
    git pull origin main
else
    echo "❌ HIBA: Ez nem egy git repository!"
    echo "   Futtasd: git clone https://github.com/frederick0102/FamilySearch.git"
    echo "   Vagy inicializáld: git init && git remote add origin https://github.com/frederick0102/FamilySearch.git && git fetch && git checkout main"
    exit 1
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
