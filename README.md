<div align="center">

# FamilySearch

### Magyar Családfakutató Alkalmazás

[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![D3.js](https://img.shields.io/badge/D3.js-7.x-F9A03C?style=for-the-badge&logo=d3.js&logoColor=white)](https://d3js.org)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://sqlite.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**Teljes funkcionalitású, interaktív családfakutató alkalmazás helyi hálózati használatra.**

[Telepítés](#telepítés) | [Funkciók](#funkciók) | [API](#api-végpontok) | [Raspberry Pi](#raspberry-pi-deployment)

</div>

---

## Áttekintés

A FamilySearch egy modern, webalapú családfakutató alkalmazás, amely lehetővé teszi a családi kapcsolatok rögzítését, vizualizálását és kezelését. Az alkalmazás magyar nyelven készült, és támogatja a GEDCOM 7.0 szabványt.

## Funkciók

### Személyek kezelése

| Funkció | Leírás |
|---------|--------|
| **Alapadatok** | Név, születési/halálozási dátum és hely, foglalkozás, végzettség |
| **Kiegészítő adatok** | Leánykori név, becenév, egyéni mezők |
| **Média** | Profilképek és dokumentumok feltöltése |
| **Életrajz** | Részletes életrajz és megjegyzések |

### Kapcsolatok

| Típus | Leírás |
|-------|--------|
| **Családi** | Szülő-gyermek, testvér kapcsolatok |
| **Párkapcsolati** | Házasság, élettársi kapcsolat, jegyesség |
| **Események** | Keresztelő, konfirmáció, diplomázás, egyéb életesemények |

### Családfa vizualizáció

- **Interaktív megjelenítés** - D3.js alapú, dinamikus családfa
- **Navigáció** - Zoom, pan, középre igazítás
- **Gyökér személy** - Szabadon választható kiindulópont
- **Rokonsági címkék** - Automatikus magyar megnevezések (apa, anya, nagybácsi, unokatestvér, stb.)
- **Házassági vonalak** - Vizuális kapcsolatok megjelenítése

### Export és Import

| Formátum | Export | Import |
|----------|:------:|:------:|
| GEDCOM 7.0 | Igen | - |
| JSON | Igen | Igen |
| PNG kép | Igen | - |

### Testreszabás

- Színek (nemek, háttér, vonalak)
- Kártya méretek és formák
- Betűtípusok és méretek
- Megjelenített információk

---

## Telepítés

### Előfeltételek

```
Python 3.8 vagy újabb
pip csomagkezelő
```

### Gyors telepítés

```bash
# 1. Repository klónozása
git clone https://github.com/username/FamilySearch.git
cd FamilySearch

# 2. Virtuális környezet létrehozása
python -m venv venv

# 3. Virtuális környezet aktiválása
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# 4. Függőségek telepítése
pip install -r requirements.txt

# 5. Alkalmazás indítása
python run.py
```

### Megnyitás böngészőben

```
http://localhost:8991
```

---

## Raspberry Pi Deployment

### Telepítés

```bash
# Rendszer frissítése
sudo apt update && sudo apt upgrade -y

# Python telepítése
sudo apt install python3 python3-pip python3-venv -y

# Alkalmazás másolása
cd /home/pi
git clone <repo-url> familysearch
cd familysearch

# Virtuális környezet
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Systemd Service

Hozd létre a `/etc/systemd/system/familysearch.service` fájlt:

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

```bash
# Service engedélyezése és indítása
sudo systemctl enable familysearch
sudo systemctl start familysearch
sudo systemctl status familysearch
```

### Hálózati hozzáférés

```bash
# IP cím megállapítása
hostname -I

# Elérés: http://<raspberry-pi-ip>:8991
```

---

## Projekt struktúra

```
FamilySearch/
├── app/
│   ├── __init__.py          # Flask alkalmazás inicializálás
│   ├── models.py            # SQLAlchemy adatbázis modellek
│   └── routes.py            # API végpontok és útvonalak
├── static/
│   ├── css/
│   │   └── style.css        # Alkalmazás stílusok
│   ├── js/
│   │   ├── app.js           # Fő JavaScript logika
│   │   └── tree.js          # D3.js családfa vizualizáció
│   ├── img/                 # Statikus képek
│   └── uploads/             # Feltöltött fájlok
├── templates/
│   └── index.html           # Fő HTML sablon
├── docs/                    # Dokumentáció
├── familytree.db            # SQLite adatbázis
├── requirements.txt         # Python függőségek
├── run.py                   # Alkalmazás belépési pont
└── README.md
```

---

## API végpontok

### Személyek

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/persons` | Összes személy lekérdezése |
| `GET` | `/api/persons/<id>` | Egy személy lekérdezése |
| `POST` | `/api/persons` | Új személy létrehozása |
| `PUT` | `/api/persons/<id>` | Személy frissítése |
| `DELETE` | `/api/persons/<id>` | Személy törlése |
| `POST` | `/api/persons/<id>/photo` | Profilkép feltöltése |

### Házasságok

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/marriages` | Összes házasság |
| `POST` | `/api/marriages` | Új házasság létrehozása |
| `PUT` | `/api/marriages/<id>` | Házasság frissítése |
| `DELETE` | `/api/marriages/<id>` | Házasság törlése |

### Események

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/events` | Összes esemény |
| `POST` | `/api/events` | Új esemény létrehozása |
| `DELETE` | `/api/events/<id>` | Esemény törlése |

### Családfa

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/tree/data` | Teljes családfa adatok |
| `GET` | `/api/tree/ancestors/<id>` | Felmenők lekérdezése |
| `GET` | `/api/tree/descendants/<id>` | Leszármazottak lekérdezése |

### Beállítások

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/settings` | Beállítások lekérdezése |
| `PUT` | `/api/settings` | Beállítások mentése |

### Export/Import

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/export/gedcom` | GEDCOM export |
| `GET` | `/api/export/json` | JSON export |
| `POST` | `/api/import/json` | JSON import |

### Egyéb

| Metódus | Végpont | Leírás |
|---------|---------|--------|
| `GET` | `/api/search?q=<query>` | Keresés |
| `GET` | `/api/stats` | Statisztikák |

---

## Technológiai stack

<table>
<tr>
<td align="center" width="50%">

### Backend

| Technológia | Verzió |
|-------------|--------|
| Python | 3.8+ |
| Flask | 3.0.0 |
| Flask-SQLAlchemy | 3.1.1 |
| Flask-CORS | 4.0.0 |
| SQLite | 3.x |
| Pillow | 10.1.0 |

</td>
<td align="center" width="50%">

### Frontend

| Technológia | Leírás |
|-------------|--------|
| HTML5 | Szemantikus markup |
| CSS3 | Modern stílusok |
| JavaScript | ES6+ |
| D3.js | Családfa vizualizáció |
| Flatpickr | Dátumválasztó |
| Font Awesome | Ikonok |

</td>
</tr>
</table>

---

## Adatmodell

Az alkalmazás GEDCOM 7.0 kompatibilis adatmodellt használ:

- **Person** - Személyek alapadatai
- **Marriage** - Házasságok és párkapcsolatok (Family entitás)
- **Event** - Életesemények
- **Document** - Dokumentumok és képek
- **TreeSettings** - Megjelenítési beállítások

A `parent_family_id` mező kapcsolja össze a gyermekeket a szülői családdal (Marriage entitás).

---

## Licenc

Ez a projekt MIT licenc alatt áll. Lásd a [LICENSE](LICENSE) fájlt a részletekért.

---

<div align="center">

**Készült Python és D3.js technológiákkal**

</div>
