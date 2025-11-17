# ---- Base stage: install shared OS utilities and configure Yarn ----
FROM node:24-bookworm-slim AS base

ENV NODE_ENV=production
ENV PATH="/usr/src/app/node_modules/.bin:${PATH}"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

WORKDIR /usr/src/app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates dumb-init && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@4.5.0 --activate

# ---- Dependencies stage: prepare production node_modules shared with the runner ----
FROM base AS deps

ENV NODE_ENV=production

COPY package.json yarn.lock* .yarnrc.yml ./

RUN yarn install --immutable --mode=skip-build && \
    yarn plugin import workspace-tools || true && \
    (yarn workspaces focus --production nuxt-app || yarn workspaces focus --production || true)

# ---- Build stage: install toolchain and compile the Nuxt application ----
FROM base AS build

ENV NODE_ENV=development

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential python3 && \
    rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock* .yarnrc.yml ./

RUN yarn install --immutable --mode=skip-build

COPY . ./

RUN yarn build

# ---- Runner stage: assemble minimal production image with non-root user ----
FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production

WORKDIR /usr/src/app

RUN groupadd --system nodejs && useradd --system --gid nodejs nuxt

# Install runtime dependencies for sharp
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=base /usr/bin/dumb-init /usr/bin/dumb-init

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/.output ./.output

# Rebuild sharp for the correct platform in the runner stage
RUN npm rebuild sharp --platform=linux --arch=x64

ENV PORT=8000
ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=8000

EXPOSE 8000

USER nuxt

# Use dumb-init as PID 1 so Node receives signals cleanly and zombie processes are reaped.
CMD ["dumb-init", "node", ".output/server/index.mjs"]