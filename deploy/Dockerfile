# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — install production dependencies only
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifest files first for layer-cache efficiency
COPY package.json package-lock.json ./

# Install only production deps; skip devDependencies and postinstall
# (postinstall runs electron-rebuild which requires a display)
RUN npm ci --omit=dev --ignore-scripts

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — final runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Create a non-root user; never run Node as root in production
RUN addgroup -S analy && adduser -S analy -G analy

# Copy only what the server actually needs (no Electron, no renderer)
COPY --from=deps --chown=analy:analy /app/node_modules ./node_modules
COPY --chown=analy:analy src/         ./src/
COPY --chown=analy:analy package.json ./

# SQLite data volume — mount a persistent volume here in docker-compose
RUN mkdir -p /data && chown analy:analy /data
VOLUME ["/data"]

USER analy

ENV NODE_ENV=production
ENV PORT=4000
ENV DB_PATH=/data/emails.db

EXPOSE 4000

# Lightweight health-check that the orchestrator can poll
HEALTHCHECK \
    --interval=30s \
    --timeout=5s \
    --start-period=15s \
    --retries=3 \
    CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server/index.js"]
