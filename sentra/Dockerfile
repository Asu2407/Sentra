# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/tsconfig.json ./packages/core/
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/mcp/package.json apps/mcp/tsconfig.json ./apps/mcp/
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/

RUN npm ci

COPY packages/core/src ./packages/core/src
COPY apps/api/src ./apps/api/src
COPY apps/mcp/src ./apps/mcp/src
COPY apps/web/src ./apps/web/src

RUN npm --workspace=@sentra/core run build \
 && npm --workspace=@sentra/api run build \
 && npm --workspace=@sentra/web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8001

RUN addgroup -S sentra && adduser -S sentra -G sentra

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/core/package.json ./packages/core/package.json
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

USER sentra
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8001/healthz || exit 1

CMD ["node", "apps/api/dist/server.js"]
