# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------------------
# Diskarte Early Access portal — self-hosted image (the primary target is Vercel; see
# DEPLOYMENT.md). Build from the repository root (npm workspace):
#   docker build -f early-access-portal/Dockerfile -t diskarte-early-access .
#   docker run -p 3100:3100 --env-file early-access-portal/.env diskarte-early-access
# ----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine
ARG RUNTIME_IMAGE=alpine:3.22

FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY diskarte/package.json ./diskarte/
COPY early-access-portal/package.json ./early-access-portal/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace early-access-portal --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY early-access-portal ./early-access-portal
RUN npm run build --workspace early-access-portal

# Alpine's nodejs package (system OpenSSL/ICU) keeps the image small; English ICU data still
# carries every time zone, which the dashboard needs for Asia/Manila timestamps.
FROM ${RUNTIME_IMAGE} AS runner
RUN apk add --no-cache nodejs icu-data-en \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/early-access-portal/.next/cache \
    && chown -R nextjs:nodejs /app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /repo/early-access-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/early-access-portal/.next/static ./early-access-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/early-access-portal/public ./early-access-portal/public

USER nextjs
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "early-access-portal/server.js"]
