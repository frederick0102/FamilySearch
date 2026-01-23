# Raspberry Pi kompatibilis Python image (ARM64)
FROM python:3.12-slim

# Munkamappa beállítása
WORKDIR /app

# Rendszer függőségek (Pillow-hoz szükséges)
RUN apt-get update && apt-get install -y \
    gcc \
    libjpeg-dev \
    zlib1g-dev \
    libpng-dev \
    && rm -rf /var/lib/apt/lists/*

# Python függőségek telepítése
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir gunicorn

# Alkalmazás fájlok másolása
COPY . .

# Upload mappa létrehozása
RUN mkdir -p /app/static/uploads

# Port megnyitása
EXPOSE 8991

# Gunicorn-nal futtatás production-ben
CMD ["gunicorn", "--bind", "0.0.0.0:8991", "--workers", "2", "run:app"]
