# Családfakutató - FamilySearch

Teljes funkcionalitású családfakutató alkalmazás helyi hálózati használatra.

## Funkciók

### Személyek kezelése
- Teljes körű adatrögzítés: név, születési/halálozási adatok, foglalkozás, végzettség, stb.
- Leánykori név, becenév támogatás
- Fényképek és dokumentumok feltöltése
- Egyéni mezők támogatása
- Életrajz és megjegyzések

### Kapcsolatok
- Szülő-gyermek kapcsolatok
- Házasságok és partnerkapcsolatok
- Életesemények (keresztelő, konfirmáció, diplomázás, stb.)

### Családfa vizualizáció
- Interaktív D3.js alapú családfa megjelenítés
- Függőleges, vízszintes és körkörös elrendezés
- Zoom és pan támogatás
- Személyre szabható színek és méretek
- Gyökér személy választás

### Export/Import
- GEDCOM formátum (genealógiai iparági standard)
- JSON export/import
- Kép exportálás (PNG)

### Testreszabás
- Színek (férfi, női, ismeretlen, háttér, vonalak)
- Kártya méretek és formák
- Betűtípusok és méretek
- Megjelenített információk választása

## Telepítés

### Előfeltételek
- Python 3.8+
- pip

### Telepítési lépések

1. **Virtuális környezet létrehozása (ajánlott)**
```bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
```

2. **Függőségek telepítése**
```bash
pip install -r requirements.txt
```

3. **Alkalmazás indítása**
```bash
python run.py
```

4. **Böngészőben megnyitás**
```
http://localhost:5000
```

## Raspberry Pi deployment

### Telepítés Raspberry Pi-re

1. **Raspberry OS frissítése**
```bash
sudo apt update
sudo apt upgrade -y
```

2. **Python és pip telepítése**
```bash
sudo apt install python3 python3-pip python3-venv -y
```

3. **Alkalmazás klónozása/másolása**
```bash
cd /home/pi
git clone <repo-url> familysearch
# VAGY
scp -r ./FamilySearch pi@raspberrypi:/home/pi/familysearch
```

4. **Virtuális környezet és függőségek**
```bash
cd /home/pi/familysearch
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

5. **Indítás**
```bash
python run.py
```

### Automatikus indítás (systemd service)

Hozd létre a service fájlt:
```bash
sudo nano /etc/systemd/system/familysearch.service
```

Tartalom:
```ini
[Unit]
Description=FamilySearch Family Tree Application
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/familysearch
Environment="PATH=/home/pi/familysearch/venv/bin"
ExecStart=/home/pi/familysearch/venv/bin/python run.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Engedélyezés és indítás:
```bash
sudo systemctl enable familysearch
sudo systemctl start familysearch
sudo systemctl status familysearch
```

### Hozzáférés helyi hálózatról

Az alkalmazás elérhető lesz a Raspberry Pi IP címén:
```
http://<raspberry-pi-ip>:5000
```

A Raspberry Pi IP címének megállapítása:
```bash
hostname -I
```

## Projekt struktúra

```
FamilySearch/
├── app/
│   ├── __init__.py      # Flask alkalmazás inicializálás
│   ├── models.py        # Adatbázis modellek
│   └── routes.py        # API végpontok és útvonalak
├── static/
│   ├── css/
│   │   └── style.css    # Stílusok
│   ├── js/
│   │   ├── app.js       # Fő JavaScript logika
│   │   └── tree.js      # Családfa vizualizáció
│   ├── img/
│   │   └── default-avatar.png
│   └── uploads/         # Feltöltött fájlok
├── templates/
│   └── index.html       # Fő HTML sablon
├── familytree.db        # SQLite adatbázis (automatikusan létrejön)
├── requirements.txt     # Python függőségek
├── run.py              # Alkalmazás indító
└── README.md           # Ez a fájl
```

## API végpontok

### Személyek
- `GET /api/persons` - Összes személy lekérdezése
- `GET /api/persons/<id>` - Egy személy lekérdezése
- `POST /api/persons` - Új személy létrehozása
- `PUT /api/persons/<id>` - Személy frissítése
- `DELETE /api/persons/<id>` - Személy törlése
- `POST /api/persons/<id>/photo` - Profilkép feltöltése

### Házasságok
- `GET /api/marriages` - Összes házasság
- `POST /api/marriages` - Új házasság
- `PUT /api/marriages/<id>` - Házasság frissítése
- `DELETE /api/marriages/<id>` - Házasság törlése

### Események
- `GET /api/events` - Összes esemény
- `POST /api/events` - Új esemény
- `DELETE /api/events/<id>` - Esemény törlése

### Dokumentumok
- `GET /api/documents` - Összes dokumentum
- `POST /api/documents` - Dokumentum feltöltése
- `DELETE /api/documents/<id>` - Dokumentum törlése

### Családfa
- `GET /api/tree/data` - Családfa adatok
- `GET /api/tree/ancestors/<id>` - Felmenők
- `GET /api/tree/descendants/<id>` - Leszármazottak

### Beállítások
- `GET /api/settings` - Beállítások lekérdezése
- `PUT /api/settings` - Beállítások mentése

### Export/Import
- `GET /api/export/gedcom` - GEDCOM export
- `GET /api/export/json` - JSON export
- `POST /api/import/json` - JSON import

### Egyéb
- `GET /api/search?q=<keresés>` - Keresés
- `GET /api/stats` - Statisztikák

## Technológiák

### Backend
- Python 3
- Flask (web framework)
- Flask-SQLAlchemy (ORM)
- SQLite (adatbázis)

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- D3.js (családfa vizualizáció)
- Chart.js (statisztikai diagramok)
- Font Awesome (ikonok)

## Licenc

MIT License