# ==============================================================================
# ENCTXT Production Multi-Stage Dockerfile
# Stage 1: Build & Compile TypeScript Monorepo
# Stage 2: Minimal Non-Root Production Runtime
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies required for native modules
RUN apk add --no-cache openssl

# Copy root workspace package files
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Clean install dependencies
RUN npm ci

# Copy full application source code
COPY tsconfig*.json ./
COPY shared/ ./shared/
COPY server/ ./server/
COPY client/ ./client/

# Generate Prisma client and compile all packages
RUN npm run prisma:generate --workspace=server
RUN npm run build --workspace=shared
RUN npm run build --workspace=server
RUN npm run build --workspace=client

# Prune development dependencies
RUN npm prune --production

# ------------------------------------------------------------------------------
# Stage 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Install OpenSSL for Prisma engine runtime
RUN apk add --no-cache openssl dumb-init curl

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Copy pruned node_modules and built packages from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared/package.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/client/dist ./client/dist

# Security: Run application as non-root user
USER node

EXPOSE 5000

# Health check probe against local server
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# dumb-init handles process signals (SIGTERM, SIGINT) correctly
ENTRYPOINT ["/usr/bin/dumb-init", "--"]

CMD ["node", "server/dist/server.js"]
