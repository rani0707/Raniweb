# syntax=docker/dockerfile:1.7
FROM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk upgrade --no-cache

FROM base AS builder
ARG TARGETARCH
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --global npm@12.2.2 --ignore-scripts --no-audit --no-fund && \
    npm ci --ignore-scripts --no-audit --no-fund --prefer-offline
COPY . .
RUN --mount=type=cache,id=raniweb-next-${TARGETARCH},target=/app/.next/cache npm run check && npm run build

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache tini && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER 1001:1001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD node -e 'fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
