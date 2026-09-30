# Образ для HTTP-режима: один общий сервер за обратным прокси с HTTPS.
# Для stdio контейнер не нужен — там сервер запускает сам клиент.

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Настройки сервера — из окружения запуска, файл .env в образе не читается.
# MCP_TLS_BY_PROXY здесь намеренно не задан: без TLS на 0.0.0.0 сервер не стартует,
# пока окружение запуска явно не скажет, что HTTPS снимает прокси.
ENV NODE_ENV=production \
    SAP_CATS_DOTENV=0 \
    MCP_TRANSPORT=http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=3000

USER node
EXPOSE 3000

# Только живость процесса: о доступности SAP /health не говорит — перезапуск её не исправит.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCP_PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "dist/index.js"]
