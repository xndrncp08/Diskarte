# syntax=docker/dockerfile:1.7
# ----------------------------------------------------------------------------------------
# Diskarte — production image (Next.js standalone output)
#   docker build -t diskarte .
#   docker run -p 3000:3000 --env-file .env diskarte
# All configuration is read at runtime, so the same image works in every environment.
# ----------------------------------------------------------------------------------------
ARG NODE_IMAGE=node:22-alpine

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

# 3) Minimal runtime ------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server only needs the node binary: drop npm/yarn/corepack and headers
# (~30 MB) and run as an unprivileged user.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* /usr/local/include /usr/local/share/doc /usr/local/share/man \
    && addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
