# FamilySearch - Raspberry Pi Deployment

## Előkészületek a Raspberry Pi-n

1. **Docker telepítése** (ha még nincs):
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Kijelentkezés és visszajelentkezés szükséges
```

2. **Docker Compose telepítése**:
```bash
sudo apt-get update
sudo apt-get install docker-compose-plugin
```

3. **Git telepítése** (frissítésekhez):
```bash
sudo apt-get install git
```

## Első telepítés

### 1. Repo klónozása

```bash
cd ~
git clone https://github.com/frederick0102/FamilySearch.git familysearch
cd familysearch
chmod +x update.sh backup.sh
```

### 2. Systemd service beállítása (automatikus indulás)

```bash
# Service fájl másolása
sudo cp familysearch.service /etc/systemd/system/

# Ha nem /home/pi a home mappa, szerkeszd:
# sudo nano /etc/systemd/system/familysearch.service

# Service engedélyezése és indítása
sudo systemctl daemon-reload
sudo systemctl enable familysearch
sudo systemctl start familysearch
```

### 3. Ellenőrzés

```bash
# Service állapota
sudo systemctl status familysearch

# Docker konténer állapota
docker compose ps

# Logok
docker compose logs -f
```

## Frissítés

### Egyszerű frissítés (ajánlott)
```bash
cd ~/familysearch
./update.sh
```

### Manuális frissítés
```bash
cd ~/familysearch
git pull origin main
docker compose down
docker compose up -d --build
```

## Service kezelés

```bash
# Állapot lekérdezése
sudo systemctl status familysearch

# Leállítás
sudo systemctl stop familysearch

# Indítás
sudo systemctl start familysearch

# Újraindítás
sudo systemctl restart familysearch

# Logok megtekintése
sudo journalctl -u familysearch -f
```

## Backup és visszaállítás

### Backup készítése
```bash
cd ~/familysearch
./backup.sh
```

### Automatikus napi backup (cron)
```bash
# Crontab szerkesztése
crontab -e

# Adjuk hozzá (minden nap 3:00-kor):
0 3 * * * cd /home/pi/familysearch && ./backup.sh >> /var/log/familysearch-backup.log 2>&1
```

### Visszaállítás backup-ból
```bash
cd ~/familysearch
tar -xzvf backups/familysearch_backup_XXXXXXXX_XXXXXX.tar.gz
docker compose restart
```

## Adatok

- **Adatbázis**: `./data/familytree.db` - megmarad a konténer újraindítása után is
- **Feltöltött képek**: `./static/uploads/` - szintén perzisztens
- **Backup-ok**: `./backups/` - 30 napig megőrizve

## Hálózati elérés

Az alkalmazás elérhető lesz a helyi hálózaton:
- `http://<RASPBERRY_IP>:8991`

### Raspberry Pi IP címének megkeresése
```bash
hostname -I
```

## Tűzfal (ha szükséges)

```bash
sudo ufw allow 8991/tcp
```

## Hibaelhárítás

### Konténer nem indul
```bash
docker compose logs
docker compose down
docker compose up --build
```

### Port foglalt
```bash
sudo lsof -i :8991
# Majd kill a PID-del
```

### Kevés hely a lemezen
```bash
# Docker takarítás
docker system prune -a
# Régi backup-ok törlése
rm -rf backups/*.tar.gz
```
