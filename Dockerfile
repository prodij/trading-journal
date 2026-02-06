# Build stage: install all deps + build frontend
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY app/package.json app/bun.lock* ./
RUN bun install --frozen-lockfile

COPY app/ .
RUN bunx vite build

# Production stage: only runtime deps
FROM oven/bun:1-alpine
WORKDIR /app

COPY app/package.json app/bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY app/src/server ./src/server
COPY app/schema.sql ./schema.sql

RUN mkdir -p /app/data

EXPOSE 3000
ENV PORT=3000

CMD ["bun", "run", "src/server/index.ts"]
