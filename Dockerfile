# syntax=docker/dockerfile:1

# ---- deps: full install (incl. devDependencies) for the Next.js build ----
FROM node:22-slim AS deps
WORKDIR /app

# python3/make/g++ are needed by node-gyp to compile better-sqlite3's native
# binding. Same base image as the runtime stage, so the compiled binary is
# ABI-compatible when copied over below.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the Next.js app ----
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# ---- runtime: production deps only + built output + browser/OCR binaries ----
FROM node:22-slim AS runtime
WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    HOME=/tmp \
    HOST=0.0.0.0 \
    PORT=3000 \
    NODE_ENV=production

# python3/make/g++: rebuild better-sqlite3's native binding for this stage.
# tesseract-ocr(-eng): the OCR pipeline shells out to the system binary.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
      python3 make g++ \
      tesseract-ocr tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    # --with-deps installs the OS libraries Chromium needs (runs as root at
    # build time); chmod makes the browser tree readable by the non-root
    # runtime user set in docker-compose.yml.
    && node_modules/.bin/playwright install --with-deps chromium \
    && chmod -R a+rX /ms-playwright \
    && apt-get purge -y python3 make g++ \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.mjs ./next.config.mjs
# Read as a raw file at runtime (lib/db.ts), not bundled by webpack like the
# TS/JS it sits next to — must be copied explicitly.
COPY --from=build /app/lib/db/schema.sql ./lib/db/schema.sql

EXPOSE 3000
CMD ["npm", "start"]
