FROM oven/bun:1.3.14-alpine AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS builder

ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun run build
RUN find .next/standalone/node_modules/@img -mindepth 1 -maxdepth 1 \
    -type d \( -name 'sharp-linux-*' -o -name 'sharp-libvips-linux-*' \) \
    -exec rm -rf {} +

FROM oven/bun:1.3.14-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder --chown=bun:bun /app/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/.next/static ./.next/static

USER bun

EXPOSE 3000

CMD ["bun", "server.js"]
