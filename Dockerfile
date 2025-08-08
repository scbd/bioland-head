FROM node:24.4.0

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends yarn curl python3 build-essential && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package.json ./

RUN yarn install --force

COPY . ./

# RUN yarn build

ENV PORT=8000

EXPOSE 8000

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=8000



CMD ["node", "--max-http-header-size=32768",".output/server/index.mjs"]