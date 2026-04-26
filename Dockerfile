# ── Etapa 1: Build del Frontend ────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Etapa 2: Servidor de Producción ───────────────────────────
FROM node:20-slim
WORKDIR /app

# Dependencias del sistema para Puppeteer/WhatsApp
RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libxss1 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./

# Copiar el build del frontend al directorio 'public' del backend
COPY --from=builder /app/frontend/dist ./public

# El volumen para datos persistentes (DB + WhatsApp auth)
VOLUME ["/app/data"]

ENV PORT=3000 \
    NODE_ENV=production \
    DB_PATH=/app/data/database.sqlite \
    WA_AUTH_PATH=/app/data/.wwebjs_auth

EXPOSE 3000
CMD ["node", "server.js"]
