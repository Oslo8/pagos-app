# ── Etapa 1: Build del Frontend ────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Etapa 2: Servidor de Producción ───────────────────────────
# Usamos Alpine para evitar conflictos de GLIBC y reducir tamaño
FROM node:20-alpine
WORKDIR /app

# Instalar dependencias necesarias para Puppeteer y SQLite en Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    sqlite-dev \
    python3 \
    make \
    g++

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app/backend
COPY backend/package*.json ./

# Forzamos la compilación de módulos nativos (como sqlite3) dentro de Alpine
RUN npm install --omit=dev

COPY backend/ ./

# Copiar el build del frontend
COPY --from=builder /app/frontend/dist ./public

VOLUME ["/app/data"]

ENV PORT=3000 \
    NODE_ENV=production \
    DB_PATH=/app/data/database.sqlite \
    WA_AUTH_PATH=/app/data/.wwebjs_auth

EXPOSE 3000
CMD ["node", "server.js"]
