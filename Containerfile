# syntax=docker/dockerfile:1.7

# Bases fixas. Build e runtime usam a mesma linha do Node (major.minor), com
# patches de segurança flutuando: node:${NODE_VERSION}-alpine nos estágios de
# build e `nodejs~${NODE_VERSION}` do apk na imagem final. O apk é usado em vez
# de copiar o binário de node:*-alpine porque este é ~2x maior (ICU completo e
# libs estáticas).
ARG NODE_VERSION=24.22
ARG ALPINE_VERSION=3.24
ARG NGINX_VERSION=1.31.8

# Estágio 1: build da aplicação Vue.js/Vite
FROM docker.io/node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS frontend-builder
WORKDIR /app

ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}

# O lockfile é o da raiz (npm workspaces); os package.json dos dois workspaces
# entram para que o `npm ci` valide o lock por inteiro.
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN --mount=type=secret,id=GITHUB_TOKEN \
  test -s /run/secrets/GITHUB_TOKEN \
  && printf '@vagnernogueira:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$(cat /run/secrets/GITHUB_TOKEN)" > .npmrc \
  && npm ci --workspace=frontend --include-workspace-root=false \
  && rm -f .npmrc

COPY frontend/ ./frontend/
RUN npm run build --workspace=frontend

# Estágio 2: dependências de produção do backend Node.js
FROM docker.io/node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS backend-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
# As dependências são içadas para /app/node_modules; o link do próprio workspace
# (node_modules/logzord-backend -> ../backend) não serve na imagem final.
# Limitação do npm: deps de produção do frontend alcançáveis pelas devDeps do
# backend (ex.: postcss, via vitest/vite e vue) não são marcadas `dev` no lock e
# permanecem; são poucas e pequenas.
RUN npm ci --workspace=backend --omit=dev --include-workspace-root=false \
  && rm -f node_modules/logzord-backend

# Estágio 3: imagem final — Nginx (estático + proxy reverso) e Node (API/WS) sob supervisord
FROM docker.io/nginx:${NGINX_VERSION}-alpine${ALPINE_VERSION}
ARG NODE_VERSION
RUN apk add --no-cache "nodejs~${NODE_VERSION}" supervisor

WORKDIR /app
COPY --from=backend-deps /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY backend/targets.json ./targets.json
COPY backend/config.json ./config.json

COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

COPY nginx-main.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY supervisord.conf /etc/supervisord.conf

# Nginx é o único ponto de contato externo do container; o Node escuta
# internamente em 127.0.0.1:3002 (ver supervisord.conf) e nunca é exposto aqui.
EXPOSE 3001

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
