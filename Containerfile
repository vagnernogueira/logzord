# syntax=docker/dockerfile:1.7

# Estágio 1: build da aplicação Vue.js/Vite
FROM docker.io/node:20-alpine AS frontend-builder
WORKDIR /app/frontend

ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

COPY frontend/package*.json ./
RUN --mount=type=secret,id=GITHUB_TOKEN \
  test -s /run/secrets/GITHUB_TOKEN \
  && printf '@vagnernogueira:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/GITHUB_TOKEN)" > .npmrc \
  && npm install \
  && rm -f .npmrc

COPY frontend/ ./
RUN npm run build

# Estágio 2: dependências do backend Node.js
FROM docker.io/node:20-alpine AS backend-deps
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

# Estágio 3: imagem final — Nginx (estático + proxy reverso) e Node (API/WS) sob supervisord
FROM docker.io/nginx:alpine
RUN apk add --no-cache nodejs supervisor

WORKDIR /app
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/package*.json ./
COPY backend/src ./src
COPY backend/targets.json ./targets.json

COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisord.conf

# Nginx é o único ponto de contato externo do container; o Node escuta
# internamente em 127.0.0.1:3002 (ver supervisord.conf) e nunca é exposto aqui.
EXPOSE 3001

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
