# Dockerfile for CupidX Socket.IO Real-Time Server
# Host: Render, Railway, or Fly.io (SINGLE INSTANCE REQUIRED for in-memory queue)
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Install OpenSSL and curl for Prisma engine and health checks
RUN apk add --no-cache openssl curl

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts

# Copy Prisma schema and generate Prisma Client for Linux runtime
COPY prisma ./prisma
RUN npx prisma generate

# Copy socket server implementation and moderation engine
COPY socket ./socket

EXPOSE 3001

# Health check using the native /health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Launch the standalone Socket.IO server
CMD ["node", "socket/server.js"]
