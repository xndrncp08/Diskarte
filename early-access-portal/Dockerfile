# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------------------
# Diskarte Early Access portal — production image (Next.js standalone output)
#   docker build -t diskarte-early-access early-access-portal
#   docker run -p 3100:3100 --env-file early-access-portal/.env diskarte-early-access
# All configuration is read at runtime, so the same image works in every environment.
# ----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine
ARG RUNTIME_IMAGE=alpine:3.22

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Alpine's nodejs package (system OpenSSL/ICU) keeps the image small; English ICU data still
# carries every time zone, which the dashboard needs for Asia/Manila timestamps.
FROM ${RUNTIME_IMAGE} AS runner
RUN apk add --no-cache nodejs icu-data-en \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/.next/cache \
    && chown -R nextjs:nodejs /app
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
