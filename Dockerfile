# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------------------
# Diskarte — production image (Next.js standalone output)
#   docker build -t diskarte .
#   docker run -p 3000:3000 --env-file .env diskarte
# All configuration is read at runtime, so the same image works in every environment.
# ----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine
# Alpine 3.22 ships Node.js 22 LTS in its main repository.
ARG RUNTIME_IMAGE=alpine:3.22

# 1) Install dependencies (cached on package-lock.json) ------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# 2) Build the standalone server ------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Runtime: Alpine's own nodejs package links against system libraries (OpenSSL, ICU, libuv…)
#    instead of the ~110 MB statically-bundled official binary, keeping the image well under
#    150 MB. Full ICU data keeps Intl time zones/locales (Asia/Manila timestamps) identical.
FROM ${RUNTIME_IMAGE} AS runner
RUN apk add --no-cache nodejs icu-data-full \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/.next/cache \
    && chown -R nextjs:nodejs /app \
    && node -e "new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila' }).format(new Date())"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
