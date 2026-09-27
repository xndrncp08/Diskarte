# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------------------
# Diskarte — production image (Next.js standalone output)
#   docker build -f diskarte/Dockerfile -t diskarte .        # context = repository root
#   docker run -p 3000:3000 --env-file diskarte/.env diskarte
# The repo is an npm workspace (diskarte/ + early-access-portal/ share one lockfile), so the
# build context is the root; only diskarte/ and the workspace manifests are copied in.
# All configuration is read at runtime, so the same image works in every environment.
# ----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine
# Alpine 3.22 ships Node.js 22 LTS in its main repository.
ARG RUNTIME_IMAGE=alpine:3.22

# 1) Install this app's dependencies (cached on the workspace lockfile) ----------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /repo
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY diskarte/package.json ./diskarte/
COPY early-access-portal/package.json ./early-access-portal/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace diskarte --no-audit --no-fund

# 2) Build the standalone server ------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
# Trace only sharp's musl binaries into the standalone output (see next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1 \
    DISKARTE_SHARP_TARGET=linuxmusl
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY diskarte ./diskarte
RUN npm run build --workspace diskarte

# 3) Runtime: Alpine's own nodejs package links against system libraries (OpenSSL, ICU, libuv…)
#    instead of the ~110 MB statically-bundled official binary. English ICU data (~2.6 MB instead
#    of ~30 MB) still carries every time zone; that headroom pays for sharp/libvips, which powers
#    next/image (AVIF/WebP). The check below fails the build if Asia/Manila formatting breaks.
FROM ${RUNTIME_IMAGE} AS runner
RUN apk add --no-cache nodejs icu-data-en \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/diskarte/.next/cache \
    && chown -R nextjs:nodejs /app \
    && node -e "const f=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(Date.UTC(2026,0,1,0,0))); if(!/8:00/.test(f)) throw new Error('ICU time zones missing: '+f); console.log('ICU ok:', f)"
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone output mirrors the workspace: /app/node_modules + /app/diskarte/server.js
COPY --from=builder --chown=nextjs:nodejs /repo/diskarte/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/diskarte/.next/static ./diskarte/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/diskarte/public ./diskarte/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "diskarte/server.js"]
